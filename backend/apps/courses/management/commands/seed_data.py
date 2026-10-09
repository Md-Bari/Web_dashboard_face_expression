from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.courses.models import Course, Enrollment, ClassSession
from apps.analytics.models import Prediction, SessionSnapshot, TeachingSuggestion

User = get_user_model()

STUDENTS_DATA = [
    {"id": 1, "name": "Alice", "emotion": "positive", "gender": "f"},
    {"id": 2, "name": "Bob", "emotion": "positive", "gender": "m"},
    {"id": 3, "name": "Charlie", "emotion": "neutral", "gender": "f"},
    {"id": 4, "name": "Diana", "emotion": "positive", "gender": "f"},
    {"id": 5, "name": "Ethan", "emotion": "neutral", "gender": "m"},
    {"id": 6, "name": "Fiona", "emotion": "neutral", "gender": "f"},
    {"id": 7, "name": "George", "emotion": "negative", "gender": "m"},
    {"id": 8, "name": "Hannah", "emotion": "positive", "gender": "f"},
    {"id": 9, "name": "Ian", "emotion": "neutral", "gender": "m"},
    {"id": 10, "name": "Jane", "emotion": "negative", "gender": "f"},
    {"id": 11, "name": "Kevin", "emotion": "positive", "gender": "m"},
    {"id": 12, "name": "Laura", "emotion": "neutral", "gender": "f"},
    {"id": 13, "name": "Michael", "emotion": "positive", "gender": "m"},
    {"id": 14, "name": "Natapong", "emotion": "negative", "gender": "m"},
    {"id": 15, "name": "Naruwol", "emotion": "positive", "gender": "f"},
    {"id": 16, "name": "Oan", "emotion": "neutral", "gender": "m"},
    {"id": 17, "name": "Quinn", "emotion": "positive", "gender": "f"},
    {"id": 18, "name": "Rachel", "emotion": "neutral", "gender": "f"},
    {"id": 19, "name": "Sarah", "emotion": "positive", "gender": "f"},
    {"id": 20, "name": "Tom", "emotion": "negative", "gender": "m"},
    {"id": 21, "name": "Uma", "emotion": "neutral", "gender": "f"},
    {"id": 22, "name": "Victor", "emotion": "positive", "gender": "m"},
    {"id": 23, "name": "Pat", "emotion": "neutral", "gender": "f"},
    {"id": 24, "name": "Quinn B.", "emotion": "positive", "gender": "m"},
    {"id": 25, "name": "Yara", "emotion": "neutral", "gender": "f"},
    {"id": 26, "name": "Zach", "emotion": "negative", "gender": "m"},
    {"id": 27, "name": "Aom", "emotion": "positive", "gender": "f"},
    {"id": 28, "name": "Ben", "emotion": "neutral", "gender": "m"},
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

            # Create initial Prediction
            raw_emotion = sdata["emotion"]
            attention = 0.85 if raw_emotion == "positive" else (0.70 if raw_emotion == "neutral" else 0.45)
            if not Prediction.objects.filter(session=session, student=student_user).exists():
                Prediction.objects.create(
                    session=session,
                    student=student_user,
                    raw_emotion=raw_emotion,
                    confidence=0.92,
                    raw_attention=attention,
                    smoothed_emotion=raw_emotion,
                    smoothed_attention=attention,
                )

        # 5. Create SessionSnapshot matching image (16 Positive, 8 Neutral, 4 Negative, 72% Avg)
        if not SessionSnapshot.objects.filter(session=session).exists():
            SessionSnapshot.objects.create(
                session=session,
                total_students=28,
                positive_count=16,
                positive_pct=57.0,
                neutral_count=8,
                neutral_pct=28.0,
                negative_count=4,
                negative_pct=15.0,
                avg_concentration=72.0,
                low_concentration_count=3,
            )

        # 6. Create AI Teaching Suggestions matching the screenshot
        suggestions = [
            ("Consider adding more examples", "15% of students look confused. Adding practical examples may help.", "CONFUSION", "book"),
            ("Engage students with a quick poll", "Neutral sentiment is high. Try an interactive poll or question.", "ENGAGEMENT", "users"),
            ("Take a short break", "Attention levels are dropping for some students.", "FATIGUE", "clock"),
            ("Encourage participation", "Ask open-ended questions to improve engagement.", "PARTICIPATION", "message-square"),
        ]
        for title, description, category, icon in suggestions:
            if not TeachingSuggestion.objects.filter(session=session, title=title).exists():
                TeachingSuggestion.objects.create(
                    session=session,
                    title=title,
                    description=description,
                    category=category,
                    icon=icon,
                )

        self.stdout.write(self.style.SUCCESS("EMP-EDU demo environment successfully seeded!"))

