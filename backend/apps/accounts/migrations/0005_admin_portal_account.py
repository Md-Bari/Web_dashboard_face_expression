"""
The admin portal account. It signs in on the normal login page and lands on /admin.

Username and password come from ADMIN_USERNAME / ADMIN_PASSWORD (defaults below). Change the
password after the first sign-in on a server others can reach.
"""
import os

from django.contrib.auth.hashers import make_password
from django.db import migrations


def create_admin(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    username = os.environ.get('ADMIN_USERNAME', 'shitol@admin')
    password = os.environ.get('ADMIN_PASSWORD', '123456')
    user = User.objects.filter(username=username).first() or User(username=username, first_name='Admin')
    user.role = 'admin'
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True
    user.password = make_password(password)
    user.save()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_activity_log'),
    ]

    operations = [
        migrations.RunPython(create_admin, migrations.RunPython.noop),
    ]
