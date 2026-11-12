from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import ActivityLog, User


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'username', 'role', 'action', 'detail', 'ip_address')
    list_filter = ('role', 'action')
    search_fields = ('username', 'detail', 'ip_address')
    readonly_fields = [f.name for f in ActivityLog._meta.fields]


@admin.register(User)
class EmpEduUserAdmin(UserAdmin):
    list_display = ('username', 'first_name', 'last_name', 'email', 'role', 'consent_given', 'is_staff')
    list_filter = ('role', 'consent_given', 'is_staff', 'is_superuser')
    fieldsets = UserAdmin.fieldsets + (
        ('EMP-EDU', {'fields': ('role', 'display_title', 'avatar_url', 'consent_given', 'consent_timestamp')}),
        ('Personal details', {'fields': ('phone', 'date_of_birth', 'blood_group')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('EMP-EDU', {'fields': ('role', 'first_name', 'last_name', 'email', 'display_title')}),
    )
