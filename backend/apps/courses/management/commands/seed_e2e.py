import json
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.analytics.models import ParticipantStat, SessionSnapshot
from apps.courses.models import ClassSession, Course, Enrollment, Section

User = get_user_model()

PREFIX = 'e2e_pw_'      # every account this command makes
COURSE_PREFIX = 'E2E-PW-'


def clean():
    """Remove everything a previous run created (courses cascade to sections, sessions and analytics)."""
    Course.objects.filter(code__startswith=COURSE_PREFIX).delete()
    User.objects.filter(username__startswith=PREFIX).delete()


class Command(BaseCommand):
    help = ("Creates throwaway data for the Playwright end-to-end tests and prints it as JSON. "
            "Passwords are random per run. --clean only removes it.")

    def add_arguments(self, parser):
        parser.add_argument('--clean', action='store_true', help='Only remove the test data.')

    def handle(self, *args, **options):
        clean()
        if options['clean']:
            return

        now = timezone.now()
        password = secrets.token_urlsafe(16)

        def user(name, role, first, last=''):
            return User.objects.create_user(username=PREFIX + name, password=password, role=role,
                                            first_name=first, last_name=last)

        teacher = user('teacher', 'instructor', 'Ayesha', 'Rahman')
        student = user('student', 'student', 'Nadia', 'Islam')
        newbie = user('newbie', 'student', 'Rafi', 'Ahmed')   # no classes yet, no consent

        oop = Course.objects.create(title='Object Oriented Programming', code=COURSE_PREFIX + 'OOP', instructor=teacher)
        db = Course.objects.create(title='Database Systems', code=COURSE_PREFIX + 'DB', instructor=teacher)
        net = Course.objects.create(title='Computer Networks', code=COURSE_PREFIX + 'NET', instructor=teacher)
        oop_a = Section.objects.create(course=oop, name='A')
        oop_b = Section.objects.create(course=oop, name='B')
        db_c = Section.objects.create(course=db, name='C')
        net_d = Section.objects.create(course=net, name='D')
        Enrollment.objects.create(course=oop, student=student, section=oop_a)
        Enrollment.objects.create(course=db, student=student, section=db_c)

        def session(course, title, sections, **extra):
            s = ClassSession.objects.create(course=course, title=title,
                                            session_code=f'{COURSE_PREFIX}{secrets.token_hex(4)}', **extra)
            s.sections.set(sections)
            return s

        live = session(oop, 'Lecture 5: Inheritance', [oop_a], status='LIVE', started_at=now - timedelta(minutes=10))
        session(oop, 'Section B lab', [oop_b], status='LIVE', started_at=now)
        upcoming = session(db, 'SQL joins workshop', [db_c], status='SCHEDULED',
                           scheduled_for=now + timedelta(hours=2, minutes=15))
        startable = session(net, 'Networks lab', [net_d], status='SCHEDULED')  # the instructor test starts it
        ended = session(oop, 'Lecture 4: Encapsulation', [oop_a], status='ENDED',
                        started_at=now - timedelta(days=1, hours=1), ended_at=now - timedelta(days=1))
        ParticipantStat.objects.create(
            session=ended, student=student,
            emotion_counts={'happy': 30, 'neutral': 50, 'sad': 10, 'angry': 0, 'fear': 5, 'surprise': 5},
            attention_total=82.0, confidence_total=70.0, samples=100,
        )
        SessionSnapshot.objects.create(session=ended, total_students=1, avg_concentration=82,
                                       emotion_counts={'happy': 0, 'neutral': 1, 'sad': 0, 'angry': 0,
                                                       'fear': 0, 'surprise': 0})

        self.stdout.write(json.dumps({
            'password': password,
            'teacher': teacher.username,
            'student': student.username,
            'newbie': newbie.username,
            'courses': {'oop': oop.title, 'db': db.title, 'net': net.title},
            'net_invite': net_d.join_code,
            'oop_invite_a': oop_a.join_code,
            'live': {'id': live.id, 'title': live.title, 'code': live.join_code},
            'upcoming': {'id': upcoming.id, 'title': upcoming.title, 'code': upcoming.join_code},
            'startable': {'id': startable.id, 'title': startable.title, 'code': startable.join_code},
            'ended': {'id': ended.id, 'title': ended.title},
        }))
