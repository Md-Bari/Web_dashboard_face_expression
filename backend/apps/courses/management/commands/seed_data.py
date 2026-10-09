from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.courses.models import Course, Enrollment, ClassSession

User = get_user_model()

STUDENTS_DATA = [
    {"id": 1, "name": "Alice", "gender": "f"},
    {"id": 2, "name": "Bob", "gender": "m"},
    {"id": 3, "name": "Charlie", "gender": "f"},
    {"id": 4, "name": "Diana", "gender": "f"},
    {"id": 5, "name": "Ethan", "gender": "m"},
    {"id": 6, "name": "Fiona", "gender": "f"},
    {"id": 7, "name": "George", "gender": "m"},
    {"id": 8, "name": "Hannah", "gender": "f"},
    {"id": 9, "name": "Ian", "gender": "m"},
    {"id": 10, "name": "Jane", "gender": "f"},
    {"id": 11, "name": "Kevin", "gender": "m"},
    {"id": 12, "name": "Laura", "gender": "f"},
    {"id": 13, "name": "Michael", "gender": "m"},
    {"id": 14, "name": "Natapong", "gender": "m"},
    {"id": 15, "name": "Naruwol", "gender": "f"},
    {"id": 16, "name": "Oan", "gender": "m"},
    {"id": 17, "name": "Quinn", "gender": "f"},
    {"id": 18, "name": "Rachel", "gender": "f"},
    {"id": 19, "name": "Sarah", "gender": "f"},
    {"id": 20, "name": "Tom", "gender": "m"},
    {"id": 21, "name": "Uma", "gender": "f"},
    {"id": 22, "name": "Victor", "gender": "m"},
    {"id": 23, "name": "Pat", "gender": "f"},
    {"id": 24, "name": "Quinn B.", "gender": "m"},
    {"id": 25, "name": "Yara", "gender": "f"},
    {"id": 26, "name": "Zach", "gender": "m"},
    {"id": 27, "name": "Aom", "gender": "f"},
    {"id": 28, "name": "Ben", "gender": "m"},
]

class Command(BaseCommand):
    help = "Seeds database with instructor, course, 28 students, and live lecture session matching the dashboard design."

    def handle(self, *args, **options):
        self.stdout.write("Seeding EMP-EDU initial data...")

        # 1. Create or get Instructor
        instructor, created = User.objects.get_or_create(
            username="instructor",
            defaults={
                "email": "laohakangvalvit@emp-edu.org",
                "first_name": "Dr.",
                "last_name": "Laohakangvalvit",
                "display_title": "Dr. Laohakangvalvit",
                "role": "instructor",
                "avatar_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
                "consent_given": True,
            }
        )
        if created:
            instructor.set_password("password123")
            instructor.save()
            self.stdout.write(self.style.SUCCESS("Created instructor: Dr. Laohakangvalvit (login: instructor / password123)"))

        # Django admin account (README: admin / password123)
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "admin@emp-edu.org", "password123", role="admin")
            self.stdout.write(self.style.SUCCESS("Created Django admin (login: admin / password123)"))

        # 2. Create Course
        course, _ = Course.objects.get_or_create(
            code="CS201",
            defaults={
                "title": "Data Structures",
                "description": "Fundamental data structures, algorithms, and complexity analysis.",
                "instructor": instructor,
            }
        )

        # 3. Create ClassSession
        session, _ = ClassSession.objects.get_or_create(
            session_code="DS201-L5",
            defaults={
                "course": course,
                "title": "Data Structures - Lecture 5",
                "status": "LIVE",
                "started_at": timezone.now(),
            }
        )
        session.status = "LIVE"
        session.save()

        # 4. Create 28 Students and Enroll them
        avatars_f = [
            "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        ]
        avatars_m = [
            "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
            "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80",
        ]

        for idx, sdata in enumerate(STUDENTS_DATA):
            username = f"student_{sdata['id']}"
            avatar = avatars_f[idx % len(avatars_f)] if sdata["gender"] == "f" else avatars_m[idx % len(avatars_m)]
            student_user, _ = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": sdata["name"],
                    "email": f"{username}@student.emp-edu.org",
                    "role": "student",
                    "avatar_url": avatar,
                    "consent_given": True,
                    "consent_timestamp": timezone.now(),
                }
            )
            # Enroll student
            Enrollment.objects.get_or_create(course=course, student=student_user)

        # No predictions, snapshots or suggestions are seeded: analytics only come from a real model
        # (or from Demo Telemetry, which is stored and shown as simulated).

        self.stdout.write(self.style.SUCCESS("EMP-EDU demo environment successfully seeded!"))

