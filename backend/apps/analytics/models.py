from django.db import models
from django.conf import settings
from apps.courses.models import ClassSession


class Prediction(models.Model):
    """
    Stores processed telemetry for a student face frame.
    PRIVACY GUARANTEE: Never stores raw images or video streams.
    Only stores the computed emotion label and attention numeric score.
    """
    EMOTION_CHOICES = (
        ('positive', 'Positive'),
        ('neutral', 'Neutral'),
        ('negative', 'Negative'),
    )

    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name='predictions')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='predictions')
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    raw_emotion = models.CharField(max_length=20, choices=EMOTION_CHOICES)
    confidence = models.FloatField(default=0.0)
    raw_attention = models.FloatField(default=0.0)  # 0.0 to 1.0

    smoothed_emotion = models.CharField(max_length=20, choices=EMOTION_CHOICES)
    smoothed_attention = models.FloatField(default=0.0)  # 0.0 to 1.0

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['session', 'student', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.student.username} - {self.smoothed_emotion} ({self.smoothed_attention:.2f})"


class SessionSnapshot(models.Model):
    """
    Periodic class-wide aggregation of all active students in the session.
    Generated every 2-5 seconds.
    """
    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name='snapshots')
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    total_students = models.PositiveIntegerField(default=0)
    positive_count = models.PositiveIntegerField(default=0)
    positive_pct = models.FloatField(default=0.0)

    neutral_count = models.PositiveIntegerField(default=0)
    neutral_pct = models.FloatField(default=0.0)

    negative_count = models.PositiveIntegerField(default=0)
    negative_pct = models.FloatField(default=0.0)

    avg_concentration = models.FloatField(default=0.0)  # 0 to 100 percentage
    low_concentration_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['session', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.session.title} snapshot @ {self.timestamp}: P:{self.positive_pct}% N:{self.neutral_pct}% Ng:{self.negative_pct}%"


class TeachingSuggestion(models.Model):
    CATEGORY_CHOICES = (
        ('CONFUSION', 'Confusion / Difficulty'),
        ('ENGAGEMENT', 'Low Engagement'),
        ('FATIGUE', 'Fatigue / Break Needed'),
        ('PARTICIPATION', 'Encourage Participation'),
    )

    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name='suggestions')
    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='ENGAGEMENT')
    icon = models.CharField(max_length=50, default='book')  # book, users, clock, message-square
    is_dismissed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.category}: {self.title}"

