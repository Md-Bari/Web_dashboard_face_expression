from django.test import TestCase
from django.contrib.auth import get_user_model
import base64
import io
import json
from unittest import mock

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
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
        pred1 = SmoothingEngine.smooth(self.session, self.student, 'positive', 0.85, 0.95)
        self.assertEqual(pred1.smoothed_emotion, 'positive')

        pred2 = SmoothingEngine.smooth(self.session, self.student, 'positive', 0.90, 0.96)
        self.assertEqual(pred2.smoothed_emotion, 'positive')

        # Even with one neutral reading, smoothed majority remains positive
        pred3 = SmoothingEngine.smooth(self.session, self.student, 'neutral', 0.70, 0.88)
        self.assertEqual(pred3.smoothed_emotion, 'positive')
        self.assertAlmostEqual(pred3.smoothed_attention, (0.85 + 0.90 + 0.70) / 3, places=2)

    def test_aggregation_with_no_telemetry_is_empty(self):
        snapshot = AggregationService.aggregate_session(self.session.id)
        self.assertEqual(snapshot.total_students, 0)
        self.assertEqual(snapshot.avg_concentration, 0)

    def test_aggregation_service_generates_snapshot(self):
        Enrollment.objects.create(course=self.course, student=self.student)
        SmoothingEngine.smooth(self.session, self.student, 'positive', 0.8, 0.9)
        snapshot = AggregationService.aggregate_session(self.session.id)
        self.assertIsNotNone(snapshot)
        self.assertGreater(snapshot.total_students, 0)
        self.assertEqual(snapshot.session, self.session)
        self.assertGreaterEqual(snapshot.positive_pct + snapshot.neutral_pct + snapshot.negative_pct, 99.0)



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

    async def test_student_frame_produces_telemetry_and_persists_prediction(self):
        engine = get_engine()
        with mock.patch.object(engine.emotion_model, 'session', object()), \
                mock.patch.object(engine.emotion_model, 'predict',
                                  return_value=('positive', 0.9, {'positive': 0.9, 'neutral': 0.07, 'negative': 0.03})):
            comm, telemetry = await self.send_one_frame()
        self.assertEqual(telemetry['type'], 'telemetry')
        self.assertEqual(telemetry['emotion'], 'positive')
        self.assertTrue(0 <= telemetry['attention'] <= 1)
        pred = await Prediction.objects.aget(student=self.student)
        self.assertFalse(pred.is_simulated)
        await comm.disconnect()
