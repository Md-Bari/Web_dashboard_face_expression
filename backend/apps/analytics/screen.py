"""
Screen-capture participants: faces found in the instructor's shared screen
(Google Meet / Zoom / Teams gallery, a projected classroom camera, ...).

These people have no account here, so each face gets a stable anonymous number
by following it across frames. Gallery tiles barely move between frames, so the
nearest-centre match is reliable; when the layout reshuffles (someone joins or
leaves) a face may get a new number.
"""
import time

PREFIX = 'screen-'
MATCH_DISTANCE = 0.6     # centre distance, in face widths, to count as the same face
TRACK_TTL_SECONDS = 10.0


def participant_key(number):
    return f"{PREFIX}{number}"


def participant_number(key):
    return int(key[len(PREFIX):])


def screen_participant_id(key):
    """Negative ids keep screen faces apart from student user ids on the dashboard."""
    return -participant_number(key)


def screen_participant_name(key):
    return f"Screen face {participant_number(key)}"


class ScreenFaceTracker:
    def __init__(self):
        self.tracks = {}      # number -> {'cx', 'cy', 'w', 'seen'}
        self.next_number = 1

    def assign(self, boxes, now=None):
        """boxes: [(x, y, w, h)] as fractions of the frame. Returns one participant number per box."""
        now = time.monotonic() if now is None else now
        self.tracks = {n: t for n, t in self.tracks.items() if now - t['seen'] <= TRACK_TTL_SECONDS}

        centres = [(x + w / 2, y + h / 2, w) for x, y, w, h in boxes]
        pairs = []
        for i, (cx, cy, w) in enumerate(centres):
            for number, track in self.tracks.items():
                dist = ((cx - track['cx']) ** 2 + (cy - track['cy']) ** 2) ** 0.5 / max(w, track['w'], 1e-6)
                if dist <= MATCH_DISTANCE:
                    pairs.append((dist, i, number))

        assigned = [None] * len(boxes)
        used = set()
        for _, i, number in sorted(pairs):
            if assigned[i] is None and number not in used:
                assigned[i] = number
                used.add(number)

        for i, (cx, cy, w) in enumerate(centres):
            if assigned[i] is None:
                assigned[i] = self.next_number
                self.next_number += 1
            self.tracks[assigned[i]] = {'cx': cx, 'cy': cy, 'w': w, 'seen': now}
        return assigned


_trackers = {}  # session_id -> ScreenFaceTracker


def get_tracker(session_id):
    return _trackers.setdefault(str(session_id), ScreenFaceTracker())
