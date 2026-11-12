"""
Admin portal API (/api/admin/...): create and manage instructor accounts, see every instructor
and student, and read the activity log. Admin accounts only.
"""
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions, serializers, status, views
from rest_framework.response import Response

from apps.courses.models import ClassSession, Course, Enrollment
from . import activity
from .models import ActivityLog, User

LOG_PAGE_SIZE = 50


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)


class AdminView(views.APIView):
    permission_classes = [IsAdmin]


def name_of(user):
    return user.get_full_name() or user.username


def account_row(user):
    return {
        'id': user.id,
        'username': user.username,
        'name': name_of(user),
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email,
        'display_title': user.display_title,
        'role': user.role,
        'is_active': user.is_active,
        'date_joined': user.date_joined.isoformat(),
        'last_login': user.last_login.isoformat() if user.last_login else None,
    }


def log_row(entry):
    return {
        'id': entry.id,
        'user_id': entry.user_id,
        'username': entry.username,
        'name': name_of(entry.user) if entry.user else entry.username,
        'role': entry.role,
        'action': entry.action,
        'label': activity.ACTIONS.get(entry.action, entry.action.replace('_', ' ').capitalize()),
        'detail': entry.detail,
        'ip_address': entry.ip_address,
        'user_agent': entry.user_agent,
        'created_at': entry.created_at.isoformat(),
    }


class OverviewView(AdminView):
    """Counts, live classes right now and the latest activity."""

    def get(self, request):
        now = timezone.now()
        day_ago = now - timedelta(hours=24)
        users = User.objects.all()
        live = (ClassSession.objects.filter(status='LIVE').select_related('course__instructor')
                .order_by('-started_at'))
        return Response({
            'counts': {
                'instructors': users.filter(role='instructor').count(),
                'active_instructors': users.filter(role='instructor', is_active=True).count(),
                'students': users.filter(role='student').count(),
                'courses': Course.objects.count(),
                'sessions': ClassSession.objects.count(),
                'live_sessions': live.count(),
                'logins_24h': ActivityLog.objects.filter(action='login', created_at__gte=day_ago).count(),
                'failed_logins_24h': ActivityLog.objects.filter(action='login_failed', created_at__gte=day_ago).count(),
            },
            'live_sessions': [{
                'id': s.id,
                'title': s.title,
                'course': f'{s.course.code} {s.course.title}',
                'instructor': name_of(s.course.instructor),
                'started_at': s.started_at.isoformat() if s.started_at else None,
                'attendees': s.attendee_enrollments().count(),
            } for s in live[:20]],
            'recent_activity': [log_row(e) for e in ActivityLog.objects.select_related('user')[:15]],
        })


class InstructorCreateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    username = serializers.RegexField(r'^[\w.@+-]{3,150}$', error_messages={
        'invalid': 'Use 3-150 letters, digits or . @ + - _ (no spaces).',
    })
    email = serializers.EmailField(required=False, allow_blank=True)
    display_title = serializers.CharField(max_length=100, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is taken.')
        return value

    def validate_first_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a first name.')
        return value


class AccountUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    display_title = serializers.CharField(max_length=100, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    password = serializers.CharField(write_only=True, required=False)


class InstructorListView(AdminView):
    """GET every instructor with their class counts; POST creates an instructor account."""

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        qs = User.objects.filter(role='instructor')
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q)
                           | Q(email__icontains=q))
        qs = qs.annotate(
            course_count=Count('instructed_courses', distinct=True),
            session_count=Count('instructed_courses__sessions', distinct=True),
            student_count=Count('instructed_courses__enrollments__student', distinct=True),
            live_count=Count('instructed_courses__sessions',
                             filter=Q(instructed_courses__sessions__status='LIVE'), distinct=True),
        ).order_by('first_name', 'username')
        return Response([{
            **account_row(u),
            'courses': u.course_count,
            'sessions': u.session_count,
            'students': u.student_count,
            'live_sessions': u.live_count,
        } for u in qs])

    def post(self, request):
        serializer = InstructorCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User(
            role='instructor', username=data['username'], first_name=data['first_name'],
            last_name=data.get('last_name', ''), email=data.get('email', ''),
            display_title=data.get('display_title', ''),
        )
        user.set_password(data['password'])
        user.save()
        activity.log(request, 'instructor_created', f'{user.username} ({name_of(user)})')
        return Response(account_row(user), status=status.HTTP_201_CREATED)


class AccountDetailView(AdminView):
    """PATCH an instructor or student: name, e-mail, title, a new password, or enable/disable sign-in."""

    def patch(self, request, user_id):
        user = User.objects.filter(id=user_id).exclude(role='admin').exclude(is_superuser=True).first()
        if user is None:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = AccountUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        changed = []
        password = data.pop('password', None)
        if password:
            user.set_password(password)
            changed.append('password')
        active = data.pop('is_active', None)
        for field, value in data.items():
            setattr(user, field, value.strip() if isinstance(value, str) else value)
            changed.append(field)
        if active is not None and active != user.is_active:
            user.is_active = active
        user.save()
        if active is not None:
            activity.log(request, 'account_enabled' if active else 'account_disabled', user.username)
        if changed:
            activity.log(request, 'account_updated', f"{user.username}: {', '.join(changed)}")
        return Response(account_row(user))


class StudentListView(AdminView):
    """Every student with the classes they are in."""

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        qs = User.objects.filter(role='student')
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q)
                           | Q(email__icontains=q))
        students = list(qs.order_by('first_name', 'username')[:500])
        classes = {}
        for e in (Enrollment.objects.filter(student__in=students)
                  .select_related('course__instructor', 'section').order_by('course__code')):
            classes.setdefault(e.student_id, []).append({
                'course': e.course.code,
                'title': e.course.title,
                'section': e.section.name if e.section else None,
                'instructor': name_of(e.course.instructor),
            })
        return Response([{
            **account_row(s),
            'consent_given': s.consent_given,
            'classes': classes.get(s.id, []),
        } for s in students])


class ActivityLogView(AdminView):
    """The activity log, newest first: ?role=&action=&user=<id>&q=&page=."""

    def get(self, request):
        params = request.query_params
        qs = ActivityLog.objects.select_related('user')
        if params.get('role') in ('admin', 'instructor', 'student'):
            qs = qs.filter(role=params['role'])
        elif params.get('role') == 'unknown':
            qs = qs.filter(user__isnull=True)
        if params.get('action') in activity.ACTIONS:
            qs = qs.filter(action=params['action'])
        if params.get('user', '').isdigit():
            qs = qs.filter(user_id=params['user'])
        q = params.get('q', '').strip()
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(detail__icontains=q) | Q(ip_address__icontains=q))
        try:
            page = max(1, int(params.get('page', 1)))
        except ValueError:
            page = 1
        total = qs.count()
        start = (page - 1) * LOG_PAGE_SIZE
        return Response({
            'total': total,
            'page': page,
            'page_size': LOG_PAGE_SIZE,
            'actions': activity.ACTIONS,
            'results': [log_row(e) for e in qs[start:start + LOG_PAGE_SIZE]],
        })
