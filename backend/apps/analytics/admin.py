from django.contrib import admin

from .models import ExpressionSnapshot, Prediction, SessionSnapshot, TeachingSuggestion


@admin.register(Prediction)
class PredictionAdmin(admin.ModelAdmin):
    list_display = ('student', 'session', 'smoothed_emotion', 'smoothed_attention', 'confidence', 'timestamp')
    list_filter = ('session', 'smoothed_emotion')


@admin.register(SessionSnapshot)
class SessionSnapshotAdmin(admin.ModelAdmin):
    list_display = ('session', 'timestamp', 'total_students', 'emotion_counts', 'avg_concentration')
    list_filter = ('session',)


@admin.register(TeachingSuggestion)
class TeachingSuggestionAdmin(admin.ModelAdmin):
    list_display = ('title', 'session', 'category', 'is_dismissed', 'created_at')
    list_filter = ('session', 'category', 'is_dismissed')


@admin.register(ExpressionSnapshot)
class ExpressionSnapshotAdmin(admin.ModelAdmin):
    list_display = ('student', 'session', 'emotion', 'confidence', 'image', 'created_at')
    list_filter = ('session', 'emotion')
    search_fields = ('student__username', 'student__first_name', 'student__last_name')
