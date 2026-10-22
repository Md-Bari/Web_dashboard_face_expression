from datetime import date

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User


class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'name',
            'role',
            'avatar_url',
            'display_title',
            'consent_given',
            'consent_timestamp',
        ]
        read_only_fields = ['id', 'username', 'role', 'consent_timestamp']

    def get_name(self, obj):
        return obj.get_full_name() or obj.username


class ProfileSerializer(UserSerializer):
    """
    The signed-in user's own account, including personal details. Only used for /api/auth/me/:
    UserSerializer (without these fields) is what other people see, e.g. a class's instructor.
    """
    phone = serializers.RegexField(
        r'^\+?[0-9 ()-]{6,20}$', required=False, allow_blank=True,
        error_messages={'invalid': 'Enter a phone number with digits only, e.g. +8801712345678.'},
    )

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ['phone', 'date_of_birth', 'blood_group']
        read_only_fields = UserSerializer.Meta.read_only_fields + ['consent_given']

    def validate_first_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter your first name.')
        return value

    def validate_date_of_birth(self, value):
        if value is None:
            return value
        today = date.today()
        if value > today:
            raise serializers.ValidationError('The date of birth cannot be in the future.')
        if value.year < 1900:
            raise serializers.ValidationError('Enter a real date of birth.')
        return value


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class ConsentUpdateSerializer(serializers.Serializer):
    consent = serializers.BooleanField(required=True)

