from django.urls import path
from .views import CookieTokenObtainPairView, CookieTokenRefreshView, LogoutView, MeView, ConsentView

urlpatterns = [
    path('login/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='user_me'),
    path('consent/', ConsentView.as_view(), name='user_consent'),
]

