"""
Video meetings through LiveKit (LiveKit Cloud or a self-hosted LiveKit server - only the
settings differ). No SDK is needed:

  * an access token is a JWT signed (HS256) with the API secret, carrying a `video` grant;
  * the server API is Twirp: JSON POSTed to https://<host>/twirp/livekit.RoomService/<Method>.

Settings: LIVEKIT_URL (wss://...), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
"""
import json
import logging
import time
import urllib.error
import urllib.request

import jwt
from django.conf import settings

log = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 6 * 3600
API_TIMEOUT_SECONDS = 5


class LiveKitError(Exception):
    pass


def configured():
    return bool(settings.LIVEKIT_URL and settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET)


def _sign(claims, ttl):
    now = int(time.time())
    payload = {'iss': settings.LIVEKIT_API_KEY, 'nbf': now - 10, 'exp': now + ttl, **claims}
    return jwt.encode(payload, settings.LIVEKIT_API_SECRET, algorithm='HS256')


def access_token(room, identity, name, *, host=False, metadata=None):
    """
    Token for joining `room`. Students may publish camera, microphone and a shared screen;
    the host (the instructor) may also moderate the room.
    """
    grant = {
        'room': room,
        'roomJoin': True,
        'canSubscribe': True,
        'canPublish': True,
        'canPublishData': True,       # chat
        'canUpdateOwnMetadata': True,  # "raise hand" is a participant attribute
    }
    if host:
        grant['roomAdmin'] = True
    else:
        grant['canPublishSources'] = ['camera', 'microphone', 'screen_share', 'screen_share_audio']
    return _sign({
        'sub': identity,
        'name': name,
        'video': grant,
        'metadata': json.dumps(metadata or {}),
    }, TOKEN_TTL_SECONDS)


def _api_base():
    url = settings.LIVEKIT_URL.rstrip('/')
    if url.startswith('wss://'):
        return 'https://' + url[len('wss://'):]
    if url.startswith('ws://'):
        return 'http://' + url[len('ws://'):]
    return url


def _call(method, payload, room):
    """POST one RoomService call. Returns the decoded reply; raises LiveKitError."""
    if not configured():
        raise LiveKitError('Video meetings are not configured on the server.')
    token = _sign({'video': {'room': room, 'roomAdmin': True, 'roomCreate': True, 'roomList': True}}, 60)
    request = urllib.request.Request(
        f"{_api_base()}/twirp/livekit.RoomService/{method}",
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=API_TIMEOUT_SECONDS) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read()[:200].decode(errors='replace')
        raise LiveKitError(f'{method} failed ({exc.code}): {detail}') from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise LiveKitError(f'{method} failed: {exc}') from exc
    return json.loads(body or b'{}')


def remove_participant(room, identity):
    _call('RemoveParticipant', {'room': room, 'identity': identity}, room)


def mute_track(room, identity, track_sid, muted=True):
    _call('MutePublishedTrack', {'room': room, 'identity': identity, 'track_sid': track_sid, 'muted': muted}, room)


def close_room(room):
    """Disconnect everyone (the class has ended). A room nobody joined is not an error."""
    try:
        _call('DeleteRoom', {'room': room}, room)
    except LiveKitError as exc:
        if '(404)' not in str(exc):
            log.warning('Could not close meeting room %s: %s', room, exc)
