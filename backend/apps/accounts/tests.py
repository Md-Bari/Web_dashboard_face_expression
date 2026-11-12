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


class AdminPortalTestCase(TestCase):
    def setUp(self):
        from apps.courses.models import ClassSession, Course, Enrollment, Section
        self.client = APIClient()
        self.admin = User.objects.create_user(username='boss@admin', password='pw', role='admin')
        self.teacher = User.objects.create_user(username='teach', password='pw', role='instructor', first_name='Tea')
        self.student = User.objects.create_user(username='kid', password='pw', role='student', first_name='Kid')
        course = Course.objects.create(title='Data', code='CS1', instructor=self.teacher)
        section = Section.objects.create(course=course, name='A')
        Enrollment.objects.create(course=course, student=self.student, section=section)
        ClassSession.objects.create(course=course, title='L1', session_code='CS1-1', status='LIVE')

    def test_seeded_admin_account_signs_in(self):
        # Created by migration 0005 with the default credentials
        admin = User.objects.get(username='shitol@admin')
        self.assertEqual(admin.role, 'admin')
        res = self.client.post('/api/auth/login/', {'username': 'shitol@admin', 'password': '123456'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['user']['role'], 'admin')

    def test_only_admins_reach_the_admin_api(self):
        urls = ['/api/admin/overview/', '/api/admin/instructors/', '/api/admin/students/', '/api/admin/logs/']
        for user in (None, self.teacher, self.student):
            self.client.force_authenticate(user)
            for url in urls:
                self.assertIn(self.client.get(url).status_code, (401, 403), f'{user} {url}')
            res = self.client.post('/api/admin/instructors/', {'first_name': 'X', 'username': 'xx', 'password': 'p'})
            self.assertIn(res.status_code, (401, 403))
        self.assertFalse(User.objects.filter(username='xx').exists())

    def test_admin_sees_everyone_and_creates_an_instructor(self):
        self.client.force_authenticate(self.admin)
        overview = self.client.get('/api/admin/overview/').data
        self.assertEqual((overview['counts']['instructors'], overview['counts']['students'],
                          overview['counts']['live_sessions']), (1, 1, 1))
        teachers = self.client.get('/api/admin/instructors/').data
        self.assertEqual((teachers[0]['username'], teachers[0]['courses'], teachers[0]['students']), ('teach', 1, 1))
        students = self.client.get('/api/admin/students/').data
        self.assertEqual(students[0]['classes'][0]['course'], 'CS1')

        res = self.client.post('/api/admin/instructors/', {
            'first_name': 'New', 'last_name': 'Teacher', 'username': 'newt', 'password': '1', 'email': 'n@x.org',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(User.objects.get(username='newt').role, 'instructor')
        self.client.force_authenticate(None)
        login = self.client.post('/api/auth/login/', {'username': 'newt', 'password': '1'})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data['user']['role'], 'instructor')

    def test_taken_username_is_refused(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/admin/instructors/', {'first_name': 'A', 'username': 'TEACH', 'password': 'p'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('username', res.data)

    def test_disabled_account_cannot_sign_in_and_admins_cannot_be_edited(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(f'/api/admin/accounts/{self.teacher.id}/', {'is_active': False}, format='json')
        self.assertEqual((res.status_code, res.data['is_active']), (200, False))
        self.assertEqual(self.client.patch(f'/api/admin/accounts/{self.admin.id}/', {'is_active': False},
                                           format='json').status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post('/api/auth/login/', {'username': 'teach', 'password': 'pw'}).status_code, 401)

    def test_admin_resets_a_password(self):
        self.client.force_authenticate(self.admin)
        self.client.patch(f'/api/admin/accounts/{self.student.id}/', {'password': 'fresh'}, format='json')
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post('/api/auth/login/', {'username': 'kid', 'password': 'fresh'}).status_code, 200)

    def test_activity_is_logged_and_filterable(self):
        self.client.post('/api/auth/login/', {'username': 'teach', 'password': 'wrong'})
        self.client.post('/api/auth/login/', {'username': 'teach', 'password': 'pw'})
        self.client.post('/api/courses/', {'title': 'Algo', 'code': 'CS2'}, format='json')
        self.client.post('/api/auth/logout/')
        self.client.post('/api/auth/login/', {'username': 'kid', 'password': 'pw'})

        self.client.force_authenticate(self.admin)
        logs = self.client.get('/api/admin/logs/?role=instructor').data
        self.assertEqual([r['action'] for r in logs['results']], ['logout', 'course_created', 'login', 'login_failed'])
        self.assertIn('CS2', logs['results'][1]['detail'])
        self.assertEqual(logs['results'][2]['label'], 'Signed in')
        students = self.client.get('/api/admin/logs/?role=student&action=login').data
        self.assertEqual((students['total'], students['results'][0]['username']), (1, 'kid'))
        self.assertIsNotNone(User.objects.get(username='kid').last_login)
