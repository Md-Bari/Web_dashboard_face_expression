from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

class AccountsAuthTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.instructor = User.objects.create_user(
            username='instructor_test',
            password='Password123!',
            role='instructor',
            first_name='Dr.',
            last_name='Tester'
        )
        self.student = User.objects.create_user(
            username='student_test',
            password='Password123!',
            role='student',
            first_name='Alice'
        )

    def test_login_sets_httponly_jwt_cookies(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'instructor_test',
            'password': 'Password123!'
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access_token', response.cookies)
        self.assertTrue(response.cookies['access_token']['httponly'])
        self.assertIn('refresh_token', response.cookies)
        self.assertTrue(response.cookies['refresh_token']['httponly'])

    def test_student_consent_flow(self):
        # Authenticate student
        self.client.force_authenticate(user=self.student)
        self.assertFalse(self.student.consent_given)

        # Grant consent
        response = self.client.post('/api/auth/consent/', {'consent': True})
        self.assertEqual(response.status_code, 200)
        self.student.refresh_from_db()
        self.assertTrue(self.student.consent_given)
        self.assertIsNotNone(self.student.consent_timestamp)

        # Revoke consent
        response = self.client.post('/api/auth/consent/', {'consent': False})
        self.assertEqual(response.status_code, 200)
        self.student.refresh_from_db()
        self.assertFalse(self.student.consent_given)


class ProfileTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(username='prof_teacher', password='x', role='instructor', first_name='Ada')
        self.client.force_authenticate(self.teacher)

    def test_profile_is_read_and_saved(self):
        me = self.client.get('/api/auth/me/').data
        self.assertEqual((me['phone'], me['date_of_birth'], me['blood_group']), ('', None, ''))
        res = self.client.patch('/api/auth/me/', {
            'first_name': 'Ada', 'last_name': 'Lovelace', 'display_title': 'Dr. Lovelace',
            'phone': '+880 1712-345678', 'date_of_birth': '1990-05-17', 'blood_group': 'O+',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.get_full_name(), 'Ada Lovelace')
        self.assertEqual((self.teacher.phone, str(self.teacher.date_of_birth), self.teacher.blood_group),
                         ('+880 1712-345678', '1990-05-17', 'O+'))

    def test_invalid_details_are_rejected(self):
        from datetime import date, timedelta
        for field, value in (
            ('phone', 'call me'),
            ('date_of_birth', str(date.today() + timedelta(days=1))),
            ('blood_group', 'C+'),
            ('first_name', '   '),
        ):
            res = self.client.patch('/api/auth/me/', {field: value}, format='json')
            self.assertEqual(res.status_code, 400, field)

    def test_role_username_and_consent_cannot_be_changed_here(self):
        self.client.patch('/api/auth/me/', {'role': 'admin', 'username': 'boss', 'consent_given': True}, format='json')
        self.teacher.refresh_from_db()
        self.assertEqual((self.teacher.role, self.teacher.username, self.teacher.consent_given),
                         ('instructor', 'prof_teacher', False))

    def test_students_do_not_see_the_instructors_personal_details(self):
        from apps.courses.models import Course, Enrollment
        self.teacher.phone, self.teacher.blood_group = '+8801712345678', 'AB-'
        self.teacher.save()
        course = Course.objects.create(title='Bio', code='BIO', instructor=self.teacher)
        student = User.objects.create_user(username='prof_student', password='x', role='student')
        Enrollment.objects.create(course=course, student=student)
        self.client.force_authenticate(student)
        instructor = self.client.get('/api/courses/').data[0]['instructor']
        self.assertNotIn('phone', instructor)
        self.assertNotIn('blood_group', instructor)
        self.assertNotIn('date_of_birth', instructor)
