from django.db import models
from django.conf import settings
from django.utils import timezone


class Course(models.Model):
    title = models.CharField(max_length=200)
    code = models.CharField(max_length=50)  # e.g., CS201
    description = models.TextField(blank=True, default='')
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='instructed_courses'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} - {self.title}"


class Enrollment(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='enrollments')
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='enrollments'
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('course', 'student')

    def __str__(self):
        return f"{self.student.username} in {self.course.code}"


class ClassSession(models.Model):
    STATUS_CHOICES = (
        ('SCHEDULED', 'Scheduled'),
        ('LIVE', 'Live'),
        ('ENDED', 'Ended'),
    )

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='sessions')
    title = models.CharField(max_length=200)  # e.g. Data Structures - Lecture 5
    session_code = models.CharField(max_length=50, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='SCHEDULED')
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def start_session(self):
        self.status = 'LIVE'
        self.started_at = timezone.now()
        self.ended_at = None
        self.save(update_fields=['status', 'started_at', 'ended_at'])

    def end_session(self):
        self.status = 'ENDED'
        self.ended_at = timezone.now()
        self.save(update_fields=['status', 'ended_at'])

    def __str__(self):
        return f"{self.title} ({self.status})"

