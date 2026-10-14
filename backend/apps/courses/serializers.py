from rest_framework import serializers
from rest_framework.validators import UniqueValidator
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
    course_id = serializers.PrimaryKeyRelatedField(source='course', queryset=Course.objects.all(), write_only=True)
    session_code = serializers.CharField(
        max_length=50, required=False, validators=[UniqueValidator(queryset=ClassSession.objects.all())],
    )
    enrolled_students = serializers.SerializerMethodField()

    class Meta:
        model = ClassSession
        fields = [
            'id',
            'course',
            'course_id',
            'title',
            'session_code',
            'status',
            'started_at',
            'ended_at',
            'created_at',
            'enrolled_students',
        ]
        read_only_fields = ['status', 'started_at', 'ended_at', 'created_at']

    def validate_course_id(self, course):
        user = self.context['request'].user
        if not user.is_admin and course.instructor_id != user.id:
            raise serializers.ValidationError("You can only create sessions for your own courses.")
        return course

    def create(self, validated_data):
        if not validated_data.get('session_code'):
            course = validated_data['course']
            number = course.sessions.count() + 1
            code = f"{course.code}-{number}"
            while ClassSession.objects.filter(session_code=code).exists():
                number += 1
                code = f"{course.code}-{number}"
            validated_data['session_code'] = code
        return super().create(validated_data)

    def get_enrolled_students(self, obj):
        students = [e.student for e in obj.course.enrollments.select_related('student').all()]
        return UserSerializer(students, many=True).data

