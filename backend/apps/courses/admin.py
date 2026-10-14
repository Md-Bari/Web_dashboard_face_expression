from django.contrib import admin

from .models import ClassSession, Course, Enrollment


class EnrollmentInline(admin.TabularInline):
    model = Enrollment
    extra = 1
    autocomplete_fields = ('student',)


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('code', 'title', 'instructor', 'created_at')
    search_fields = ('code', 'title')
    inlines = (EnrollmentInline,)


@admin.register(ClassSession)
class ClassSessionAdmin(admin.ModelAdmin):
    list_display = ('title', 'course', 'session_code', 'status', 'started_at', 'ended_at')
    list_filter = ('status', 'course')
    search_fields = ('title', 'session_code')
