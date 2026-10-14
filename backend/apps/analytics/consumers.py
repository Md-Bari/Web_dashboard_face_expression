import asyncio
import json
import time
from datetime import timedelta

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.courses.access import get_instructor_session
from apps.courses.models import ClassSession
from apps.analytics import realtime, screen, snapshots
from apps.analytics.inference_engine import aget_engine, engine_status, get_engine
from apps.analytics.models import SessionSnapshot, TeachingSuggestion
from apps.analytics.services import SmoothingEngine, AggregationService, serialize_suggestion

User = get_user_model()

MAX_FRAME_CHARS = 400_000      # a 640x480 JPEG is ~30-80 KB; anything larger is not a webcam frame
MIN_FRAME_INTERVAL = 0.4       # server-side cap of ~2.5 fps per student connection
PRESENCE_WINDOW_SECONDS = 20
MAX_SCREEN_FRAME_CHARS = 2_500_000   # a 1280px-wide JPEG of a video-call window
MIN_SCREEN_FRAME_INTERVAL = 0.8

# WebSocket close codes
CLOSE_UNAUTHORIZED = 4401
CLOSE_CONSENT_REQUIRED = 4003
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404
CLOSE_SESSION_NOT_LIVE = 4409


def display_name(user):
    return user.get_full_name() or user.username


class StudentConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for student webcam telemetry.
    Endpoint: ws://backend/ws/student/<session_id>/

    Identity: the authenticated student (JWT cookie) or, for the open guest portal,
    `?student_id=<user id>&consent=1` for an enrolled student.
    Receives downscaled webcam frames at 1-2 fps; the server finds the face (YuNet) and
    classifies its expression, and relays a small live preview to the instructor's tile.
    PRIVACY: frames and previews are handled in memory
    only; just the emotion label and attention score are persisted.
    """

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.group_name = f"session_{self.session_id}"
        self.registered = False
        self.user = None
        self.last_frame_at = 0.0
        self.told_no_model = False
        self.told_no_face = False

        await self.accept()

        error = await self.resolve_identity()
        if error:
            code, message = error
            await self.send(text_data=json.dumps({"type": "error", "code": code, "message": message}))
            await self.close(code=code)
            return

        # Expressions already photographed for this student in this session (one photo per class)
        self.snapshot_emotions = await database_sync_to_async(snapshots.stored_emotions)(self.session_id, self.user.id)
        realtime.register_student(self.session_id, self.user.id)
        self.registered = True
        realtime.ensure_running(self.session_id)

        await self.send(text_data=json.dumps({
            "type": "ready",
            "student_id": self.user.id,
            "name": display_name(self.user),
            "model": await engine_status(),
        }))
        await self.channel_layer.group_send(self.group_name, {
            "type": "broadcast_presence",
            "presence": {"student_id": self.user.id, "student_name": display_name(self.user), "online": True},
        })

    async def disconnect(self, close_code):
        if self.registered and self.user:
            if realtime.unregister_student(self.session_id, self.user.id):
                await self.channel_layer.group_send(self.group_name, {
                    "type": "broadcast_presence",
                    "presence": {"student_id": self.user.id, "student_name": display_name(self.user), "online": False},
                })

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data or not self.registered:
            return
        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            return

        msg_type = payload.get('type')

        if msg_type == 'consent.revoke':
            await self.revoke_consent()
            await self.send(text_data=json.dumps({"type": "consent.revoked"}))
            await self.close(code=CLOSE_CONSENT_REQUIRED)
            return

        if msg_type != 'frame':
            return

        frame_data = payload.get('image', '')
        now = time.monotonic()
        if not isinstance(frame_data, str) or len(frame_data) > MAX_FRAME_CHARS:
            return
        if now - self.last_frame_at < MIN_FRAME_INTERVAL:
            return
        self.last_frame_at = now

        # Consent can be withdrawn at any time (e.g. from another tab / the REST API)
        if not await self.check_student_consent():
            await self.send(text_data=json.dumps({
                "type": "error", "code": CLOSE_CONSENT_REQUIRED,
                "message": "Consent is required before transmitting webcam frames.",
            }))
            await self.close(code=CLOSE_CONSENT_REQUIRED)
            return

        engine = await aget_engine()
        result, preview = await asyncio.to_thread(engine.analyze_frame, frame_data)
        if preview:
            # Live tile for the instructor(s) only - students never join the session group
            await self.channel_layer.group_send(self.group_name, {
                "type": "broadcast_student_preview",
                "preview": {"student_id": self.user.id, "image": preview},
            })
        if result is None:
            if not engine.custom_model_loaded:
                if not self.told_no_model:
                    self.told_no_model = True
                    await self.send(text_data=json.dumps({
                        "type": "model.missing",
                        "message": "No AI model is loaded on the server, so no emotion or attention data is "
                                   "produced from your camera. Your instructor sees you as online only.",
                    }))
            elif not self.told_no_face:
                self.told_no_face = True
                await self.send(text_data=json.dumps({
                    "type": "face.missing",
                    "message": "No face detected. Face the camera in good lighting so your engagement can be measured.",
                }))
            return
        self.told_no_model = False
        self.told_no_face = False
        timestamp = payload.get('timestamp') or int(time.time() * 1000)

        smoothed = await self.smooth_and_save(result['emotion'], result['attention'], result['confidence'])
        if smoothed is None:
            await self.send(text_data=json.dumps({"type": "error", "code": CLOSE_SESSION_NOT_LIVE,
                                                  "message": "This class session has ended."}))
            await self.close(code=CLOSE_SESSION_NOT_LIVE)
            return
        await self.maybe_store_snapshot(result)

        await self.channel_layer.group_send(self.group_name, {
            "type": "broadcast_student_update",
            "student_update": {
                "student_id": self.user.id,
                "name": display_name(self.user),
                "emotion": smoothed['emotion'],
                "raw_emotion": result['emotion'],
                "attention": smoothed['attention'],
                "confidence": result['confidence'],
                "timestamp": timestamp,
            },
        })
        await self.send(text_data=json.dumps({
            "type": "telemetry",
            "emotion": smoothed['emotion'],
            "raw_emotion": result['emotion'],
            "attention": smoothed['attention'],
            "confidence": result['confidence'],
            "latency_ms": result['latency_ms'],
            "model_name": engine.emotion_model.model_name,
        }))

    # ------------------------------------------------------------------ helpers

    @database_sync_to_async
    def resolve_identity(self):
        """Returns None when OK, otherwise (close_code, message)."""
        try:
            session = ClassSession.objects.select_related('course').filter(id=int(self.session_id)).first()
        except ValueError:
            session = None
        if not session:
            return CLOSE_NOT_FOUND, "Class session not found."
        if session.status != 'LIVE':
            return CLOSE_SESSION_NOT_LIVE, "This class session is not live."

        params = dict(
            qp.split('=', 1) for qp in self.scope.get('query_string', b'').decode('utf-8').split('&') if '=' in qp
        )
        scope_user = self.scope.get('user')
        # Only a signed-in *student* identifies the connection; an instructor testing the portal
        # in the same browser falls through to the explicit student_id guest flow.
        if scope_user is not None and scope_user.is_authenticated and scope_user.role == 'student':
            user = scope_user
            consent_ok = user.consent_given or params.get('consent') == '1'
        else:
            if not settings.ALLOW_GUEST_STUDENTS:
                return CLOSE_UNAUTHORIZED, "Sign in as a student to join this session."
            try:
                user = User.objects.filter(id=int(params.get('student_id', '')), role='student').first()
            except ValueError:
                user = None
            consent_ok = params.get('consent') == '1'
            if not user:
                return CLOSE_UNAUTHORIZED, "Select a student identity to join this session."

        if not session.course.enrollments.filter(student=user).exists():
            return CLOSE_FORBIDDEN, "You are not enrolled in this course."
        if not consent_ok:
            return CLOSE_CONSENT_REQUIRED, "Consent is required before transmitting webcam frames."
        if not user.consent_given:
            user.give_consent()
        self.user = user
        return None

    @database_sync_to_async
    def check_student_consent(self):
        return User.objects.filter(id=self.user.id, consent_given=True).exists()

    @database_sync_to_async
    def revoke_consent(self):
        self.user.revoke_consent()

    async def maybe_store_snapshot(self, result):
        """First confident sighting of an expression in this session -> save the face crop once."""
        emotion = result['emotion']
        if (not snapshots.enabled() or emotion in self.snapshot_emotions
                or result['confidence'] < snapshots.min_confidence()):
            return
        self.snapshot_emotions.add(emotion)  # claim before awaiting so the next frame does not retry
        try:
            jpeg = await asyncio.to_thread(result['face_jpeg'])
            stored = await database_sync_to_async(snapshots.save_first)(
                self.session_id, self.user, emotion, result['confidence'], jpeg,
            )
        except Exception as exc:  # a snapshot must never break the live stream
            print(f"[snapshots] {self.user.username}/{emotion}: {exc!r}")
            stored = False
        if not stored:
            # Failed (retry on a later frame) or another tab stored it first (keep it claimed)
            self.snapshot_emotions = await database_sync_to_async(snapshots.stored_emotions)(
                self.session_id, self.user.id,
            )

    @database_sync_to_async
    def smooth_and_save(self, raw_emotion, raw_attention, confidence):
        session = ClassSession.objects.filter(id=self.session_id, status='LIVE').first()
        if not session:
            return None
        pred = SmoothingEngine.smooth(
            session=session,
            student=self.user,
            current_raw_emotion=raw_emotion,
            current_raw_attention=raw_attention,
            current_confidence=confidence,
        )
        return {'emotion': pred.smoothed_emotion, 'attention': round(pred.smoothed_attention, 2)}


class InstructorConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for the instructor real-time class analytics dashboard.
    Endpoint: ws://backend/ws/instructor/<session_id>/
    Only the instructor who owns the course (or an admin) may connect.

    The instructor can also share a screen (Meet / Zoom / Teams window): `screen_frame`
    actions are analysed for every visible face, tracked as anonymous screen participants.
    """

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.group_name = f"session_{self.session_id}"
        self.joined = False
        self.screen_busy = False
        self.last_screen_frame_at = 0.0

        await self.accept()

        user = self.scope.get('user')
        if user is None or not user.is_authenticated:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        session = await database_sync_to_async(get_instructor_session)(user, self.session_id)
        if session is None:
            await self.close(code=CLOSE_FORBIDDEN)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        self.joined = True

        await self.send(text_data=json.dumps(await self.get_initial_session_data()))
        if session.status == 'LIVE':
            realtime.ensure_running(self.session_id)

    async def disconnect(self, close_code):
        if self.joined:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data or not self.joined:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        action = data.get('action')
        if action == 'trigger_snapshot':
            await self.trigger_aggregation()
        elif action == 'screen_frame':
            await self.accept_screen_frame(data)

    # ------------------------------------------------------------------ screen capture

    async def accept_screen_frame(self, data):
        frame = data.get('image', '')
        now = time.monotonic()
        if not isinstance(frame, str) or len(frame) > MAX_SCREEN_FRAME_CHARS:
            return
        # Drop frames while the previous one is still being analysed (CPU inference can lag)
        if self.screen_busy or now - self.last_screen_frame_at < MIN_SCREEN_FRAME_INTERVAL:
            return
        self.screen_busy = True
        self.last_screen_frame_at = now
        self.screen_task = asyncio.create_task(self.process_screen_frame(frame))

    async def process_screen_frame(self, frame):
        try:
            engine = await aget_engine()
            faces = await asyncio.to_thread(engine.analyze_screen, frame)
            if faces is None:
                await self.send(text_data=json.dumps({
                    "type": "screen.result", "faces": [], "model_loaded": engine.custom_model_loaded,
                }))
                return

            numbers = screen.get_tracker(self.session_id).assign([f['box'] for f in faces])
            updates = await self.save_screen_faces(faces, numbers)
            if updates is None:
                await self.send(text_data=json.dumps({
                    "type": "screen.result", "faces": [], "model_loaded": True,
                    "error": "The session is not live. Start the session to analyse the screen.",
                }))
                return

            timestamp = int(time.time() * 1000)
            for update in updates:
                await self.channel_layer.group_send(self.group_name, {
                    "type": "broadcast_student_update",
                    "student_update": {**update, "timestamp": timestamp},
                })
            # Boxes go back to this instructor only, for the preview overlay and tile thumbnails
            await self.send(text_data=json.dumps({
                "type": "screen.result",
                "model_loaded": True,
                "latency_ms": engine.last_latency_ms,
                "faces": [
                    {"student_id": u["student_id"], "name": u["name"], "box": f["box"],
                     "emotion": u["emotion"], "attention": u["attention"]}
                    for f, u in zip(faces, updates)
                ],
            }))
        except Exception as exc:  # never let one bad frame kill the socket
            print(f"[screen] frame failed: {exc!r}")
        finally:
            self.screen_busy = False

    @database_sync_to_async
    def save_screen_faces(self, faces, numbers):
        session = ClassSession.objects.filter(id=self.session_id, status='LIVE').first()
        if not session:
            return None
        updates = []
        for face, number in zip(faces, numbers):
            key = screen.participant_key(number)
            pred = SmoothingEngine.smooth(
                session=session, student=None, participant=key,
                current_raw_emotion=face['emotion'],
                current_raw_attention=face['attention'],
                current_confidence=face['confidence'],
            )
            updates.append({
                "student_id": screen.screen_participant_id(key),
                "name": screen.screen_participant_name(key),
                "source": "screen",
                "emotion": pred.smoothed_emotion,
                "raw_emotion": face['emotion'],
                "attention": round(pred.smoothed_attention, 2),
                "confidence": face['confidence'],
            })
        return updates

    @database_sync_to_async
    def get_initial_session_data(self):
        session = ClassSession.objects.select_related('course').get(id=self.session_id)
        latest, _ = AggregationService.latest_predictions(session)
        online_after = timezone.now() - timedelta(seconds=PRESENCE_WINDOW_SECONDS)
        connected = realtime.connected_students(self.session_id)

        roster = []
        for enrollment in session.course.enrollments.select_related('student').order_by('student_id'):
            student = enrollment.student
            pred = latest.get(student.id)
            roster.append({
                "id": student.id,
                "name": display_name(student),
                "avatar_url": student.avatar_url,
                "source": "student",
                "emotion": pred.smoothed_emotion if pred else 'neutral',
                "smoothed_emotion": pred.smoothed_emotion if pred else 'neutral',
                "attention": round(pred.smoothed_attention, 2) if pred else 0.0,
                "confidence": round(pred.confidence, 2) if pred else 0.0,
                # A streaming student is online even when no model produces predictions
                "online": student.id in connected or bool(pred and pred.timestamp >= online_after),
                "has_data": bool(pred),
            })

        for key, pred in sorted(AggregationService.latest_screen_predictions(
                session, PRESENCE_WINDOW_SECONDS).items(), key=lambda item: screen.participant_number(item[0])):
            roster.append({
                "id": screen.screen_participant_id(key),
                "name": screen.screen_participant_name(key),
                "avatar_url": '',
                "source": "screen",
                "emotion": pred.smoothed_emotion,
                "smoothed_emotion": pred.smoothed_emotion,
                "attention": round(pred.smoothed_attention, 2),
                "confidence": round(pred.confidence, 2),
                "online": True,
                "has_data": True,
            })

        snapshot = SessionSnapshot.objects.filter(session=session).order_by('-timestamp').first()
        snapshot_data = AggregationService.serialize_snapshot(snapshot) if snapshot else None
        suggestions = [
            serialize_suggestion(s)
            for s in TeachingSuggestion.objects.filter(session=session, is_dismissed=False).order_by('-created_at')[:30]
        ]

        return {
            "type": "init",
            "session": {
                "id": session.id,
                "title": session.title,
                "status": session.status,
                "started_at": session.started_at.isoformat() if session.started_at else None,
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
            },
            "session_title": session.title,
            "roster": roster,
            "snapshot": snapshot_data,
            "suggestions": suggestions,
            "model_status": get_engine().status(),
        }

    @database_sync_to_async
    def trigger_aggregation(self):
        AggregationService.aggregate_session(self.session_id)

    # Event handlers matching group_send types
    async def broadcast_student_update(self, event):
        await self.send(text_data=json.dumps({"type": "student.update", "data": event["student_update"]}))

    async def broadcast_session_snapshot(self, event):
        await self.send(text_data=json.dumps({"type": "session.snapshot", "data": event["snapshot"]}))

    async def broadcast_suggestion(self, event):
        await self.send(text_data=json.dumps({"type": "suggestion.new", "data": event["suggestion"]}))

    async def broadcast_presence(self, event):
        await self.send(text_data=json.dumps({"type": "presence", "data": event["presence"]}))

    async def broadcast_student_preview(self, event):
        await self.send(text_data=json.dumps({"type": "student.preview", "data": event["preview"]}))

    async def broadcast_model_status(self, event):
        await self.send(text_data=json.dumps({"type": "model.status", "data": event["status"]}))

    async def broadcast_session_status(self, event):
        await self.send(text_data=json.dumps({"type": "session.status", "data": event["session"]}))
        if event["session"].get("status") == 'LIVE':
            realtime.ensure_running(self.session_id)
