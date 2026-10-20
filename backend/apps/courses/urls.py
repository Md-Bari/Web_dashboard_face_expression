from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClassSessionViewSet, CourseViewSet, EnrollmentViewSet, JoinEnrollView, JoinInfoView, JoinRegisterView,
    MeetEnrollView, MeetInfoView, MeetRegisterView, PublicLiveSessionView, SectionViewSet,
)

router = DefaultRouter()
router.register(r'courses', CourseViewSet, basename='course')
router.register(r'sessions', ClassSessionViewSet, basename='session')
router.register(r'sections', SectionViewSet, basename='section')
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')

urlpatterns = [
    path('public/live-session/', PublicLiveSessionView.as_view(), name='public_live_session'),
    path('join/<str:code>/', JoinInfoView.as_view(), name='join_info'),
    path('join/<str:code>/enroll/', JoinEnrollView.as_view(), name='join_enroll'),
    path('join/<str:code>/register/', JoinRegisterView.as_view(), name='join_register'),
    path('meet/<str:code>/', MeetInfoView.as_view(), name='meet_info'),
    path('meet/<str:code>/enroll/', MeetEnrollView.as_view(), name='meet_enroll'),
    path('meet/<str:code>/register/', MeetRegisterView.as_view(), name='meet_register'),
    path('', include(router.urls)),
]

