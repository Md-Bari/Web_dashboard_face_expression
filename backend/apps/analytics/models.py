from django.db import models
from django.conf import settings
from apps.courses.models import ClassSession
from .emotions import EMOTION_CHOICES, empty_counts


class Prediction(models.Model):
    """
    Stores processed telemetry for a student face frame.
    PRIVACY: a prediction never holds image data - only the expression label and attention
    score. (The one-photo-per-expression snapshots are separate: see ExpressionSnapshot.)

    A row belongs either to an enrolled `student` (their own webcam) or to an anonymous
    `participant` face tracked in the instructor's screen capture (e.g. a Meet/Zoom
    gallery), keyed like "screen-3".
    """
    EMOTION_CHOICES = EMOTION_CHOICES

    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name='predictions')
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='predictions', null=True, blank=True,
    )
    participant = models.CharField(max_length=32, blank=True, default='')
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
            models.Index(fields=['session', 'participant', '-timestamp']),
        ]

    def __str__(self):
        who = self.student.username if self.student_id else self.participant
        return f"{who} - {self.smoothed_emotion} ({self.smoothed_attention:.2f})"


class SessionSnapshot(models.Model):
    """
    Periodic class-wide aggregation of all active students in the session.
    Generated every 2-5 seconds.
    """
    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name='snapshots')
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    total_students = models.PositiveIntegerField(default=0)
    # Students per expression class, e.g. {"happy": 4, "neutral": 2, ...} (all six keys)
    emotion_counts = models.JSONField(default=empty_counts)

    avg_concentration = models.FloatField(default=0.0)  # 0 to 100 percentage
    low_concentration_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['session', '-timestamp']),
        ]

    def __str__(self):
        counts = ' '.join(f"{e}:{n}" for e, n in self.emotion_counts.items() if n)
        return f"{self.session.title} snapshot @ {self.timestamp}: {counts or 'no data'}"


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



class ExpressionSnapshot(models.Model):
    """
    The first face crop of each expression a student showed in a session (one per class).
    The JPEG lives under MEDIA_ROOT (see settings.EXPRESSION_SNAPSHOTS_ENABLED); students are
    told on the consent screen, and withdrawing consent deletes their snapshots.
    """
    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name='expression_snapshots')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='expression_snapshots')
    emotion = models.CharField(max_length=20, choices=EMOTION_CHOICES)
    confidence = models.FloatField()
    image = models.CharField(max_length=255)  # path relative to MEDIA_ROOT
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['session', 'student', 'emotion']
        constraints = [
            models.UniqueConstraint(fields=['session', 'student', 'emotion'], name='one_snapshot_per_expression'),
        ]

    def __str__(self):
        return f"{self.student.username} - {self.emotion} (session {self.session_id})"
