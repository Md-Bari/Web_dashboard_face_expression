from django.urls import re_path
from .consumers import StudentConsumer, InstructorConsumer

websocket_urlpatterns = [
    re_path(r'^ws/student/(?P<session_id>\d+)/$', StudentConsumer.as_asgi()),
    re_path(r'^ws/instructor/(?P<session_id>\d+)/$', InstructorConsumer.as_asgi()),
]

