from rest_framework import serializers
from .models import Course, Enrollment, ClassSession
from apps.accounts.serializers import UserSerializer


class CourseSerializer(serializers.ModelSerializer):
    instructor = UserSerializer(read_only=True)
    total_students = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ['id', 'title', 'code', 'description', 'instructor', 'total_students', 'created_at']

    def get_total_students(self, obj):
        return obj.enrollments.count()


class ClassSessionSerializer(serializers.ModelSerializer):
    course = CourseSerializer(read_only=True)
    enrolled_students = serializers.SerializerMethodField()

    class Meta:
        model = ClassSession
        fields = [
            'id',
            'course',
            'title',
            'session_code',
            'status',
            'started_at',
            'ended_at',
            'created_at',
            'enrolled_students',
        ]

    def get_enrolled_students(self, obj):
        students = [e.student for e in obj.course.enrollments.select_related('student').all()]
        return UserSerializer(students, many=True).data

