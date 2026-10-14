from django.contrib import admin

from .models import Prediction, SessionSnapshot, TeachingSuggestion


@admin.register(Prediction)
class PredictionAdmin(admin.ModelAdmin):
    list_display = ('student', 'session', 'smoothed_emotion', 'smoothed_attention', 'confidence', 'timestamp')
    list_filter = ('session', 'smoothed_emotion')


@admin.register(SessionSnapshot)
class SessionSnapshotAdmin(admin.ModelAdmin):
    list_display = ('session', 'timestamp', 'total_students', 'positive_pct', 'neutral_pct', 'negative_pct', 'avg_concentration')
    list_filter = ('session',)


@admin.register(TeachingSuggestion)
class TeachingSuggestionAdmin(admin.ModelAdmin):
    list_display = ('title', 'session', 'category', 'is_dismissed', 'created_at')
    list_filter = ('session', 'category', 'is_dismissed')
