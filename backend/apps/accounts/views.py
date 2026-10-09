from django.conf import settings
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import UserSerializer, CustomTokenObtainPairSerializer, ConsentUpdateSerializer


def set_jwt_cookies(response, access_token, refresh_token=None):
    access_cookie_name = getattr(settings, 'AUTH_COOKIE_ACCESS_NAME', 'access_token')
    refresh_cookie_name = getattr(settings, 'AUTH_COOKIE_REFRESH_NAME', 'refresh_token')
    cookie_secure = getattr(settings, 'AUTH_COOKIE_SECURE', False)
    cookie_samesite = getattr(settings, 'AUTH_COOKIE_SAMESITE', 'Lax')

    # Access token cookie (typically 15-60 min)
    response.set_cookie(
        access_cookie_name,
        access_token,
        max_age=3600 * 24,  # 1 day
        httponly=True,
        secure=cookie_secure,
        samesite=cookie_samesite,
        path='/',
    )

    if refresh_token:
        # Refresh token cookie (typically 7-30 days)
        response.set_cookie(
            refresh_cookie_name,
            refresh_token,
            max_age=3600 * 24 * 7,  # 7 days
            httponly=True,
            secure=cookie_secure,
            samesite=cookie_samesite,
            path='/',
        )


class CookieTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tokens = serializer.validated_data

        access_token = tokens.get('access')
        refresh_token = tokens.get('refresh')
        user_data = tokens.get('user')

        response = Response({
            'detail': 'Login successful',
            'user': user_data,
        }, status=status.HTTP_200_OK)

        set_jwt_cookies(response, access_token, refresh_token)
        return response


class CookieTokenRefreshView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        refresh_cookie_name = getattr(settings, 'AUTH_COOKIE_REFRESH_NAME', 'refresh_token')
        raw_refresh = request.data.get('refresh') or request.COOKIES.get(refresh_cookie_name)

        if not raw_refresh:
            return Response({'detail': 'Refresh token missing.'}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = self.get_serializer(data={'refresh': raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            return Response({'detail': 'Invalid refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)

        access_token = serializer.validated_data.get('access')
        response = Response({'detail': 'Token refreshed successfully.'}, status=status.HTTP_200_OK)
        set_jwt_cookies(response, access_token)
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        response = Response({'detail': 'Logged out successfully.'}, status=status.HTTP_200_OK)
        access_cookie_name = getattr(settings, 'AUTH_COOKIE_ACCESS_NAME', 'access_token')
        refresh_cookie_name = getattr(settings, 'AUTH_COOKIE_REFRESH_NAME', 'refresh_token')
        response.delete_cookie(access_cookie_name, path='/')
        response.delete_cookie(refresh_cookie_name, path='/')
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class ConsentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ConsentUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        consent = serializer.validated_data['consent']

        user = request.user
        if consent:
            user.give_consent()
        else:
            user.revoke_consent()

        return Response({
            'consent_given': user.consent_given,
            'consent_timestamp': user.consent_timestamp,
        }, status=status.HTTP_200_OK)

