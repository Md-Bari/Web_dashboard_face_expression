from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from .models import Course, Enrollment, ClassSession, Section
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import get_password_validators, validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.accounts.serializers import UserSerializer


class SectionSerializer(serializers.ModelSerializer):
    course_id = serializers.PrimaryKeyRelatedField(source='course', queryset=Course.objects.all(), write_only=True)
    total_students = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = ['id', 'course_id', 'name', 'join_code', 'total_students', 'created_at']
        read_only_fields = ['join_code', 'created_at']

    def get_total_students(self, obj):
        return obj.enrollments.count()

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the section a name, e.g. "A".')
        return value

    def validate_course_id(self, course):
        user = self.context['request'].user
        if self.instance is not None and course.id != self.instance.course_id:
            raise serializers.ValidationError('A section cannot move to another class.')
        if not user.is_admin and course.instructor_id != user.id:
            raise serializers.ValidationError('You can only add sections to your own classes.')
        return course

    def validate(self, attrs):
        course = attrs.get('course') or self.instance.course
        name = attrs.get('name', self.instance.name if self.instance else None)
        clash = Section.objects.filter(course=course, name__iexact=name)
        if self.instance is not None:
            clash = clash.exclude(id=self.instance.id)
        if clash.exists():
            raise serializers.ValidationError({'name': f'This class already has a section "{name}".'})
        return attrs


class SectionBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'name']


class CourseSerializer(serializers.ModelSerializer):
    instructor = UserSerializer(read_only=True)
    total_students = serializers.SerializerMethodField()
    unassigned_students = serializers.SerializerMethodField()
    sections = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ['id', 'title', 'code', 'join_code', 'description', 'instructor', 'total_students',
                  'unassigned_students', 'sections', 'created_at']
        read_only_fields = ['join_code']

    def get_total_students(self, obj):
        return obj.enrollments.count()

    def get_unassigned_students(self, obj):
        return obj.enrollments.filter(section__isnull=True).count()

    def get_sections(self, obj):
        return [
            {'id': s.id, 'name': s.name, 'join_code': s.join_code, 'total_students': s.enrollments.count()}
            for s in obj.sections.all()
        ]


class CourseBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ['id', 'code', 'title']


class EnrollmentSerializer(serializers.ModelSerializer):
    student = UserSerializer(read_only=True)
    course = CourseBriefSerializer(read_only=True)
    section = SectionBriefSerializer(read_only=True)
    section_id = serializers.PrimaryKeyRelatedField(
        source='section', queryset=Section.objects.all(), write_only=True, allow_null=True, required=False,
    )

    class Meta:
        model = Enrollment
        fields = ['id', 'student', 'course', 'section', 'section_id', 'enrolled_at']
        read_only_fields = ['enrolled_at']

    def validate_section_id(self, section):
        if section is None:
            raise serializers.ValidationError('Every student must be in a section.')
        if self.instance is not None and section.course_id != self.instance.course_id:
            raise serializers.ValidationError('That section belongs to another class.')
        return section


class ClassSessionSerializer(serializers.ModelSerializer):
    course = CourseSerializer(read_only=True)
    course_id = serializers.PrimaryKeyRelatedField(source='course', queryset=Course.objects.all(), write_only=True)
    session_code = serializers.CharField(
        max_length=50, required=False, validators=[UniqueValidator(queryset=ClassSession.objects.all())],
    )
    sections = SectionBriefSerializer(many=True, read_only=True)
    section_ids = serializers.PrimaryKeyRelatedField(
        source='sections', queryset=Section.objects.all(), many=True, write_only=True, required=False,
    )
    attendee_count = serializers.SerializerMethodField()

    class Meta:
        model = ClassSession
        fields = [
            'id',
            'course',
            'course_id',
            'title',
            'session_code',
            'join_code',
            'sections',
            'section_ids',
            'status',
            'scheduled_for',
            'started_at',
            'ended_at',
            'created_at',
            'attendee_count',
        ]
        read_only_fields = ['join_code', 'status', 'started_at', 'ended_at', 'created_at']

    def validate_course_id(self, course):
        user = self.context['request'].user
        if not user.is_admin and course.instructor_id != user.id:
            raise serializers.ValidationError("You can only create sessions for your own courses.")
        if self.instance is not None and course.id != self.instance.course_id:
            raise serializers.ValidationError("A session cannot move to another class.")
        return course

    def validate(self, attrs):
        course = attrs.get('course') or (self.instance.course if self.instance else None)
        for section in attrs.get('sections', []):
            if course is not None and section.course_id != course.id:
                raise serializers.ValidationError({'section_ids': f'Section "{section.name}" is not in this class.'})
        if self.instance is not None and self.instance.status == 'ENDED':
            raise serializers.ValidationError('An ended session cannot be changed.')
        return attrs

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

    def get_attendee_count(self, obj):
        return obj.attendee_enrollments().count()


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
