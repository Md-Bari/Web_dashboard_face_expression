import csv

from django.db.models import Avg, Count, Max, Min
from django.http import HttpResponse
from rest_framework import views, status, permissions
from rest_framework.response import Response

from apps.courses.access import get_instructor_session
from .models import Prediction, SessionSnapshot, TeachingSuggestion
from .serializers import SessionSnapshotSerializer, TeachingSuggestionSerializer
from .services import AggregationService


class InstructorSessionMixin:
    """Every analytics endpoint is restricted to the instructor who owns the session's course."""
    permission_classes = [permissions.IsAuthenticated]

    def get_session(self, request, session_id):
        return get_instructor_session(request.user, session_id)

    @staticmethod
    def not_found():
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)


class SessionHistoryView(InstructorSessionMixin, views.APIView):
    def get(self, request, session_id):
        if not self.get_session(request, session_id):
            return self.not_found()
        snapshots = SessionSnapshot.objects.filter(session_id=session_id).order_by('-timestamp')[:120]
        serializer = SessionSnapshotSerializer(reversed(list(snapshots)), many=True)
        return Response(serializer.data)


class TeachingSuggestionsView(InstructorSessionMixin, views.APIView):
    def get(self, request, session_id):
        if not self.get_session(request, session_id):
            return self.not_found()
        include_dismissed = request.query_params.get('all') == '1'
        suggestions = TeachingSuggestion.objects.filter(session_id=session_id)
        if not include_dismissed:
            suggestions = suggestions.filter(is_dismissed=False)
        serializer = TeachingSuggestionSerializer(suggestions.order_by('-created_at')[:50], many=True)
        return Response(serializer.data)

    def post(self, request, session_id):
        if not self.get_session(request, session_id):
            return self.not_found()
        suggestion_id = request.data.get('suggestion_id')
        if not suggestion_id:
            return Response({'error': 'suggestion_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        TeachingSuggestion.objects.filter(id=suggestion_id, session_id=session_id).update(is_dismissed=True)
        return Response({'status': 'dismissed'})


class AggregateSessionView(InstructorSessionMixin, views.APIView):
    def post(self, request, session_id):
        if not self.get_session(request, session_id):
            return self.not_found()
        snapshot = AggregationService.aggregate_session(session_id)
        if not snapshot:
            return self.not_found()
        return Response(SessionSnapshotSerializer(snapshot).data)


def build_report(session):
    """Session summary + per-student stats, computed from stored labels/scores only."""
    snapshots = SessionSnapshot.objects.filter(session=session, total_students__gt=0)
    totals = snapshots.aggregate(
        avg=Avg('avg_concentration'),
        peak=Max('avg_concentration'),
        low=Min('avg_concentration'),
        pos=Avg('positive_pct'),
        neu=Avg('neutral_pct'),
        neg=Avg('negative_pct'),
    )

    preds = Prediction.objects.filter(session=session)
    per_student = {
        row['student']: row
        for row in preds.values('student', 'student__first_name', 'student__last_name', 'student__username')
        .annotate(avg_attention=Avg('smoothed_attention'), samples=Count('id'), avg_confidence=Avg('confidence'))
    }
    dominant = {}
    for row in preds.values('student', 'smoothed_emotion').annotate(n=Count('id')):
        best = dominant.get(row['student'])
        if best is None or row['n'] > best[1]:
            dominant[row['student']] = (row['smoothed_emotion'], row['n'])

    students = []
    for student_id, row in per_student.items():
        name = f"{row['student__first_name']} {row['student__last_name']}".strip() or row['student__username']
        students.append({
            'student_id': student_id,
            'name': name,
            'avg_attention': round((row['avg_attention'] or 0) * 100),
            'dominant_emotion': dominant.get(student_id, ('neutral', 0))[0],
            'avg_confidence': round((row['avg_confidence'] or 0) * 100),
            'samples': row['samples'],
        })
    students.sort(key=lambda s: s['avg_attention'])

    def rnd(value):
        return round(value) if value is not None else 0

    return {
        'session': {
            'id': session.id,
            'title': session.title,
            'status': session.status,
            'started_at': session.started_at.isoformat() if session.started_at else None,
            'ended_at': session.ended_at.isoformat() if session.ended_at else None,
        },
        'summary': {
            'snapshots': snapshots.count(),
            'avg_concentration': rnd(totals['avg']),
            'peak_concentration': rnd(totals['peak']),
            'lowest_concentration': rnd(totals['low']),
            'avg_positive_pct': rnd(totals['pos']),
            'avg_neutral_pct': rnd(totals['neu']),
            'avg_negative_pct': rnd(totals['neg']),
            'suggestions_generated': TeachingSuggestion.objects.filter(session=session).count(),
        },
        'students': students,
        'timeline': AggregationService.build_timeline(session.id, limit=60),
    }


class SessionReportView(InstructorSessionMixin, views.APIView):
    def get(self, request, session_id):
        session = self.get_session(request, session_id)
        if not session:
            return self.not_found()
        return Response(build_report(session))


class SessionReportCSVView(InstructorSessionMixin, views.APIView):
    def get(self, request, session_id):
        session = self.get_session(request, session_id)
        if not session:
            return self.not_found()
        report = build_report(session)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="session-{session.id}-report.csv"'
        writer = csv.writer(response)
        writer.writerow(['EMP-EDU session report', session.title, session.status])
        writer.writerow([])
        writer.writerow(['Metric', 'Value'])
        for key, value in report['summary'].items():
            writer.writerow([key, value])
        writer.writerow([])
        writer.writerow(['Student', 'Avg attention %', 'Dominant emotion', 'Avg confidence %', 'Samples'])
        for s in report['students']:
            writer.writerow([s['name'], s['avg_attention'], s['dominant_emotion'], s['avg_confidence'], s['samples']])
        writer.writerow([])
        writer.writerow(['Timestamp', 'Avg concentration %'])
        for point in report['timeline']:
            writer.writerow([point['timestamp'], point['concentration']])
        return response
