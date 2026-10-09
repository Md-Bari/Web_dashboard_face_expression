from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.courses.models import Course, ClassSession

User = get_user_model()

class CourseInstructorIsolationTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.instructor1 = User.objects.create_user(
            username='instructor_one',
            password='Password123!',
            role='instructor'
        )
        self.instructor2 = User.objects.create_user(
            username='instructor_two',
            password='Password123!',
            role='instructor'
        )

        self.course1 = Course.objects.create(
            title='Data Structures',
            code='CS201',
            instructor=self.instructor1
        )
        self.course2 = Course.objects.create(
            title='Algorithms',
            code='CS202',
            instructor=self.instructor2
        )

        self.session1 = ClassSession.objects.create(
            course=self.course1,
            title='Data Structures - Lecture 5',
            session_code='DS201-L5',
            status='LIVE'
        )
        self.session2 = ClassSession.objects.create(
            course=self.course2,
            title='Algorithms - Lecture 1',
            session_code='AL202-L1',
            status='LIVE'
        )

    def test_instructor_only_sees_their_own_courses(self):
        # Authenticate instructor 1
        self.client.force_authenticate(user=self.instructor1)
        response = self.client.get('/api/courses/')
        self.assertEqual(response.status_code, 200)

        # Must only see course 1, not course 2
        course_codes = [c['code'] for c in response.data]
        self.assertIn('CS201', course_codes)
        self.assertNotIn('CS202', course_codes)

    def test_instructor_only_sees_their_own_sessions(self):
        # Authenticate instructor 2
        self.client.force_authenticate(user=self.instructor2)
        response = self.client.get('/api/sessions/')
        self.assertEqual(response.status_code, 200)

        # Must only see session 2, not session 1
        session_codes = [s['session_code'] for s in response.data]
        self.assertIn('AL202-L1', session_codes)
        self.assertNotIn('DS201-L5', session_codes)

