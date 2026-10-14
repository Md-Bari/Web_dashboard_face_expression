from .models import ClassSession


def user_is_admin(user):
    return bool(user and user.is_authenticated and user.is_admin)


def user_is_instructor(user):
    """Instructors and admins may run sessions and see the dashboard."""
    return bool(user and user.is_authenticated and user.is_instructor)


def get_instructor_session(user, session_id):
    """Return the session only if `user` is the instructor of its course (or an admin)."""
    if not user_is_instructor(user):
        return None
    qs = ClassSession.objects.select_related('course')
    if not user.is_admin:
        qs = qs.filter(course__instructor=user)
    try:
        return qs.filter(id=int(session_id)).first()
    except (TypeError, ValueError):
        return None
