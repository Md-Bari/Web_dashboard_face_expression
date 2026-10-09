from django.urls import path
from .views import (
    SessionHistoryView, TeachingSuggestionsView, AggregateSessionView,
    SessionReportView, SessionReportCSVView,
)

urlpatterns = [
    path('sessions/<int:session_id>/history/', SessionHistoryView.as_view(), name='session_history'),
    path('sessions/<int:session_id>/suggestions/', TeachingSuggestionsView.as_view(), name='session_suggestions'),
    path('sessions/<int:session_id>/aggregate/', AggregateSessionView.as_view(), name='session_aggregate'),
    path('sessions/<int:session_id>/report/', SessionReportView.as_view(), name='session_report'),
    path('sessions/<int:session_id>/report.csv', SessionReportCSVView.as_view(), name='session_report_csv'),
]

