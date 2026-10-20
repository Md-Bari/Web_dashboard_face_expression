from django.db import migrations, models
import django.db.models.deletion

from apps.courses.models import generate_join_code


def unique_codes(model, field, used):
    code = generate_join_code()
    while code in used or model.objects.filter(**{field: code}).exists():
        code = generate_join_code()
    used.add(code)
    return code


def forwards(apps, schema_editor):
    """Every existing class gets a section "A" holding its students; every session a meeting code."""
    Course = apps.get_model('courses', 'Course')
    Section = apps.get_model('courses', 'Section')
    Enrollment = apps.get_model('courses', 'Enrollment')
    ClassSession = apps.get_model('courses', 'ClassSession')
    used = set(Course.objects.values_list('join_code', flat=True))
    for course in Course.objects.all():
        section = Section.objects.create(course=course, name='A', join_code=unique_codes(Section, 'join_code', used))
        Enrollment.objects.filter(course=course).update(section=section)
    for session in ClassSession.objects.all():
        session.join_code = unique_codes(ClassSession, 'join_code', used)
        session.save(update_fields=['join_code'])


class Migration(migrations.Migration):

    dependencies = [
        ('courses', '0002_course_join_code'),
    ]

    operations = [
        migrations.CreateModel(
            name='Section',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=50)),
                ('join_code', models.CharField(default=generate_join_code, max_length=12, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sections', to='courses.course')),
            ],
            options={
                'ordering': ['name'],
                'unique_together': {('course', 'name')},
            },
        ),
        migrations.AddField(
            model_name='enrollment',
            name='section',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='enrollments', to='courses.section'),
        ),
        migrations.AddField(
            model_name='classsession',
            name='sections',
            field=models.ManyToManyField(blank=True, related_name='sessions', to='courses.section'),
        ),
        migrations.AddField(
            model_name='classsession',
            name='scheduled_for',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='classsession',
            name='join_code',
            field=models.CharField(max_length=12, null=True),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='classsession',
            name='join_code',
            field=models.CharField(default=generate_join_code, max_length=12, unique=True),
        ),
    ]
