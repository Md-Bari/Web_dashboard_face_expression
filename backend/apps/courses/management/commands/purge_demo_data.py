from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Q

User = get_user_model()

# Accounts the old seed_data command created; deleting them cascades to the demo course
# (CS201), its sessions, enrollments, predictions, snapshots and suggestions.
DEMO_USERS = (
    Q(username='instructor', email='laohakangvalvit@emp-edu.org')
    | Q(username='admin', email='admin@emp-edu.org')
    | Q(username__regex=r'^student_[0-9]+$', email__endswith='@student.emp-edu.org')
)


class Command(BaseCommand):
    help = "Deletes the demo accounts, course and analytics created by the old seed_data command."

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help="Actually delete (otherwise only list what would go).")

    def handle(self, *args, **options):
        users = User.objects.filter(DEMO_USERS)
        if not users.exists():
            self.stdout.write("No demo data found.")
            return

        for user in users.order_by('id'):
            self.stdout.write(f"  {user.username} ({user.role}, {user.email})")
        if not options['yes']:
            self.stdout.write(self.style.WARNING(
                f"{users.count()} demo accounts listed above. Re-run with --yes to delete them and all their data."
            ))
            return

        count = users.count()
        users.delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {count} demo accounts and their courses, sessions and analytics."))
        if not User.objects.filter(is_superuser=True).exists():
            self.stdout.write("No superuser left - create one with: python manage.py createsuperuser")
