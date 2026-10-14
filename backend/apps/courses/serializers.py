from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from .models import Course, Enrollment, ClassSession
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import get_password_validators, validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.accounts.serializers import UserSerializer


class CourseSerializer(serializers.ModelSerializer):
    instructor = UserSerializer(read_only=True)
    total_students = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ['id', 'title', 'code', 'join_code', 'description', 'instructor', 'total_students', 'created_at']
        read_only_fields = ['join_code']

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



# Public self sign-up gets Django's standard checks even if the site-wide setting is looser
SIGNUP_PASSWORD_VALIDATORS = get_password_validators([
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
])


class StudentRegistrationSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    username = serializers.RegexField(r'^[\w.@+-]{3,150}$', error_messages={
        'invalid': 'Use 3-150 letters, digits or . @ + - _ (no spaces).',
    })
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_username(self, value):
        if get_user_model().objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is taken.')
        return value

    def validate(self, attrs):
        user = get_user_model()(username=attrs['username'], first_name=attrs['first_name'],
                                email=attrs.get('email', ''))
        try:
            validate_password(attrs['password'], user, SIGNUP_PASSWORD_VALIDATORS)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = get_user_model()(role='student', **validated_data)
        user.set_password(password)
        user.save()
        return user
