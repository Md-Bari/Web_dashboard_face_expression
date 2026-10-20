from celery import shared_task

from .services import end_stale_sessions


@shared_task
def end_forgotten_sessions():
    """A live session nobody ended (SESSION_MAX_HOURS after it started) is ended automatically."""
    return end_stale_sessions()
