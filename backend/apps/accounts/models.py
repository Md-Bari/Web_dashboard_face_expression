from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    ROLE_CHOICES = (
        ('instructor', 'Instructor'),
        ('student', 'Student'),
        ('admin', 'Admin'),
    )
    BLOOD_GROUPS = [(g, g) for g in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='student')
    avatar_url = models.CharField(max_length=500, blank=True, default='')
    display_title = models.CharField(max_length=100, blank=True, default='')  # e.g. Dr. Laohakangvalvit
    consent_given = models.BooleanField(default=False)
    consent_timestamp = models.DateTimeField(null=True, blank=True)
    # Personal details, edited by the user in Settings and shown only to them (and in /admin)
    phone = models.CharField(max_length=20, blank=True, default='')
    date_of_birth = models.DateField(null=True, blank=True)
    blood_group = models.CharField(max_length=3, choices=BLOOD_GROUPS, blank=True, default='')

    def save(self, *args, **kwargs):
        # createsuperuser does not ask for a role; a superuser is always an admin, never a student
        if self.is_superuser and self.role == 'student':
            self.role = 'admin'
        super().save(*args, **kwargs)

    def give_consent(self):
        self.consent_given = True
        self.consent_timestamp = timezone.now()
        self.save(update_fields=['consent_given', 'consent_timestamp'])

    def revoke_consent(self):
        self.consent_given = False
        self.consent_timestamp = None
        self.save(update_fields=['consent_given', 'consent_timestamp'])
        # Withdrawing consent also removes the stored expression photos (rows and files)
        # and the face templates used to recognise the student in a shared screen
        self.expression_snapshots.all().delete()
        self.face_references.all().delete()

    @property
    def is_admin(self):
        return self.role == 'admin' or self.is_superuser

    @property
    def is_instructor(self):
        return self.role == 'instructor' or self.is_admin

    @property
    def is_student(self):
        return self.role == 'student'

    def __str__(self):
        name = self.get_full_name() or self.username
        return f"{name} ({self.role})"


class ActivityLog(models.Model):
    """
    One thing a person did (signed in, started a class, added a student, ...), for the admin portal.
    The username and role are copied so the entry still reads correctly after the account changes
    or is deleted; failed sign-ins have no user, only the username that was tried.
    """
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='activity')
    username = models.CharField(max_length=150, blank=True, default='')
    role = models.CharField(max_length=20, blank=True, default='')
    action = models.CharField(max_length=40, db_index=True)
    detail = models.CharField(max_length=300, blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['role', '-created_at'])]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.username or '-'} {self.action}"

