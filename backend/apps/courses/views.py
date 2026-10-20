import csv
import io
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Case, IntegerField, Q, Value, When
from rest_framework import viewsets, permissions, status, views
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from apps.accounts.serializers import UserSerializer
from apps.accounts.views import set_jwt_cookies
from . import livekit, services
from .access import get_instructor_session, user_is_instructor
from .models import Course, Enrollment, ClassSession, Section
from .serializers import (
    ClassSessionSerializer, CourseSerializer, EnrollmentSerializer, SectionSerializer, StudentRegistrationSerializer,
)

User = get_user_model()


class IsInstructorOrReadOnly(permissions.BasePermission):
    """Everyone signed in may read what get_queryset exposes; only instructors/admins may write."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in permissions.SAFE_METHODS or user_is_instructor(request.user)


class IsInstructor(permissions.BasePermission):
    def has_permission(self, request, view):
        return user_is_instructor(request.user)


def managed_courses(user):
    """Classes this instructor (or admin) may manage."""
    return Course.objects.all() if user.is_admin else Course.objects.filter(instructor=user)


def display_name(user):
    return user.get_full_name() or user.username


def only_section(course):
    """
    The section a link without one puts a new student in: every student must be in a section, so
    this is the class's single section (created as "A" if it has none); None when the class has
    several sections - then only a section invite link can place the student.
    """
    sections = list(course.sections.all()[:2])
    if not sections:
        return Section.objects.create(course=course, name='A')
    return sections[0] if len(sections) == 1 else None


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
        course = serializer.save(instructor=self.request.user)
        Section.objects.create(course=course, name='A')  # a new class starts with one section


class SectionViewSet(viewsets.ModelViewSet):
    """Sections of the instructor's classes. Deleting one leaves its students in the class, unassigned."""
    serializer_class = SectionSerializer
    permission_classes = [IsInstructor]

    def get_queryset(self):
        qs = Section.objects.filter(course__in=managed_courses(self.request.user)).select_related('course')
        course = self.request.query_params.get('course')
        return qs.filter(course_id=course) if course and course.isdigit() else qs


class EnrollmentViewSet(viewsets.ModelViewSet):
    """
    Students of the instructor's classes: list (?course=&section=, section=none for unassigned),
    add an existing student account by username or email, move between sections, remove,
    and import a CSV of usernames/emails.
    """
    serializer_class = EnrollmentSerializer
    permission_classes = [IsInstructor]
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = (Enrollment.objects.filter(course__in=managed_courses(self.request.user))
              .select_related('student', 'section', 'course').order_by('student__first_name', 'student__username'))
        params = self.request.query_params
        if params.get('course', '').isdigit():
            qs = qs.filter(course_id=params['course'])
        section = params.get('section', '')
        if section == 'none':
            qs = qs.filter(section__isnull=True)
        elif section.isdigit():
            qs = qs.filter(section_id=section)
        return qs

    def _course(self, course_id):
        try:
            return managed_courses(self.request.user).get(id=int(course_id))
        except (TypeError, ValueError, Course.DoesNotExist):
            raise PermissionDenied('Pick one of your classes.')

    @staticmethod
    def _section(course, section_id):
        if section_id in (None, ''):
            return None
        section = course.sections.filter(id=section_id).first() if str(section_id).isdigit() else None
        if section is None:
            raise PermissionDenied('That section is not in this class.')
        return section

    @staticmethod
    def find_student(identifier):
        identifier = (identifier or '').strip()
        if not identifier:
            return None
        field = 'email__iexact' if '@' in identifier and '.' in identifier.split('@')[-1] else 'username__iexact'
        return User.objects.filter(**{field: identifier}).first()

    def create(self, request):
        course = self._course(request.data.get('course_id'))
        section = self._section(course, request.data.get('section_id'))
        if section is None:
            return Response({'detail': 'Choose the section to add the student to.'}, status=status.HTTP_400_BAD_REQUEST)
        student = self.find_student(request.data.get('identifier'))
        if student is None:
            return Response({'detail': 'No account with that username or email. Send them the section invite link '
                                       'so they can create one.'}, status=status.HTTP_404_NOT_FOUND)
        if student.role != 'student':
            return Response({'detail': f'{student.username} is not a student account.'}, status=status.HTTP_400_BAD_REQUEST)
        enrollment, created = Enrollment.objects.get_or_create(course=course, student=student,
                                                               defaults={'section': section})
        if not created:
            where = f'Section {enrollment.section.name}' if enrollment.section else 'no section'
            return Response({'detail': f'{display_name(student)} is already in this class ({where}).'},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(EnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='import')
    def import_csv(self, request):
        """
        CSV with one student per row: username or email in the first column and, optionally, a
        section name in the second (missing sections are created). Rows without a section go to
        `section_id`, which is required. Only existing student accounts can be added.
        """
        course = self._course(request.data.get('course_id'))
        default_section = self._section(course, request.data.get('section_id'))
        if default_section is None:
            return Response({'detail': 'Choose the section for rows without one.'}, status=status.HTTP_400_BAD_REQUEST)
        upload = request.FILES.get('file')
        text = upload.read().decode('utf-8-sig', errors='replace') if upload else str(request.data.get('csv', ''))
        if len(text) > 200_000:
            return Response({'detail': 'The file is too large (at most 200 KB).'}, status=status.HTTP_400_BAD_REQUEST)

        result = {'added': [], 'moved': [], 'already': [], 'not_found': [], 'not_student': []}
        sections = {s.name.lower(): s for s in course.sections.all()}
        for row in csv.reader(io.StringIO(text)):
            cells = [c.strip() for c in row]
            if not cells or not cells[0] or cells[0].lower() in ('username', 'email', 'username or email', 'student'):
                continue
            identifier, section_name = cells[0], (cells[1] if len(cells) > 1 else '')
            student = self.find_student(identifier)
            if student is None:
                result['not_found'].append(identifier)
                continue
            if student.role != 'student':
                result['not_student'].append(identifier)
                continue
            section = default_section
            if section_name:
                section = sections.get(section_name.lower())
                if section is None:
                    section = sections[section_name.lower()] = Section.objects.create(course=course, name=section_name[:50])
            enrollment, created = Enrollment.objects.get_or_create(course=course, student=student,
                                                                   defaults={'section': section})
            if created:
                result['added'].append(display_name(student))
            elif section is not None and enrollment.section_id != section.id:
                enrollment.section = section
                enrollment.save(update_fields=['section'])
                result['moved'].append(display_name(student))
            else:
                result['already'].append(display_name(student))
        return Response(result)


def session_order(qs):
    """Live first, then upcoming (soonest first), then the rest (newest first)."""
    return qs.annotate(rank=Case(
        When(status='LIVE', then=Value(0)), When(status='SCHEDULED', then=Value(1)), default=Value(2),
        output_field=IntegerField(),
    )).order_by('rank', 'scheduled_for', '-created_at')


def student_sessions(user):
    """Sessions a student may attend: their classes, and only sessions for their section (or the whole class)."""
    return ClassSession.objects.filter(course__enrollments__student=user).filter(
        Q(sections__isnull=True) | Q(sections__enrollments__student=user)
    ).distinct()


class ClassSessionViewSet(viewsets.ModelViewSet):
    serializer_class = ClassSessionSerializer
    permission_classes = [IsInstructorOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            qs = ClassSession.objects.all()
        elif user.role == 'instructor':
            # Instructors only see sessions of their courses
            qs = ClassSession.objects.filter(course__instructor=user)
        else:
            qs = student_sessions(user)
        params = self.request.query_params
        if params.get('course', '').isdigit():
            qs = qs.filter(course_id=params['course'])
        if params.get('status') in ('SCHEDULED', 'LIVE', 'ENDED'):
            qs = qs.filter(status=params['status'])
        return session_order(qs.select_related('course', 'course__instructor').prefetch_related('sections'))

    def perform_destroy(self, instance):
        if instance.status == 'LIVE':
            raise PermissionDenied('End the session before deleting it.')
        instance.delete()

    @action(detail=False, methods=['get'])
    def current(self, request):
        """
        Returns the active or most recent LIVE class session for the instructor.
        """
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
        return session, None

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        session, error = self._change_status(request, services.end_session)
        if error:
            return error
        return Response({'detail': 'Session ended successfully.', 'status': session.status})

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        session, error = self._change_status(request, services.start_session)
        if error:
            return error
        return Response({'detail': 'Session started successfully.', 'status': session.status})

    # ------------------------------------------------------------------ video meeting

    # Students may ask too (POST): the role checks are inside
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def meeting(self, request, pk=None):
        """
        A pass for this session's video meeting. The instructor joins as host; a student must be
        in the session's class and sections and must have accepted the camera consent (send
        {"consent": true} to accept it here).
        """
        session = self.get_object()
        if not livekit.configured():
            return Response({'detail': 'Video meetings are not set up on the server (LIVEKIT_* settings).'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        user = request.user
        host = get_instructor_session(user, session.id) is not None
        if not host:
            if user.role != 'student':
                return Response({'detail': 'Only the class instructor and its students can join.'},
                                status=status.HTTP_403_FORBIDDEN)
            enrollment = session.course.enrollments.filter(student=user).first()
            if not session.allows(enrollment):
                return Response({'detail': 'This class session is for another section.'}, status=status.HTTP_403_FORBIDDEN)
            if request.data.get('consent') is True and not user.consent_given:
                user.give_consent()
            if not user.consent_given:
                return Response({'detail': 'Accept the camera consent to join.', 'code': 'consent_required'},
                                status=status.HTTP_403_FORBIDDEN)
        if session.status != 'LIVE':
            return Response({'detail': 'The class has not started yet.', 'code': 'not_live', 'status': session.status},
                            status=status.HTTP_409_CONFLICT)

        identity = f"user-{user.id}"
        token = livekit.access_token(
            session.room_name, identity, display_name(user), host=host,
            metadata={'user_id': user.id, 'role': 'host' if host else 'student'},
        )
        return Response({
            'url': settings.LIVEKIT_URL,
            'token': token,
            'room': session.room_name,
            'identity': identity,
            'host': host,
        })

    @action(detail=True, methods=['post'])
    def moderate(self, request, pk=None):
        """Host only: {"action": "remove", "identity"} or {"action": "mute", "identity", "track_sid"}."""
        session = get_instructor_session(request.user, pk)
        if session is None:
            return Response({'detail': 'Only the class instructor can do that.'}, status=status.HTTP_403_FORBIDDEN)
        identity = str(request.data.get('identity', ''))
        if not re.fullmatch(r'user-\d+', identity) or identity == f"user-{request.user.id}":
            return Response({'detail': 'Pick a participant.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            if request.data.get('action') == 'remove':
                livekit.remove_participant(session.room_name, identity)
            elif request.data.get('action') == 'mute' and request.data.get('track_sid'):
                livekit.mute_track(session.room_name, identity, str(request.data['track_sid']))
            else:
                return Response({'detail': 'Unknown action.'}, status=status.HTTP_400_BAD_REQUEST)
        except livekit.LiveKitError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'ok': True})


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


class SignupThrottle(AnonRateThrottle):
    rate = '20/hour'


def signed_in_response(user, payload, request):
    refresh = RefreshToken.for_user(user)
    response = Response({'user': UserSerializer(user).data, **payload}, status=status.HTTP_201_CREATED)
    set_jwt_cookies(response, str(refresh.access_token), str(refresh), secure=request.is_secure())
    return response


# ---------------------------------------------------------------- class / section invite (/join/<code>)

def _live_session(course, section=None):
    sessions = course.sessions.filter(status='LIVE').order_by('-started_at')
    for session in sessions:
        section_ids = set(session.sections.values_list('id', flat=True))
        if not section_ids or (section is not None and section.id in section_ids):
            return {'id': session.id, 'title': session.title, 'join_code': session.join_code}
    return None


def _join_target(code):
    """
    (course, section) behind an invite code. Invites are per section; an older class-wide code
    still works while the class has a single section, otherwise its section is None.
    """
    code = (code or '').upper()
    section = Section.objects.select_related('course__instructor').filter(join_code=code).first()
    if section:
        return section.course, section
    course = Course.objects.select_related('instructor').filter(join_code=code).first()
    return course, (only_section(course) if course else None)


NO_SECTION = "This link does not say which section you are in. Ask your instructor for your section's invite link."


def enroll_by_invite(course, section, student):
    enrollment, created = Enrollment.objects.get_or_create(course=course, student=student,
                                                           defaults={'section': section})
    if not created and enrollment.section_id is None:
        enrollment.section = section  # placed in a section; an existing placement is never changed by a link
        enrollment.save(update_fields=['section'])
    return enrollment


class JoinInfoView(views.APIView):
    """Public: what an invite link leads to (class, section, instructor, whether a session is live)."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, code):
        course, section = _join_target(code)
        if not course:
            return Response({'detail': 'This join link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        if section is None:
            return Response({'detail': NO_SECTION}, status=status.HTTP_404_NOT_FOUND)
        instructor = course.instructor
        return Response({
            'course': {'code': course.code, 'title': course.title},
            'section': section.name if section else None,
            'instructor': instructor.display_title or instructor.get_full_name() or instructor.username,
            'live_session': _live_session(course, section),
        })


class JoinEnrollView(views.APIView):
    """A signed-in student joins the class (and section) behind the link."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, code):
        course, section = _join_target(code)
        if not course or section is None:
            return Response({'detail': NO_SECTION if course else 'This join link is not valid.'},
                            status=status.HTTP_404_NOT_FOUND)
        if request.user.role != 'student':
            return Response({'detail': 'Only student accounts can join a class.'}, status=status.HTTP_403_FORBIDDEN)
        enrollment = enroll_by_invite(course, section, request.user)
        return Response({'enrolled': True, 'live_session': _live_session(course, enrollment.section)})


class JoinRegisterThrottle(SignupThrottle):
    pass


class JoinRegisterView(views.APIView):
    """Create a student account from an invite link, enroll it (in the section) and sign it in."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [JoinRegisterThrottle]

    def post(self, request, code):
        course, section = _join_target(code)
        if not course or section is None:
            return Response({'detail': NO_SECTION if course else 'This join link is not valid.'},
                            status=status.HTTP_404_NOT_FOUND)
        serializer = StudentRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        enrollment = enroll_by_invite(course, section, user)
        return signed_in_response(user, {'live_session': _live_session(course, enrollment.section)}, request)


# ---------------------------------------------------------------- meeting link (/meet/<code>)

def _meet_session(code):
    return (ClassSession.objects.select_related('course__instructor').prefetch_related('sections')
            .filter(join_code=(code or '').upper()).first())


def meet_target_section(session):
    """The section a meeting link puts a new student in, or None when the link cannot tell."""
    sections = list(session.sections.all())
    if len(sections) == 1:
        return sections[0]
    return only_section(session.course) if not sections else None


def meet_enrollment(session, student):
    """
    The student's enrollment for a meeting link, adding them when the link makes the section
    clear (a session for one section, or a whole-class session of a one-section class).
    Returns (enrollment or None, reason it is refused).
    """
    enrollment = session.course.enrollments.filter(student=student).select_related('section').first()
    sections = list(session.sections.all())
    if enrollment is not None:
        if session.allows(enrollment):
            return enrollment, None
        names = ', '.join(s.name for s in sections)
        return None, f"This class session is for section {names}; you are in " + (
            f"section {enrollment.section.name}." if enrollment.section else "no section yet. Ask your instructor.")
    section = meet_target_section(session)
    if section is None:
        return None, "This class has several sections. Ask your instructor for your section's invite link."
    return Enrollment.objects.create(course=session.course, student=student, section=section), None


class MeetInfoView(views.APIView):
    """What a meeting link leads to, and whether the visitor can join (works signed in or not)."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, code):
        session = _meet_session(code)
        if session is None:
            return Response({'detail': 'This meeting link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        instructor = session.course.instructor
        user = request.user
        viewer = {'signed_in': user.is_authenticated}
        if user.is_authenticated:
            host = get_instructor_session(user, session.id) is not None
            enrollment = session.course.enrollments.filter(student=user).select_related('section').first()
            viewer.update({
                'name': display_name(user),
                'role': user.role,
                'host': host,
                'enrolled': enrollment is not None,
                'allowed': host or session.allows(enrollment),
                'consent_given': user.consent_given,
            })
        return Response({
            'session': {
                'id': session.id,
                'title': session.title,
                'status': session.status,
                'scheduled_for': session.scheduled_for.isoformat() if session.scheduled_for else None,
                'started_at': session.started_at.isoformat() if session.started_at else None,
                'sections': [s.name for s in session.sections.all()],
            },
            'course': {'code': session.course.code, 'title': session.course.title},
            'instructor': instructor.display_title or instructor.get_full_name() or instructor.username,
            'meetings_enabled': livekit.configured(),
            # New students can sign up here only when the link decides their section
            'can_register': meet_target_section(session) is not None,
            'viewer': viewer,
        })


class MeetEnrollView(views.APIView):
    """A signed-in student uses the meeting link: checked (and if needed added) to the class."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, code):
        session = _meet_session(code)
        if session is None:
            return Response({'detail': 'This meeting link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role != 'student':
            return Response({'detail': 'Only student accounts can join as a student.'}, status=status.HTTP_403_FORBIDDEN)
        enrollment, reason = meet_enrollment(session, request.user)
        if enrollment is None:
            return Response({'detail': reason}, status=status.HTTP_403_FORBIDDEN)
        return Response({'allowed': True, 'session_id': session.id})


class MeetRegisterView(views.APIView):
    """Create a student account from a meeting link (when the link decides the section) and sign it in."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SignupThrottle]

    def post(self, request, code):
        session = _meet_session(code)
        if session is None:
            return Response({'detail': 'This meeting link is not valid.'}, status=status.HTTP_404_NOT_FOUND)
        if meet_target_section(session) is None:
            return Response({'detail': "This class has several sections. Ask your instructor for your section's "
                                       "invite link."}, status=status.HTTP_403_FORBIDDEN)
        serializer = StudentRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        meet_enrollment(session, user)
        return signed_in_response(user, {'session_id': session.id}, request)
