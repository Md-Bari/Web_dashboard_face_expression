from django.urls import path

from .admin_api import AccountDetailView, ActivityLogView, InstructorListView, OverviewView, StudentListView

urlpatterns = [
    path('overview/', OverviewView.as_view(), name='admin_overview'),
    path('instructors/', InstructorListView.as_view(), name='admin_instructors'),
    path('students/', StudentListView.as_view(), name='admin_students'),
    path('accounts/<int:user_id>/', AccountDetailView.as_view(), name='admin_account'),
    path('logs/', ActivityLogView.as_view(), name='admin_logs'),
]
