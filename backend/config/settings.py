"""
Django settings for EMP-EDU backend project.
"""

from pathlib import Path
import os
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-t+sy^-+3sfj@1r9=)tpfy5=ox85a-!n92lg!_)gbj*frhio@!i')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DEBUG', 'True') == 'True'

ALLOWED_HOSTS = [h for h in os.environ.get('ALLOWED_HOSTS', '*').split(',') if h]

# Running behind a reverse proxy / Cloudflare Tunnel (cloudflared). The tunnel
# terminates TLS and forwards X-Forwarded-Proto, so Django must trust that header
# to know the original request was HTTPS (affects request.is_secure(), CSRF and
# secure cookies).
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

# Django 4+ requires the public origin of HTTPS POSTs (e.g. the admin login and
# session CSRF checks). Cloudflare quick tunnels use random *.trycloudflare.com
# hosts, so those are trusted by default; add a real domain via the env var.
CSRF_TRUSTED_ORIGINS = [
    "https://*.trycloudflare.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
_extra_csrf = os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS += [o.strip() for o in _extra_csrf.split(',') if o.strip()]

# Application definition
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party apps
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'channels',

    # Local apps
    'apps.accounts',
    'apps.courses',
    'apps.analytics',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    # Serves collected static files (e.g. the Django admin CSS) under ASGI/Daphne.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Database configuration
# Connects to PostgreSQL in Docker / production, or falls back to SQLite for local lightweight testing
if os.environ.get('POSTGRES_DB') or os.environ.get('DATABASE_URL'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('POSTGRES_DB', 'emp_edu_db'),
            'USER': os.environ.get('POSTGRES_USER', 'emp_edu_user'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'emp_edu_password'),
            'HOST': os.environ.get('POSTGRES_HOST', 'postgres'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_USER_MODEL = 'accounts.User'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 6},
    },
]

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'apps.accounts.authentication.CookieJWTAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

# SimpleJWT configuration
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Cookie JWT settings
AUTH_COOKIE_ACCESS_NAME = 'access_token'
AUTH_COOKIE_REFRESH_NAME = 'refresh_token'
# Set to True when the site is always served over HTTPS. When behind the tunnel the
# cookie is also marked Secure automatically based on request.is_secure() (see views).
AUTH_COOKIE_SECURE = os.environ.get('AUTH_COOKIE_SECURE', 'False') == 'True'
AUTH_COOKIE_SAMESITE = 'Lax'

# CORS settings
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_ALL_ORIGINS = DEBUG  # Facilitate development and local network testing

# Channels channel layer configuration
REDIS_HOST = os.environ.get('REDIS_HOST', '127.0.0.1')
REDIS_PORT = os.environ.get('REDIS_PORT', '6379')

if os.environ.get('USE_REDIS_CHANNEL_LAYER', 'False') == 'True' or os.environ.get('REDIS_HOST'):
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                # channels_redis waits for messages with a blocking BZPOPMIN of up to 5 s. redis-py >= 8
                # gives every connection a 5 s socket_timeout by default, which kills that read and
                # drops each websocket ~5 s after it connects - so turn the read timeout off.
                "hosts": [{
                    "address": f"redis://{REDIS_HOST}:{REDIS_PORT}",
                    "socket_timeout": None,
                }],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }

# Real-time runtime
# INPROCESS_AGGREGATOR: aggregate snapshots inside the ASGI server (turn off when Celery beat does it)
INPROCESS_AGGREGATOR = os.environ.get('INPROCESS_AGGREGATOR', 'True') == 'True'
# ALLOW_GUEST_STUDENTS: open student portal (pick a roster name, no login). Development only.
ALLOW_GUEST_STUDENTS = os.environ.get('ALLOW_GUEST_STUDENTS', str(DEBUG)) == 'True'

# Celery Configuration
CELERY_BROKER_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}/0"
CELERY_RESULT_BACKEND = f"redis://{REDIS_HOST}:{REDIS_PORT}/0"
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# WhiteNoise compresses and serves the collected static files under ASGI (Daphne).
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
