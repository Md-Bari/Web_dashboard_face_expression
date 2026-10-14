"""
In-process real-time runtime for a LIVE session.

One asyncio loop per live session (started lazily by the consumers) that

  * runs the 2-5 s aggregation when Celery beat is not doing it
    (settings.INPROCESS_AGGREGATOR; disabled in docker-compose),
  * broadcasts the model status, and
  * prunes old predictions.

All telemetry comes from real webcam frames analysed by the model.
"""
import asyncio
import time

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.conf import settings

from apps.courses.models import ClassSession
from .inference_engine import get_engine
from .services import AggregationService

TICK_SECONDS = 1.0
AGGREGATE_EVERY = 3.0
STATUS_EVERY = 5.0
PRUNE_EVERY = 60.0

_tasks = {}           # session_id -> asyncio.Task
_live_students = {}   # session_id -> {user_id: connection count}


def register_student(session_id, user_id):
    conns = _live_students.setdefault(str(session_id), {})
    conns[user_id] = conns.get(user_id, 0) + 1


def unregister_student(session_id, user_id):
    """Returns True when this was the student's last connection."""
    conns = _live_students.get(str(session_id), {})
    if user_id in conns:
        conns[user_id] -= 1
        if conns[user_id] <= 0:
            del conns[user_id]
            return True
    return False


def connected_students(session_id):
    return set(_live_students.get(str(session_id), {}))


def ensure_running(session_id):
    """Start the per-session loop if it is not already running (call from inside the event loop)."""
    key = str(session_id)
    task = _tasks.get(key)
    if task is None or task.done():
        _tasks[key] = asyncio.get_running_loop().create_task(_session_loop(key))


def _is_live(session_id):
    return ClassSession.objects.filter(id=session_id, status='LIVE').exists()


async def _session_loop(session_id):
    layer = get_channel_layer()
    group = f"session_{session_id}"
    last_aggregate = last_status = last_prune = 0.0
    inprocess_aggregator = getattr(settings, 'INPROCESS_AGGREGATOR', True)

    try:
        while await sync_to_async(_is_live)(session_id):
            now = time.monotonic()

            if inprocess_aggregator and now - last_aggregate >= AGGREGATE_EVERY:
                last_aggregate = now
                await sync_to_async(AggregationService.aggregate_session)(session_id)

            if now - last_status >= STATUS_EVERY:
                last_status = now
                await layer.group_send(group, {
                    "type": "broadcast_model_status",
                    "status": get_engine().status(),
                })

            if now - last_prune >= PRUNE_EVERY:
                last_prune = now
                await sync_to_async(AggregationService.prune_old_predictions)(session_id)

            await asyncio.sleep(TICK_SECONDS)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # keep the server alive; the next connect restarts the loop
        print(f"[realtime] session {session_id} loop stopped: {exc!r}")
    finally:
        _tasks.pop(str(session_id), None)
