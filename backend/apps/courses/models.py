import secrets

from django.db import models
from django.conf import settings
from django.utils import timezone


JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # no 0/O, 1/I lookalikes


def generate_join_code():
    """Random code for the course's student join link (/join/<code>)."""
    return ''.join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(8))


class Course(models.Model):
    title = models.CharField(max_length=200)
    code = models.CharField(max_length=50)  # e.g., CS201
    # Anyone with the join link can enroll as a student, like a meeting link
    join_code = models.CharField(max_length=12, unique=True, default=generate_join_code)
    description = models.TextField(blank=True, default='')
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='instructed_courses'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} - {self.title}"


class Section(models.Model):
    """A group of students inside a class (e.g. "A"); its invite link puts students straight into it."""
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='sections')
    name = models.CharField(max_length=50)
    join_code = models.CharField(max_length=12, unique=True, default=generate_join_code)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = ('course', 'name')

    def __str__(self):
        return f"{self.course.code} / {self.name}"


class Enrollment(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='enrollments')
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='enrollments'
    )
    # Null: in the class but not placed in a section yet (e.g. joined with the class-wide link)
    section = models.ForeignKey(
        Section, on_delete=models.SET_NULL, null=True, blank=True, related_name='enrollments'
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
    # Which sections attend; none selected = the whole class
    sections = models.ManyToManyField(Section, blank=True, related_name='sessions')
    title = models.CharField(max_length=200)  # e.g. Data Structures - Lecture 5
    session_code = models.CharField(max_length=50, unique=True)
    # Meeting link /meet/<join_code>
    join_code = models.CharField(max_length=12, unique=True, default=generate_join_code)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='SCHEDULED')
    scheduled_for = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def room_name(self):
        """LiveKit room of this session's meeting."""
        return f"emp-edu-session-{self.id}"

    def allows(self, enrollment):
        """Whether an enrolled student belongs to the sections this session is for."""
        if enrollment is None or enrollment.course_id != self.course_id:
            return False
        section_ids = set(self.sections.values_list('id', flat=True))
        return not section_ids or enrollment.section_id in section_ids

    def attendee_enrollments(self):
        """Enrollments of the students this session is for (its sections, or the whole class)."""
        qs = self.course.enrollments.select_related('student', 'section')
        section_ids = list(self.sections.values_list('id', flat=True))
        return qs.filter(section_id__in=section_ids) if section_ids else qs

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

