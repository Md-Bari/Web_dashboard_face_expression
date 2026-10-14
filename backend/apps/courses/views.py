from asgiref.sync import async_to_sync
from django.conf import settings
from channels.layers import get_channel_layer
from rest_framework import viewsets, permissions, status, views
from rest_framework.decorators import action
from rest_framework.response import Response
from .access import user_is_instructor
from .models import Course, Enrollment, ClassSession
from .serializers import CourseSerializer, ClassSessionSerializer


class IsInstructorOrReadOnly(permissions.BasePermission):
    """Everyone signed in may read what get_queryset exposes; only instructors/admins may write."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in permissions.SAFE_METHODS or user_is_instructor(request.user)


class CourseViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSerializer
    permission_classes = [IsInstructorOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Course.objects.all()
        if user.role == 'instructor':
            # Instructors only see their own courses
            return Course.objects.filter(instructor=user)
        # Students see courses they are enrolled in
        return Course.objects.filter(enrollments__student=user)

    def perform_create(self, serializer):
        serializer.save(instructor=self.request.user)


class ClassSessionViewSet(viewsets.ModelViewSet):
    serializer_class = ClassSessionSerializer
    permission_classes = [IsInstructorOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return ClassSession.objects.all()
        if user.role == 'instructor':
            # Instructors only see sessions of their courses
            return ClassSession.objects.filter(course__instructor=user)
        # Students see sessions of courses they belong to
        return ClassSession.objects.filter(course__enrollments__student=user)

    @action(detail=False, methods=['get'])
    def current(self, request):
        """
        Returns the active or most recent LIVE class session for the instructor.
        """
        user = request.user
        qs = self.get_queryset()
        
        # Look for live session first
        session = qs.filter(status='LIVE').order_by('-started_at').first()
        if not session:
            # Fallback to any recent session or first available
            session = qs.order_by('-id').first()

        if not session:
            return Response({'detail': 'No active session found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(session)
        return Response(serializer.data)

    def _change_status(self, request, transition):
        session = self.get_object()
        if not user_is_instructor(request.user):
            return None, Response({'detail': 'Only instructors can change a session.'},
                                  status=status.HTTP_403_FORBIDDEN)
        transition(session)
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(f"session_{session.id}", {
                "type": "broadcast_session_status",
                "session": {
                    "id": session.id,
                    "title": session.title,
                    "status": session.status,
                    "started_at": session.started_at.isoformat() if session.started_at else None,
                    "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                },
            })
        return session, None

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        session, error = self._change_status(request, ClassSession.end_session)
        if error:
            return error
        return Response({'detail': 'Session ended successfully.', 'status': session.status})

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        session, error = self._change_status(request, ClassSession.start_session)
        if error:
            return error
        return Response({'detail': 'Session started successfully.', 'status': session.status})


class PublicLiveSessionView(views.APIView):
    """
    Minimal, unauthenticated description of the currently LIVE session so the student
    portal can offer a roster to join as (guest flow). Exposes names and avatars only.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if not settings.ALLOW_GUEST_STUDENTS:
            return Response({'detail': 'Guest access is disabled.'}, status=status.HTTP_403_FORBIDDEN)
        session = ClassSession.objects.select_related('course').filter(status='LIVE').order_by('-started_at').first()
        if not session:
            return Response({'detail': 'No live session right now.'}, status=status.HTTP_404_NOT_FOUND)
        students = [
            {'id': e.student_id, 'name': e.student.get_full_name() or e.student.username,
             'avatar_url': e.student.avatar_url}
            for e in session.course.enrollments.select_related('student').order_by('student_id')
        ]
        return Response({'id': session.id, 'title': session.title, 'course': session.course.title,
                         'students': students})
