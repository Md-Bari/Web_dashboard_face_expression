"""
Activity log for the admin portal: who signed in, started a class, added a student, ...

    log(request, 'session_started', f'{session.title} ({course.code})')

Logging never breaks the request it records.
"""
from .models import ActivityLog

# action -> label shown in the admin portal
ACTIONS = {
    'login': 'Signed in',
    'login_failed': 'Failed sign-in',
    'logout': 'Signed out',
    'register': 'Created a student account',
    'profile_updated': 'Updated their profile',
    'consent_given': 'Gave camera consent',
    'consent_revoked': 'Withdrew camera consent',
    'course_created': 'Created a class',
    'course_updated': 'Renamed a class',
    'course_deleted': 'Deleted a class',
    'section_created': 'Created a section',
    'section_deleted': 'Deleted a section',
    'student_added': 'Added a student',
    'students_imported': 'Imported students',
    'student_removed': 'Removed a student',
    'class_joined': 'Joined a class',
    'session_created': 'Scheduled a session',
    'session_deleted': 'Deleted a session',
    'session_started': 'Started a session',
    'session_ended': 'Ended a session',
    'meeting_joined': 'Joined a class meeting',
    'photo_removed': 'Removed an expression photo',
    'instructor_created': 'Created an instructor account',
    'account_updated': 'Changed an account',
    'account_disabled': 'Disabled an account',
    'account_enabled': 'Enabled an account',
}


def client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = (forwarded.split(',')[0].strip() if forwarded else '') or request.META.get('REMOTE_ADDR') or ''
    return ip or None


def log(request, action, detail='', user=None, username=None):
    """Record `action` by `user` (default: the request's signed-in user)."""
    try:
        if user is None and request is not None:
            candidate = getattr(request, 'user', None)
            user = candidate if candidate is not None and candidate.is_authenticated else None
        ActivityLog.objects.create(
            user=user,
            username=(user.username if user else (username or ''))[:150],
            role=(user.role if user else ''),
            action=action,
            detail=str(detail or '')[:300],
            ip_address=client_ip(request),
            user_agent=(request.META.get('HTTP_USER_AGENT', '') if request is not None else '')[:300],
        )
    except Exception as exc:  # the log must never break what it records
        print(f"[activity] could not log {action}: {exc!r}")
