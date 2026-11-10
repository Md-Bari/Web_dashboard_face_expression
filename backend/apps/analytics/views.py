import csv
import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Avg, Max, Min
from django.http import FileResponse, HttpResponse
from rest_framework import views, status, permissions
from rest_framework.response import Response

from apps.courses.access import get_instructor_session
from . import snapshots
from .emotions import EMOTIONS, percentages
from .models import ExpressionSnapshot, ParticipantStat, SessionSnapshot, TeachingSuggestion
from .screen import screen_participant_id, screen_participant_name
from .serializers import SessionSnapshotSerializer, TeachingSuggestionSerializer
from .services import AggregationService

User = get_user_model()


def section_param(request):
    """The ?section=<id> filter of a request, or None."""
    try:
        return int(request.query_params.get('section'))
    except (TypeError, ValueError):
        return None


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


def build_report(session, section_id=None):
    """Session summary + per-student stats (optionally one section only), from stored labels/scores only."""
    snapshots = SessionSnapshot.objects.filter(session=session, total_students__gt=0)
    totals = snapshots.aggregate(
        avg=Avg('avg_concentration'),
        peak=Max('avg_concentration'),
        low=Min('avg_concentration'),
    )
    # Average share of each expression across the snapshots that had students
    class_share = [percentages(counts, total) for counts, total in snapshots.values_list('emotion_counts', 'total_students')]
    avg_emotion_pcts = {
        e: round(sum(s[e] for s in class_share) / len(class_share)) if class_share else 0 for e in EMOTIONS
    }

    # One row per student and per screen-capture participant, from the running totals
    # (predictions themselves are pruned after a while)
    sections = {
        e.student_id: e.section for e in session.course.enrollments.select_related('section')
    }
    students = []
    for stat in ParticipantStat.objects.filter(session=session, samples__gt=0).select_related('student'):
        if stat.student_id is None:
            name, section = screen_participant_name(stat.participant), None
        else:
            name = stat.student.get_full_name() or stat.student.username
            section = sections.get(stat.student_id)
        if section_id is not None and (section is None or section.id != section_id):
            continue
        students.append({
            'student_id': stat.student_id if stat.student_id is not None else screen_participant_id(stat.participant),
            'source': 'student' if stat.student_id is not None else 'screen',
            'name': name,
            'section': {'id': section.id, 'name': section.name} if section else None,
            'avg_attention': round(stat.attention_total / stat.samples * 100),
            'dominant_emotion': stat.dominant_emotion,
            'emotion_pcts': percentages(stat.emotion_counts, stat.samples),
            'avg_confidence': round(stat.confidence_total / stat.samples * 100),
            'samples': stat.samples,
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
            'avg_emotion_pcts': avg_emotion_pcts,
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
        return Response(build_report(session, section_param(request)))


class SessionReportCSVView(InstructorSessionMixin, views.APIView):
    def get(self, request, session_id):
        session = self.get_session(request, session_id)
        if not session:
            return self.not_found()
        report = build_report(session, section_param(request))

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="session-{session.id}-report.csv"'
        writer = csv.writer(response)
        writer.writerow(['EMP-EDU session report', session.title, session.status])
        writer.writerow([])
        writer.writerow(['Metric', 'Value'])
        for key, value in report['summary'].items():
            if key == 'avg_emotion_pcts':
                for emotion, pct in value.items():
                    writer.writerow([f'avg_{emotion}_pct', pct])
            else:
                writer.writerow([key, value])
        writer.writerow([])
        writer.writerow(['Student', 'Section', 'Avg attention %', 'Dominant emotion', 'Avg confidence %', 'Samples']
                        + [f'{e} %' for e in EMOTIONS])
        for s in report['students']:
            writer.writerow([s['name'], (s['section'] or {}).get('name', ''), s['avg_attention'], s['dominant_emotion'],
                             s['avg_confidence'], s['samples']] + [s['emotion_pcts'][e] for e in EMOTIONS])
        writer.writerow([])
        writer.writerow(['Timestamp', 'Avg concentration %'])
        for point in report['timeline']:
            writer.writerow([point['timestamp'], point['concentration']])
        return response


class ExpressionSnapshotListView(InstructorSessionMixin, views.APIView):
    """The session's first-seen expression photos, one row per enrolled student (photos may be missing)."""

    def get(self, request, session_id):
        session = self.get_session(request, session_id)
        if not session:
            return self.not_found()
        photos = {}
        for snap in ExpressionSnapshot.objects.filter(session=session).select_related('student'):
            photos.setdefault(snap.student_id, {})[snap.emotion] = {
                'id': snap.id,
                'confidence': round(snap.confidence * 100),
                'created_at': snap.created_at.isoformat(),
                'url': f'/api/analytics/sessions/{session.id}/expression-snapshots/{snap.id}/image/',
            }
        students = []
        for enrollment in (session.attendee_enrollments()
                           .order_by('student__first_name', 'student__username')):
            student = enrollment.student
            students.append({
                'student_id': student.id,
                'name': student.get_full_name() or student.username,
                'username': student.username,
                'section': {'id': enrollment.section_id, 'name': enrollment.section.name} if enrollment.section else None,
                'photos': photos.pop(student.id, {}),
            })
        # Students who were unenrolled after their photos were taken
        for student_id, student_photos in photos.items():
            student = User.objects.filter(id=student_id).first()
            students.append({
                'student_id': student_id,
                'name': (student.get_full_name() or student.username) if student else f'Student {student_id}',
                'username': student.username if student else '',
                'section': None,
                'photos': student_photos,
            })
        return Response({'emotions': list(EMOTIONS), 'students': students})


class ExpressionSnapshotDetailView(InstructorSessionMixin, views.APIView):
    """DELETE one stored photo; that expression is captured again on the student's next clear sighting."""

    def delete(self, request, session_id, snapshot_id):
        session = self.get_session(request, session_id)
        snap = ExpressionSnapshot.objects.filter(id=snapshot_id, session_id=session_id).first() if session else None
        if not snap:
            return Response({'error': 'Photo not found'}, status=status.HTTP_404_NOT_FOUND)
        snapshots.remove(snap)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExpressionSnapshotImageView(InstructorSessionMixin, views.APIView):
    """One stored photo. Served through the API (never a public URL) so only the session's instructor sees it."""

    def get(self, request, session_id, snapshot_id):
        session = self.get_session(request, session_id)
        snap = ExpressionSnapshot.objects.filter(id=snapshot_id, session_id=session_id).first() if session else None
        path = os.path.join(settings.MEDIA_ROOT, snap.image) if snap else None
        if not path or not os.path.isfile(path):
            return self.not_found()
        response = FileResponse(open(path, 'rb'), content_type='image/jpeg')
        # Re-checked on every view: a shared browser must not show another instructor's cached photo
        response['Cache-Control'] = 'private, no-cache'
        return response
