from django.db import migrations


def superusers_to_admin(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(is_superuser=True, role='student').update(role='admin')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(superusers_to_admin, migrations.RunPython.noop),
    ]
