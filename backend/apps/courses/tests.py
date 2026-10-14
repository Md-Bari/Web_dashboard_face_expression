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



class RoleAccessTestCase(CourseInstructorIsolationTestCase):
    def test_superuser_is_admin_and_sees_everything(self):
        admin = User.objects.create_superuser('root', 'root@example.org', 'x')
        self.assertEqual(admin.role, 'admin')
        self.client.force_authenticate(user=admin)
        response = self.client.get('/api/sessions/')
        self.assertEqual(len(response.data), 2)

    def test_student_cannot_create_courses(self):
        student = User.objects.create_user(username='stu', password='x', role='student')
        self.client.force_authenticate(user=student)
        response = self.client.post('/api/courses/', {'title': 'Mine', 'code': 'X1'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_instructor_creates_session_for_own_course_only(self):
        self.client.force_authenticate(user=self.instructor1)
        ok = self.client.post('/api/sessions/', {'course_id': self.course1.id, 'title': 'Lecture 6'}, format='json')
        self.assertEqual(ok.status_code, 201)
        self.assertTrue(ok.data['session_code'].startswith('CS201-'))
        self.assertEqual(ok.data['status'], 'SCHEDULED')
        denied = self.client.post('/api/sessions/', {'course_id': self.course2.id, 'title': 'Hijack'}, format='json')
        self.assertEqual(denied.status_code, 400)


class JoinLinkTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.instructor = User.objects.create_user(username='teach', password='x', role='instructor', first_name='Ada')
        self.course = Course.objects.create(title='Data Structures', code='CS201', instructor=self.instructor)
        self.session = ClassSession.objects.create(course=self.course, title='Lecture 1', session_code='CS201-1', status='LIVE')

    def test_courses_get_distinct_random_codes(self):
        other = Course.objects.create(title='Algo', code='CS202', instructor=self.instructor)
        self.assertEqual(len(self.course.join_code), 8)
        self.assertNotEqual(self.course.join_code, other.join_code)

    def test_join_info_is_public_and_shows_live_session(self):
        response = self.client.get(f'/api/join/{self.course.join_code.lower()}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['live_session']['id'], self.session.id)
        self.assertEqual(self.client.get('/api/join/NOPE1234/').status_code, 404)

    def test_register_creates_enrolled_signed_in_student(self):
        response = self.client.post(f'/api/join/{self.course.join_code}/register/', {
            'first_name': 'Mina', 'username': 'mina', 'password': 'a-Long-pass-42',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('access_token', response.cookies)
        student = User.objects.get(username='mina')
        self.assertEqual(student.role, 'student')
        self.assertTrue(self.course.enrollments.filter(student=student).exists())

    def test_register_rejects_weak_password_and_taken_username(self):
        weak = self.client.post(f'/api/join/{self.course.join_code}/register/', {
            'first_name': 'A', 'username': 'abc', 'password': '12345678',
        }, format='json')
        self.assertEqual(weak.status_code, 400)
        self.assertIn('password', weak.data)
        taken = self.client.post(f'/api/join/{self.course.join_code}/register/', {
            'first_name': 'A', 'username': 'TEACH', 'password': 'a-Long-pass-42',
        }, format='json')
        self.assertEqual(taken.status_code, 400)
        self.assertIn('username', taken.data)

    def test_existing_student_enrolls_but_instructor_cannot(self):
        student = User.objects.create_user(username='s1', password='x', role='student')
        self.client.force_authenticate(user=student)
        self.assertEqual(self.client.post(f'/api/join/{self.course.join_code}/enroll/').status_code, 200)
        self.assertTrue(self.course.enrollments.filter(student=student).exists())
        self.client.force_authenticate(user=self.instructor)
        self.assertEqual(self.client.post(f'/api/join/{self.course.join_code}/enroll/').status_code, 403)
