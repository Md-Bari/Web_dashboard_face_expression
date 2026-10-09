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

