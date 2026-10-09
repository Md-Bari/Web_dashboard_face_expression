try:
    from celery import shared_task
except ImportError:
    def shared_task(func):
        return func

from apps.courses.models import ClassSession
from .services import AggregationService


@shared_task
def aggregate_active_sessions():
    """
    Periodic task running every 2-5 seconds to compute snapshots for LIVE sessions.
    """
    live_sessions = ClassSession.objects.filter(status='LIVE')
    for session in live_sessions:
        AggregationService.aggregate_session(session.id)
