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


# ---------------------------------------------------------------- classes, sections, meetings

from datetime import timedelta  # noqa: E402
from unittest import mock  # noqa: E402

import jwt  # noqa: E402
from django.test import override_settings  # noqa: E402
from django.utils import timezone  # noqa: E402

from apps.courses.models import Enrollment, Section  # noqa: E402

LIVEKIT = dict(LIVEKIT_URL='wss://lk.example.test', LIVEKIT_API_KEY='APItest', LIVEKIT_API_SECRET='s' * 40)


@override_settings(**LIVEKIT)
@mock.patch('apps.courses.livekit.close_room')
class ClassSectionTestCase(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.teacher = User.objects.create_user(username='teach', password='x', role='instructor')
        self.other = User.objects.create_user(username='other_teach', password='x', role='instructor')
        self.course = Course.objects.create(title='Physics', code='PHY1', instructor=self.teacher)
        self.a = Section.objects.create(course=self.course, name='A')
        self.b = Section.objects.create(course=self.course, name='B')
        self.ann = User.objects.create_user(username='ann', password='x', role='student', first_name='Ann')
        self.bob = User.objects.create_user(username='bob', password='x', role='student', email='bob@uni.test')
        Enrollment.objects.create(course=self.course, student=self.ann, section=self.a)
        self.api.force_authenticate(self.teacher)

    def session(self, sections=(), status='LIVE'):
        session = ClassSession.objects.create(course=self.course, title='Lecture', session_code=f'S{ClassSession.objects.count()}',
                                              status=status, started_at=timezone.now())
        session.sections.set(sections)
        return session

    def test_new_class_starts_with_section_a_and_lists_sections(self, _close):
        res = self.api.post('/api/courses/', {'title': 'Chemistry', 'code': 'CHE1'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual([s['name'] for s in res.data['sections']], ['A'])
        course = self.api.get(f'/api/courses/{self.course.id}/').data
        self.assertEqual([(s['name'], s['total_students']) for s in course['sections']], [('A', 1), ('B', 0)])

    def test_sections_are_unique_per_class_and_private_to_the_instructor(self, _close):
        res = self.api.post('/api/sections/', {'course_id': self.course.id, 'name': 'a'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.api.post('/api/sections/', {'course_id': self.course.id, 'name': 'C'}, format='json').status_code, 201)
        self.api.force_authenticate(self.other)
        self.assertEqual(self.api.get(f'/api/sections/?course={self.course.id}').data, [])
        res = self.api.post('/api/sections/', {'course_id': self.course.id, 'name': 'D'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_add_move_filter_and_remove_students(self, _close):
        res = self.api.post('/api/enrollments/', {'course_id': self.course.id, 'identifier': 'bob@uni.test',
                                                  'section_id': self.b.id}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['section']['name'], 'B')
        again = self.api.post('/api/enrollments/', {'course_id': self.course.id, 'identifier': 'bob'}, format='json')
        self.assertEqual(again.status_code, 400)
        missing = self.api.post('/api/enrollments/', {'course_id': self.course.id, 'identifier': 'nobody',
                                                      'section_id': self.a.id}, format='json')
        self.assertEqual(missing.status_code, 404)
        no_section = self.api.post('/api/enrollments/', {'course_id': self.course.id, 'identifier': 'bob'}, format='json')
        self.assertEqual(no_section.status_code, 400)

        in_b = self.api.get(f'/api/enrollments/?course={self.course.id}&section={self.b.id}').data
        self.assertEqual([e['student']['username'] for e in in_b], ['bob'])
        enrollment_id = in_b[0]['id']
        # Every student stays in a section: moving is fine, taking the section away is not
        self.assertEqual(self.api.patch(f'/api/enrollments/{enrollment_id}/', {'section_id': None}, format='json').status_code, 400)
        self.assertEqual(self.api.patch(f'/api/enrollments/{enrollment_id}/', {'section_id': self.a.id}, format='json').status_code, 200)
        self.assertEqual(len(self.api.get(f'/api/enrollments/?course={self.course.id}&section={self.a.id}').data), 2)
        self.assertEqual(self.api.delete(f'/api/enrollments/{enrollment_id}/').status_code, 204)
        self.assertFalse(Enrollment.objects.filter(student=self.bob).exists())

    def test_csv_import_adds_moves_and_reports_unknown_accounts(self, _close):
        csv_text = 'username,section\nbob,C\nann,B\nghost,A\nteach,A\n'
        refused = self.api.post('/api/enrollments/import/', {'course_id': self.course.id, 'csv': csv_text}, format='json')
        self.assertEqual(refused.status_code, 400)  # rows without a section need a default one
        res = self.api.post('/api/enrollments/import/', {'course_id': self.course.id, 'csv': csv_text,
                                                         'section_id': self.a.id}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['added'], ['bob'])
        self.assertEqual(res.data['moved'], ['Ann'])
        self.assertEqual(res.data['not_found'], ['ghost'])
        self.assertEqual(res.data['not_student'], ['teach'])
        self.assertEqual(Enrollment.objects.get(student=self.bob).section.name, 'C')  # section created

    def test_section_invite_link_places_new_students_in_that_section(self, _close):
        self.api.force_authenticate(None)
        info = self.api.get(f'/api/join/{self.b.join_code}/').data
        self.assertEqual(info['section'], 'B')
        res = self.api.post(f'/api/join/{self.b.join_code}/register/', {
            'first_name': 'Cat', 'username': 'cat_b', 'password': 'Sunflower-River-77',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Enrollment.objects.get(student__username='cat_b').section, self.b)

    def test_students_only_see_sessions_for_their_section(self, _close):
        for_a, for_b, whole = self.session([self.a]), self.session([self.b]), self.session()
        self.api.force_authenticate(self.ann)
        ids = {s['id'] for s in self.api.get('/api/sessions/').data}
        self.assertEqual(ids, {for_a.id, whole.id})
        self.assertNotIn(for_b.id, ids)

    def test_meeting_pass_for_host_and_allowed_student_only(self, _close):
        session = self.session([self.a])
        host = self.api.post(f'/api/sessions/{session.id}/meeting/').data
        claims = jwt.decode(host['token'], LIVEKIT['LIVEKIT_API_SECRET'], algorithms=['HS256'])
        self.assertTrue(host['host'])
        self.assertEqual((claims['sub'], claims['video']['room'], claims['video'].get('roomAdmin')),
                         (f'user-{self.teacher.id}', session.room_name, True))

        self.api.force_authenticate(self.ann)
        refused = self.api.post(f'/api/sessions/{session.id}/meeting/')
        self.assertEqual((refused.status_code, refused.data['code']), (403, 'consent_required'))
        student = self.api.post(f'/api/sessions/{session.id}/meeting/', {'consent': True}, format='json')
        self.assertEqual(student.status_code, 200)
        grant = jwt.decode(student.data['token'], LIVEKIT['LIVEKIT_API_SECRET'], algorithms=['HS256'])['video']
        self.assertEqual(grant['canPublishSources'], ['camera', 'microphone'])
        self.assertNotIn('roomAdmin', grant)

        Enrollment.objects.create(course=self.course, student=self.bob, section=self.b)
        self.bob.give_consent()
        self.api.force_authenticate(self.bob)
        self.assertEqual(self.api.post(f'/api/sessions/{session.id}/meeting/').status_code, 404)  # not his section

    def test_meeting_waits_until_the_session_is_live(self, _close):
        session = self.session([self.a], status='SCHEDULED')
        res = self.api.post(f'/api/sessions/{session.id}/meeting/')
        self.assertEqual((res.status_code, res.data['code']), (409, 'not_live'))

    @override_settings(LIVEKIT_URL='')
    def test_meetings_report_when_not_configured(self, _close):
        res = self.api.post(f'/api/sessions/{self.session().id}/meeting/')
        self.assertEqual(res.status_code, 503)

    def test_meeting_link_enrolls_only_when_the_section_is_clear(self, _close):
        one_section, two_sections = self.session([self.b]), self.session([self.a, self.b])
        self.api.force_authenticate(self.bob)
        info = self.api.get(f'/api/meet/{one_section.join_code}/').data
        self.assertEqual((info['viewer']['enrolled'], info['viewer']['allowed']), (False, False))
        self.assertEqual(self.api.post(f'/api/meet/{one_section.join_code}/enroll/').status_code, 200)
        self.assertEqual(Enrollment.objects.get(student=self.bob).section, self.b)

        Enrollment.objects.filter(student=self.bob).delete()
        refused = self.api.post(f'/api/meet/{two_sections.join_code}/enroll/')
        self.assertEqual(refused.status_code, 403)
        self.assertFalse(Enrollment.objects.filter(student=self.bob).exists())

        # A whole-class session of a class with several sections cannot tell the section either
        whole_class = self.session()
        self.assertEqual(self.api.post(f'/api/meet/{whole_class.join_code}/enroll/').status_code, 403)
        self.assertFalse(self.api.get(f'/api/meet/{whole_class.join_code}/').data['can_register'])

        self.api.force_authenticate(self.ann)  # in section A: not allowed into a section-B session
        self.assertEqual(self.api.post(f'/api/meet/{one_section.join_code}/enroll/').status_code, 403)

    def test_meeting_link_info_is_public(self, _close):
        session = self.session([self.a])
        self.api.force_authenticate(None)
        info = self.api.get(f'/api/meet/{session.join_code}/').data
        self.assertEqual(info['viewer'], {'signed_in': False})
        self.assertEqual(info['session']['sections'], ['A'])
        self.assertEqual(self.api.get('/api/meet/NOPE1234/').status_code, 404)

    def test_ending_a_session_closes_its_meeting_room(self, close_room):
        session = self.session()
        self.assertEqual(self.api.post(f'/api/sessions/{session.id}/end/').status_code, 200)
        close_room.assert_called_once_with(session.room_name)

    def test_forgotten_live_sessions_end_automatically(self, close_room):
        from apps.courses.services import end_stale_sessions
        old, fresh = self.session(), self.session()
        ClassSession.objects.filter(id=old.id).update(started_at=timezone.now() - timedelta(hours=9))
        self.assertEqual(end_stale_sessions(), 1)
        old.refresh_from_db()
        fresh.refresh_from_db()
        self.assertEqual((old.status, fresh.status), ('ENDED', 'LIVE'))

    def test_class_wide_link_needs_a_single_section(self, _close):
        self.api.force_authenticate(None)
        res = self.api.get(f'/api/join/{self.course.join_code}/')  # two sections: which one?
        self.assertEqual(res.status_code, 404)
        self.assertIn("section's invite link", res.data['detail'])
        self.b.delete()
        info = self.api.get(f'/api/join/{self.course.join_code}/').data
        self.assertEqual(info['section'], 'A')  # the only section


class StudentDashboardTestCase(TestCase):
    """A student in two classes sees each class with their own section and only that section's sessions."""

    def setUp(self):
        User = get_user_model()
        self.teacher = User.objects.create_user(username='dash_teacher', password='x', role='instructor')
        self.student = User.objects.create_user(username='dash_student', password='x', role='student')
        self.math = Course.objects.create(title='Math', code='MATH', instructor=self.teacher)
        self.bio = Course.objects.create(title='Bio', code='BIO', instructor=self.teacher)
        self.math_a = Section.objects.create(course=self.math, name='A')
        self.math_b = Section.objects.create(course=self.math, name='B')
        self.bio_c = Section.objects.create(course=self.bio, name='C')
        Enrollment.objects.create(course=self.math, student=self.student, section=self.math_a)
        Enrollment.objects.create(course=self.bio, student=self.student, section=self.bio_c)
        self.api = APIClient()
        self.api.force_authenticate(self.student)

    def _session(self, course, title, sections=(), **extra):
        s = ClassSession.objects.create(course=course, title=title, session_code=title.replace(' ', '-'), **extra)
        s.sections.set(sections)
        return s

    def test_courses_show_my_section_without_invite_codes(self):
        courses = {c['code']: c for c in self.api.get('/api/courses/').data}
        self.assertEqual(set(courses), {'MATH', 'BIO'})
        self.assertEqual(courses['MATH']['my_section']['name'], 'A')
        self.assertEqual(courses['BIO']['my_section']['name'], 'C')
        for course in courses.values():
            self.assertNotIn('join_code', course)
            self.assertNotIn('sections', course)

    def test_sessions_are_per_course_and_section(self):
        self._session(self.math, 'Math A live', [self.math_a], status='LIVE')
        self._session(self.math, 'Math B only', [self.math_b], status='LIVE')
        self._session(self.math, 'Math whole class', status='SCHEDULED',
                      scheduled_for=timezone.now() + timedelta(days=1))
        self._session(self.bio, 'Bio C', [self.bio_c], status='SCHEDULED',
                      scheduled_for=timezone.now() + timedelta(hours=2))
        other = Course.objects.create(title='Art', code='ART', instructor=self.teacher)
        self._session(other, 'Not my class', status='LIVE')
        rows = self.api.get('/api/sessions/').data
        titles = [r['title'] for r in rows]
        self.assertEqual(titles, ['Math A live', 'Bio C', 'Math whole class'])  # live first, then by start time
        self.assertEqual({r['course']['code'] for r in rows}, {'MATH', 'BIO'})
        self.assertTrue(all('join_code' not in r['course'] for r in rows))

    def test_instructors_still_see_invite_codes(self):
        self.api.force_authenticate(self.teacher)
        course = self.api.get(f'/api/courses/{self.math.id}/').data
        self.assertEqual(course['join_code'], self.math.join_code)
        self.assertEqual(len(course['sections']), 2)
