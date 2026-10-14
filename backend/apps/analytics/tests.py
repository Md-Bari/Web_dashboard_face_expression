from django.test import TestCase
from django.contrib.auth import get_user_model
import base64
import io
import json
from unittest import mock

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.ws_auth import JWTCookieAuthMiddleware
from apps.analytics.inference_engine import get_engine
from apps.analytics.routing import websocket_urlpatterns
from apps.courses.models import Course, ClassSession, Enrollment
from apps.analytics.models import Prediction, SessionSnapshot
from apps.analytics.services import SmoothingEngine, AggregationService

User = get_user_model()

class AnalyticsTelemetryTestCase(TestCase):
    def setUp(self):
        self.instructor = User.objects.create_user(
            username='instructor_analytics',
            password='Password123!',
            role='instructor'
        )
        self.student = User.objects.create_user(
            username='student_alice',
            password='Password123!',
            role='student',
            first_name='Alice'
        )
        self.course = Course.objects.create(
            title='Data Structures',
            code='CS201',
            instructor=self.instructor
        )
        self.session = ClassSession.objects.create(
            course=self.course,
            title='Data Structures - Lecture 5',
            session_code='DS201-L5',
            status='LIVE'
        )

    def test_no_raw_video_stored(self):
        # Verify Prediction model fields do NOT store raw image or binary video
        field_names = [f.name for f in Prediction._meta.get_fields()]
        self.assertNotIn('image', field_names)
        self.assertNotIn('video', field_names)
        self.assertNotIn('frame_data', field_names)
        self.assertIn('raw_emotion', field_names)
        self.assertIn('smoothed_emotion', field_names)
        self.assertIn('smoothed_attention', field_names)

    def test_smoothing_engine_sliding_window(self):
        pred1 = SmoothingEngine.smooth(self.session, self.student, 'happy', 0.85, 0.95)
        self.assertEqual(pred1.smoothed_emotion, 'happy')

        pred2 = SmoothingEngine.smooth(self.session, self.student, 'happy', 0.90, 0.96)
        self.assertEqual(pred2.smoothed_emotion, 'happy')

        # Even with one neutral reading, smoothed majority remains happy
        pred3 = SmoothingEngine.smooth(self.session, self.student, 'neutral', 0.70, 0.88)
        self.assertEqual(pred3.smoothed_emotion, 'happy')
        self.assertAlmostEqual(pred3.smoothed_attention, (0.85 + 0.90 + 0.70) / 3, places=2)

    def test_aggregation_with_no_telemetry_is_empty(self):
        snapshot = AggregationService.aggregate_session(self.session.id)
        self.assertEqual(snapshot.total_students, 0)
        self.assertEqual(snapshot.avg_concentration, 0)

    def test_aggregation_service_generates_snapshot(self):
        Enrollment.objects.create(course=self.course, student=self.student)
        SmoothingEngine.smooth(self.session, self.student, 'happy', 0.8, 0.9)
        snapshot = AggregationService.aggregate_session(self.session.id)
        self.assertIsNotNone(snapshot)
        self.assertGreater(snapshot.total_students, 0)
        self.assertEqual(snapshot.session, self.session)
        self.assertEqual(snapshot.emotion_counts['happy'], 1)
        self.assertEqual(sum(snapshot.emotion_counts.values()), snapshot.total_students)



class AnalyticsAccessTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='x', role='instructor')
        self.other = User.objects.create_user(username='other', password='x', role='instructor')
        self.student = User.objects.create_user(username='stu', password='x', role='student')
        course = Course.objects.create(title='DS', code='CS201', instructor=self.owner)
        self.session = ClassSession.objects.create(course=course, title='L5', session_code='L5', status='LIVE')
        Enrollment.objects.create(course=course, student=self.student)
        SmoothingEngine.smooth(self.session, self.student, 'neutral', 0.7, 0.9)
        AggregationService.aggregate_session(self.session.id)
        self.api = APIClient()

    def test_other_instructor_cannot_read_session_analytics(self):
        self.api.force_authenticate(self.other)
        for suffix in ('history/', 'suggestions/', 'report/', 'report.csv'):
            res = self.api.get(f'/api/analytics/sessions/{self.session.id}/{suffix}')
            self.assertEqual(res.status_code, 404, suffix)

    def test_student_cannot_read_session_analytics(self):
        self.api.force_authenticate(self.student)
        res = self.api.get(f'/api/analytics/sessions/{self.session.id}/report/')
        self.assertEqual(res.status_code, 404)

    def test_owner_gets_report_and_csv(self):
        self.api.force_authenticate(self.owner)
        res = self.api.get(f'/api/analytics/sessions/{self.session.id}/report/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['students'][0]['name'], 'stu')
        csv_res = self.api.get(f'/api/analytics/sessions/{self.session.id}/report.csv')
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn('text/csv', csv_res['Content-Type'])

    def test_student_cannot_end_session(self):
        self.api.force_authenticate(self.student)
        res = self.api.post(f'/api/sessions/{self.session.id}/end/')
        self.assertIn(res.status_code, (403, 404))
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, 'LIVE')

    def test_owner_can_end_and_restart_session(self):
        self.api.force_authenticate(self.owner)
        self.assertEqual(self.api.post(f'/api/sessions/{self.session.id}/end/').status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, 'ENDED')
        self.assertEqual(self.api.post(f'/api/sessions/{self.session.id}/start/').status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual((self.session.status, self.session.ended_at), ('LIVE', None))


def make_frame():
    buf = io.BytesIO()
    Image.effect_noise((224, 224), 60).convert('RGB').save(buf, format='JPEG')
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


@override_settings(EXPRESSION_SNAPSHOTS_ENABLED=False)  # socket tests must not write photos to the real media folder
class ConsumerTestCase(TransactionTestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='x', role='instructor')
        self.student = User.objects.create_user(username='stu', password='x', role='student', first_name='Stu')
        course = Course.objects.create(title='DS', code='CS201', instructor=self.owner)
        self.session = ClassSession.objects.create(course=course, title='L5', session_code='L5', status='LIVE')
        Enrollment.objects.create(course=course, student=self.student)
        self.app = JWTCookieAuthMiddleware(URLRouter(websocket_urlpatterns))

    def communicator(self, path, user=None):
        comm = WebsocketCommunicator(self.app, path)
        return comm

    async def test_anonymous_instructor_socket_is_rejected(self):
        comm = self.communicator(f'/ws/instructor/{self.session.id}/')
        connected, _ = await comm.connect()
        self.assertTrue(connected)
        out = await comm.receive_output()
        self.assertEqual(out['type'], 'websocket.close')
        self.assertEqual(out['code'], 4401)

    async def test_student_without_consent_is_rejected(self):
        comm = self.communicator(f'/ws/student/{self.session.id}/?student_id={self.student.id}')
        await comm.connect()
        error = json.loads((await comm.receive_output())['text'])
        self.assertEqual(error['type'], 'error')
        self.assertEqual(error['code'], 4003)
        await self.student.arefresh_from_db()
        self.assertFalse(self.student.consent_given)

    async def send_one_frame(self):
        comm = self.communicator(f'/ws/student/{self.session.id}/?student_id={self.student.id}&consent=1')
        await comm.connect()
        ready = json.loads((await comm.receive_output())['text'])
        self.assertEqual(ready['type'], 'ready')
        await comm.send_to(text_data=json.dumps({'type': 'frame', 'image': make_frame()}))
        reply = json.loads((await comm.receive_output(timeout=10))['text'])
        return comm, reply

    async def test_without_model_frames_produce_no_data(self):
        engine = get_engine()
        with mock.patch.object(engine.emotion_model, 'session', None):
            comm, reply = await self.send_one_frame()
        self.assertEqual(reply['type'], 'model.missing')
        self.assertEqual(await Prediction.objects.filter(student=self.student).acount(), 0)
        await comm.disconnect()

    async def test_frame_without_face_produces_no_data(self):
        engine = get_engine()
        with mock.patch.object(engine.emotion_model, 'session', object()), \
                mock.patch.object(engine.emotion_model, 'predict', return_value=None):
            comm, reply = await self.send_one_frame()
        self.assertEqual(reply['type'], 'face.missing')
        self.assertEqual(await Prediction.objects.filter(student=self.student).acount(), 0)
        await comm.disconnect()

    async def test_student_frame_produces_telemetry_and_persists_prediction(self):
        engine = get_engine()
        frontal = [[38, 52], [74, 52], [56, 72], [42, 92], [70, 92]]  # right eye, left eye, nose, mouth corners
        prediction = {
            'emotion': 'happy', 'confidence': 0.9,
            'scores': {'happy': 0.9, 'neutral': 0.07, 'sad': 0.03},
            'landmarks': frontal,
        }
        with mock.patch.object(engine.emotion_model, 'session', object()), \
                mock.patch.object(engine.emotion_model, 'predict', return_value=prediction):
            comm, telemetry = await self.send_one_frame()
        self.assertEqual(telemetry['type'], 'telemetry')
        self.assertEqual(telemetry['emotion'], 'happy')
        self.assertEqual(telemetry['attention'], 1.0)
        self.assertEqual(await Prediction.objects.filter(student=self.student).acount(), 1)
        await comm.disconnect()


class ScreenParticipantTestCase(TestCase):
    def setUp(self):
        self.instructor = User.objects.create_user(username='inst', password='x', role='instructor')
        self.course = Course.objects.create(title='Online', code='ON1', instructor=self.instructor)
        self.session = ClassSession.objects.create(course=self.course, title='Zoom', session_code='ON1-1', status='LIVE')

    def test_tracker_keeps_numbers_for_faces_that_stay_put(self):
        from apps.analytics.screen import ScreenFaceTracker
        tracker = ScreenFaceTracker()
        boxes = [(0.1, 0.1, 0.1, 0.15), (0.6, 0.1, 0.1, 0.15)]
        self.assertEqual(tracker.assign(boxes, now=0), [1, 2])
        moved = [(0.605, 0.11, 0.1, 0.15), (0.1, 0.1, 0.1, 0.15), (0.35, 0.6, 0.1, 0.15)]
        self.assertEqual(tracker.assign(moved, now=1), [2, 1, 3])
        self.assertEqual(tracker.assign(boxes[:1], now=30), [4])  # old tracks expired

    def test_screen_faces_count_in_snapshot_and_report(self):
        from apps.analytics.views import build_report
        SmoothingEngine.smooth(self.session, None, 'happy', 0.9, 0.8, participant='screen-1')
        SmoothingEngine.smooth(self.session, None, 'sad', 0.4, 0.7, participant='screen-2')
        snapshot = AggregationService.aggregate_session(self.session.id)
        self.assertEqual(snapshot.total_students, 2)
        self.assertEqual(snapshot.emotion_counts['happy'], 1)
        self.assertEqual(snapshot.emotion_counts['sad'], 1)
        names = sorted(s['name'] for s in build_report(self.session)['students'])
        self.assertEqual(names, ['Screen face 1', 'Screen face 2'])


class ScreenCaptureConsumerTestCase(ConsumerTestCase):
    async def test_screen_frame_creates_screen_participants(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(self.owner).access_token)
        comm = WebsocketCommunicator(
            self.app, f'/ws/instructor/{self.session.id}/', headers=[(b'cookie', f'access_token={token}'.encode())],
        )
        connected, _ = await comm.connect()
        self.assertTrue(connected)
        init = json.loads((await comm.receive_output(timeout=60))['text'])
        self.assertEqual(init['type'], 'init')

        faces = [
            {'box': [0.1, 0.1, 0.1, 0.15], 'emotion': 'happy', 'confidence': 0.9, 'attention': 0.95},
            {'box': [0.6, 0.1, 0.1, 0.15], 'emotion': 'sad', 'confidence': 0.8, 'attention': 0.4},
        ]
        with mock.patch.object(get_engine(), 'analyze_screen', return_value=faces):
            await comm.send_to(text_data=json.dumps({'action': 'screen_frame', 'image': make_frame()}))
            # The session loop interleaves snapshots/status; collect until both kinds have arrived
            updates, result = [], None
            for _ in range(20):
                message = json.loads((await comm.receive_output(timeout=10))['text'])
                if message['type'] == 'student.update':
                    updates.append(message['data'])
                elif message['type'] == 'screen.result':
                    result = message
                if result and len(updates) == 2:
                    break

        self.assertEqual(sorted(u['name'] for u in updates), ['Screen face 1', 'Screen face 2'])
        self.assertTrue(all(u['student_id'] < 0 and u['source'] == 'screen' for u in updates))
        self.assertEqual([f['box'] for f in result['faces']], [f['box'] for f in faces])
        self.assertEqual(await Prediction.objects.filter(student__isnull=True).acount(), 2)
        await comm.disconnect()


class SixClassSuggestionTestCase(TestCase):
    def setUp(self):
        instructor = User.objects.create_user(username='i6', password='x', role='instructor')
        course = Course.objects.create(title='C', code='C6', instructor=instructor)
        self.session = ClassSession.objects.create(course=course, title='S', session_code='C6-1', status='LIVE')

    def test_sad_and_fear_trigger_examples_and_angry_triggers_frustration(self):
        from apps.analytics.models import TeachingSuggestion
        for i, emotion in enumerate(['sad', 'fear', 'angry', 'happy']):
            SmoothingEngine.smooth(self.session, None, emotion, 0.9, 0.9, participant=f'screen-{i + 1}')
        snapshot = AggregationService.aggregate_session(self.session.id)
        self.assertEqual(AggregationService.serialize_snapshot(snapshot, with_timeline=False)['emotion_pcts']['sad'], 25)
        titles = set(TeachingSuggestion.objects.filter(session=self.session).values_list('title', flat=True))
        self.assertIn('Consider adding more examples', titles)
        self.assertIn('Check for frustration', titles)
        self.assertNotIn('Engage students with a quick poll', titles)


class StudentPreviewTestCase(ConsumerTestCase):
    async def test_instructor_gets_live_preview_and_student_does_not(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(self.owner).access_token)
        teacher = WebsocketCommunicator(
            self.app, f'/ws/instructor/{self.session.id}/', headers=[(b'cookie', f'access_token={token}'.encode())],
        )
        await teacher.connect()
        self.assertEqual(json.loads((await teacher.receive_output(timeout=60))['text'])['type'], 'init')

        engine = get_engine()
        frontal = [[38, 52], [74, 52], [56, 72], [42, 92], [70, 92]]
        prediction = {'emotion': 'happy', 'confidence': 0.9, 'scores': {}, 'landmarks': frontal}
        with mock.patch.object(engine.emotion_model, 'session', object()), \
                mock.patch.object(engine.emotion_model, 'predict', return_value=prediction):
            student, reply = await self.send_one_frame()
            preview = None
            for _ in range(20):
                message = json.loads((await teacher.receive_output(timeout=10))['text'])
                if message['type'] == 'student.preview':
                    preview = message['data']
                    break

        self.assertEqual(reply['type'], 'telemetry')
        self.assertEqual(preview['student_id'], self.student.id)
        self.assertTrue(preview['image'].startswith('data:image/jpeg;base64,'))
        self.assertLess(len(preview['image']), 20_000)
        self.assertTrue(await student.receive_nothing(timeout=0.5))
        await student.disconnect()
        await teacher.disconnect()


class ExpressionSnapshotTestCase(ConsumerTestCase):
    def setUp(self):
        super().setUp()
        import tempfile
        self.media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media, EXPRESSION_SNAPSHOTS_ENABLED=True,
                                          EXPRESSION_SNAPSHOT_MIN_CONFIDENCE=0.5)
        self.override.enable()

    def tearDown(self):
        import shutil
        self.override.disable()
        shutil.rmtree(self.media, ignore_errors=True)
        super().tearDown()

    async def stream(self, readings):
        """Send one frame per (emotion, confidence) and wait for each telemetry reply."""
        import asyncio
        engine = get_engine()
        frontal = [[38, 52], [74, 52], [56, 72], [42, 92], [70, 92]]
        comm = self.communicator(f'/ws/student/{self.session.id}/?student_id={self.student.id}&consent=1')
        await comm.connect()
        await comm.receive_output(timeout=60)  # ready
        with mock.patch.object(engine.emotion_model, 'session', object()):
            for emotion, confidence in readings:
                prediction = {'emotion': emotion, 'confidence': confidence, 'scores': {},
                              'landmarks': frontal, 'box': (40, 40, 140, 140)}
                with mock.patch.object(engine.emotion_model, 'predict', return_value=prediction):
                    await comm.send_to(text_data=json.dumps({'type': 'frame', 'image': make_frame()}))
                    reply = json.loads((await comm.receive_output(timeout=10))['text'])
                    self.assertEqual(reply['type'], 'telemetry')
                await asyncio.sleep(0.45)  # server accepts ~2.5 frames/s per student
        return comm

    async def test_each_expression_is_stored_once_in_its_class_folder(self):
        import os
        from apps.analytics.models import ExpressionSnapshot
        comm = await self.stream([('happy', 0.9), ('happy', 0.95), ('sad', 0.8), ('angry', 0.3)])
        rows = [r async for r in ExpressionSnapshot.objects.filter(student=self.student).order_by('emotion')]
        self.assertEqual([r.emotion for r in rows], ['happy', 'sad'])  # 2nd happy skipped, weak angry ignored
        self.assertEqual(rows[0].confidence, 0.9)  # the first sighting is kept
        for row in rows:
            self.assertEqual(row.image, f'expression_snapshots/session_{self.session.id}/{row.emotion}/stu.jpg')
            with open(os.path.join(self.media, row.image), 'rb') as fh:
                self.assertEqual(fh.read(2), b'\xff\xd8')  # JPEG
        await comm.disconnect()

    async def test_revoking_consent_deletes_photos(self):
        import os
        from apps.analytics.models import ExpressionSnapshot
        comm = await self.stream([('neutral', 0.9)])
        row = await ExpressionSnapshot.objects.aget(student=self.student)
        path = os.path.join(self.media, row.image)
        self.assertTrue(os.path.exists(path))
        await comm.send_to(text_data=json.dumps({'type': 'consent.revoke'}))
        await comm.receive_output(timeout=10)
        self.assertFalse(await ExpressionSnapshot.objects.filter(student=self.student).aexists())
        self.assertFalse(os.path.exists(path))
        await comm.disconnect()


class ExpressionPhotoGalleryTestCase(TestCase):
    def setUp(self):
        import tempfile
        from django.test import override_settings
        from apps.analytics import snapshots
        self.media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()
        self.owner = User.objects.create_user(username='own', password='x', role='instructor')
        self.other = User.objects.create_user(username='oth', password='x', role='instructor')
        self.student = User.objects.create_user(username='kid', password='x', role='student', first_name='Kid')
        course = Course.objects.create(title='C', code='C1', instructor=self.owner)
        self.session = ClassSession.objects.create(course=course, title='S', session_code='C1-1', status='LIVE')
        Enrollment.objects.create(course=course, student=self.student)
        snapshots.save_first(self.session.id, self.student, 'happy', 0.91, b'\xff\xd8fake-jpeg')
        self.client = APIClient()

    def tearDown(self):
        import shutil
        self.override.disable()
        shutil.rmtree(self.media, ignore_errors=True)

    def test_owner_lists_and_downloads_photos(self):
        self.client.force_authenticate(self.owner)
        data = self.client.get(f'/api/analytics/sessions/{self.session.id}/expression-snapshots/').data
        row = data['students'][0]
        self.assertEqual(row['name'], 'Kid')
        self.assertEqual(set(row['photos']), {'happy'})
        self.assertEqual(row['photos']['happy']['confidence'], 91)
        image = self.client.get(row['photos']['happy']['url'])
        self.assertEqual(image.status_code, 200)
        self.assertEqual(image['Content-Type'], 'image/jpeg')
        self.assertEqual(b''.join(image.streaming_content), b'\xff\xd8fake-jpeg')

    def test_other_instructor_and_students_cannot_see_photos(self):
        url = f'/api/analytics/sessions/{self.session.id}/expression-snapshots/'
        for user in (self.other, self.student):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, 404)
            self.assertEqual(self.client.get(f'{url}1/image/').status_code, 404)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(url).status_code, (401, 403))
