from http.cookies import SimpleCookie

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()


@database_sync_to_async
def _user_from_token(raw_token):
    try:
        token = AccessToken(raw_token)
        return User.objects.get(id=token['user_id'])
    except Exception:
        return AnonymousUser()


class JWTCookieAuthMiddleware(BaseMiddleware):
    """
    Authenticates WebSocket handshakes with the same httpOnly `access_token`
    cookie that the REST API uses, and exposes the user as scope['user'].
    """

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        headers = dict(scope.get('headers', []))
        cookies = SimpleCookie(headers.get(b'cookie', b'').decode('latin-1'))
        morsel = cookies.get(getattr(settings, 'AUTH_COOKIE_ACCESS_NAME', 'access_token'))
        scope['user'] = await _user_from_token(morsel.value) if morsel else AnonymousUser()
        return await super().__call__(scope, receive, send)
