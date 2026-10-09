"""
In-process real-time runtime for a LIVE session.

One asyncio loop per live session (started lazily by the consumers) that

  * simulates telemetry for enrolled students who are not streaming a real
    webcam (demo mode, toggleable from the instructor Settings page) using the
    exact same smoothing -> persist -> broadcast path as real frames, and
  * runs the 2-5 s aggregation when Celery beat is not doing it
    (settings.INPROCESS_AGGREGATOR; disabled in docker-compose).
"""
import asyncio
import random
import time

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.conf import settings

from apps.courses.models import ClassSession
from .inference_engine import get_engine
from .services import AggregationService, SmoothingEngine

TICK_SECONDS = 1.0
AGGREGATE_EVERY = 3.0
STATUS_EVERY = 5.0
PRUNE_EVERY = 60.0

_tasks = {}           # session_id -> asyncio.Task
_live_students = {}   # session_id -> {user_id: connection count}
_demo_enabled = {}    # session_id -> bool (overrides settings.DEMO_SIMULATION)
_sim_state = {}       # (session_id, user_id) -> {'emotion', 'attention', 'bias'}


def demo_enabled(session_id):
    return _demo_enabled.get(str(session_id), getattr(settings, 'DEMO_SIMULATION', True))


def set_demo_enabled(session_id, enabled):
    _demo_enabled[str(session_id)] = bool(enabled)


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


def _next_state(state, bias):
    """Markov-style drift so demo tiles change believably instead of flickering randomly."""
    emotion, attention = state['emotion'], state['attention']
    if random.random() < 0.12:
        emotion = random.choices(
            ['positive', 'neutral', 'negative'],
            weights=[0.55 if bias == 'positive' else 0.30,
                     0.30 if bias == 'neutral' else 0.20,
                     0.25 if bias == 'negative' else 0.10],
        )[0]
    target = {'positive': 0.86, 'neutral': 0.72, 'negative': 0.45}[emotion]
    attention += (target - attention) * 0.3 + random.uniform(-0.05, 0.05)
    return {'emotion': emotion, 'attention': min(0.98, max(0.2, attention))}


def _simulate_step(session_id, skip_ids):
    """Sync (DB) work: produce telemetry for a slice of demo students. Returns broadcast payloads."""
    session = ClassSession.objects.select_related('course').filter(id=session_id).first()
    if not session or session.status != 'LIVE':
        return None
    latest, _ = AggregationService.latest_predictions(session)
    students = [
        e.student for e in session.course.enrollments.select_related('student')
        if e.student_id not in skip_ids
    ]
    if not students:
        return []
    now_ms = int(time.time() * 1000)
    updates = []
    for student in random.sample(students, max(1, len(students) // 4)):
        key = (session_id, student.id)
        if key not in _sim_state:
            seed = latest.get(student.id)
            emotion = seed.smoothed_emotion if seed else random.choice(['positive', 'positive', 'neutral', 'negative'])
            _sim_state[key] = {
                'emotion': emotion,
                'attention': seed.smoothed_attention if seed else 0.7,
                'bias': emotion,
            }
        entry = _sim_state[key]
        entry.update(_next_state(entry, entry['bias']))
        confidence = round(random.uniform(0.84, 0.98), 2)
        pred = SmoothingEngine.smooth(
            session, student, entry['emotion'], round(entry['attention'], 2), confidence, simulated=True,
        )
        updates.append({
            'student_id': student.id,
            'name': student.get_full_name() or student.username,
            'emotion': pred.smoothed_emotion,
            'raw_emotion': pred.raw_emotion,
            'attention': round(pred.smoothed_attention, 2),
            'confidence': confidence,
            'timestamp': now_ms,
            'simulated': True,
        })
    return updates


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

            if demo_enabled(session_id):
                updates = await sync_to_async(_simulate_step)(session_id, connected_students(session_id))
                for update in updates or []:
                    await layer.group_send(group, {"type": "broadcast_student_update", "student_update": update})

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
