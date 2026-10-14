import os
import django
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter
from apps.accounts.ws_auth import JWTCookieAuthMiddleware
from apps.analytics.routing import websocket_urlpatterns
from apps.analytics.inference_engine import preload_engine_in_background

# Only the ASGI server imports this module (not Celery or manage.py), so only it loads the model
preload_engine_in_background()

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": JWTCookieAuthMiddleware(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})
