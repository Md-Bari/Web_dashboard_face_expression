from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CourseViewSet, ClassSessionViewSet, PublicLiveSessionView

router = DefaultRouter()
router.register(r'courses', CourseViewSet, basename='course')
router.register(r'sessions', ClassSessionViewSet, basename='session')

urlpatterns = [
    path('public/live-session/', PublicLiveSessionView.as_view(), name='public_live_session'),
    path('', include(router.urls)),
]

