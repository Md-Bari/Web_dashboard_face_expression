"""Starting and ending sessions: used by the API, the meeting room and the automatic end."""
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone

from . import livekit
from .models import ClassSession


def broadcast_status(session):
    layer = get_channel_layer()
    if not layer:
        return
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


def start_session(session):
    session.start_session()
    broadcast_status(session)
    return session


def end_session(session):
    """End the class: dashboards are told and everyone is disconnected from the meeting."""
    session.end_session()
    broadcast_status(session)
    if livekit.configured():
        livekit.close_room(session.room_name)
    return session


def end_stale_sessions():
    """Live sessions started more than SESSION_MAX_HOURS ago were forgotten: end them."""
    cutoff = timezone.now() - timedelta(hours=settings.SESSION_MAX_HOURS)
    stale = list(ClassSession.objects.filter(status='LIVE', started_at__lt=cutoff))
    for session in stale:
        end_session(session)
    return len(stale)
