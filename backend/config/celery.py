import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('emp_edu')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.beat_schedule = {
    'aggregate-live-sessions-every-3s': {
        'task': 'apps.analytics.tasks.aggregate_active_sessions',
        'schedule': 3.0,
    },
}

