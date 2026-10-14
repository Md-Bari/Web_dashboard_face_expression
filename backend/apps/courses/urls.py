from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClassSessionViewSet, CourseViewSet, JoinEnrollView, JoinInfoView, JoinRegisterView, PublicLiveSessionView,
)

router = DefaultRouter()
router.register(r'courses', CourseViewSet, basename='course')
router.register(r'sessions', ClassSessionViewSet, basename='session')

urlpatterns = [
    path('public/live-session/', PublicLiveSessionView.as_view(), name='public_live_session'),
    path('join/<str:code>/', JoinInfoView.as_view(), name='join_info'),
    path('join/<str:code>/enroll/', JoinEnrollView.as_view(), name='join_enroll'),
    path('join/<str:code>/register/', JoinRegisterView.as_view(), name='join_register'),
    path('', include(router.urls)),
]

