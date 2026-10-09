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


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class ConsentUpdateSerializer(serializers.Serializer):
    consent = serializers.BooleanField(required=True)

