from .models import ClassSession


def user_is_instructor(user):
    return bool(user and user.is_authenticated and (user.role == 'instructor' or user.is_superuser))


def get_instructor_session(user, session_id):
    """Return the session only if `user` is the instructor of its course (or a superuser)."""
    if not user_is_instructor(user):
        return None
    qs = ClassSession.objects.select_related('course')
    if not user.is_superuser:
        qs = qs.filter(course__instructor=user)
    try:
        return qs.filter(id=int(session_id)).first()
    except (TypeError, ValueError):
        return None
