from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    ROLE_CHOICES = (
        ('instructor', 'Instructor'),
        ('student', 'Student'),
        ('admin', 'Admin'),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='student')
    avatar_url = models.CharField(max_length=500, blank=True, default='')
    display_title = models.CharField(max_length=100, blank=True, default='')  # e.g. Dr. Laohakangvalvit
    consent_given = models.BooleanField(default=False)
    consent_timestamp = models.DateTimeField(null=True, blank=True)

    def give_consent(self):
        self.consent_given = True
        self.consent_timestamp = timezone.now()
        self.save(update_fields=['consent_given', 'consent_timestamp'])

    def revoke_consent(self):
        self.consent_given = False
        self.consent_timestamp = None
        self.save(update_fields=['consent_given', 'consent_timestamp'])

    @property
    def is_instructor(self):
        return self.role == 'instructor' or self.is_superuser

    @property
    def is_student(self):
        return self.role == 'student'

    def __str__(self):
        name = self.get_full_name() or self.username
        return f"{name} ({self.role})"

