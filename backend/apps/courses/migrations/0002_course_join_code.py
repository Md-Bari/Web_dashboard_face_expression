from django.db import migrations, models

from apps.courses.models import generate_join_code


def fill_join_codes(apps, schema_editor):
    """Give every existing course its own code (a callable default runs only once per AddField)."""
    Course = apps.get_model('courses', 'Course')
    used = set()
    for course in Course.objects.all():
        code = generate_join_code()
        while code in used:
            code = generate_join_code()
        used.add(code)
        course.join_code = code
        course.save(update_fields=['join_code'])


class Migration(migrations.Migration):

    dependencies = [
        ('courses', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='course',
            name='join_code',
            field=models.CharField(max_length=12, null=True),
        ),
        migrations.RunPython(fill_join_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='course',
            name='join_code',
            field=models.CharField(default=generate_join_code, max_length=12, unique=True),
        ),
    ]
