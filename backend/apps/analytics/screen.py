"""
Screen-capture participants: faces found in the instructor's shared screen
(Google Meet / Zoom / Teams gallery, a projected classroom camera, ...).

Each face is followed across frames by its position. Gallery tiles barely move between
frames, so the nearest-centre match is reliable; when the layout reshuffles (someone joins
or leaves) a face may get a new number, and recognition puts the name back on it.

A face is only reported once it was seen in CONFIRM_HITS frames, so a one-frame false
detection (a logo, a passing thumbnail) never becomes a tile.

Identity of a track:
  * student_id set      - recognised (auto) or named by the instructor (manual) as that student
  * name set, no student - a name the instructor typed for someone who is not enrolled
  * neither              - anonymous "Screen face N"
"""
import time

PREFIX = 'screen-'
MATCH_DISTANCE = 0.6     # centre distance, in face widths, to count as the same face
TRACK_TTL_SECONDS = 10.0
CONFIRM_HITS = 2


def participant_key(number):
    return f"{PREFIX}{number}"


def participant_number(key):
    return int(key[len(PREFIX):])


def screen_participant_id(key):
    """Negative ids keep screen faces apart from student user ids on the dashboard."""
    return -participant_number(key)


def screen_participant_name(key):
    return f"Screen face {participant_number(key)}"


def new_track(cx, cy, w, now):
    return {
        'cx': cx, 'cy': cy, 'w': w, 'seen': now, 'hits': 0,
        'embedding': None, 'embedded_at': 0.0,
        'student_id': None, 'name': None, 'manual': False, 'score': 0.0,
        'rejected': set(),       # students the instructor said this face is not
        'shown_anonymous': False,  # an anonymous tile was broadcast for this track
    }


class ScreenFaceTracker:
    def __init__(self):
        self.tracks = {}      # number -> track dict (see new_track)
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
                self.tracks[assigned[i]] = new_track(cx, cy, w, now)
            track = self.tracks[assigned[i]]
            track.update(cx=cx, cy=cy, w=w, seen=now)
            track['hits'] += 1
        return assigned

    def confirmed(self, number):
        track = self.tracks.get(number)
        return bool(track) and track['hits'] >= CONFIRM_HITS

    def holder_of(self, student_id):
        """Track number currently identified as this student, or None."""
        for number, track in self.tracks.items():
            if track['student_id'] == student_id:
                return number
        return None

    def set_student(self, number, student_id, manual, score=0.0):
        """Identify a track as a student; the student is taken off any other track."""
        for other_number, other in self.tracks.items():
            if other_number != number and other['student_id'] == student_id:
                other.update(student_id=None, name=None, manual=False, score=0.0)
        track = self.tracks[number]
        track.update(student_id=student_id, name=None, manual=manual, score=score)
        track['rejected'].discard(student_id)

    def set_name(self, number, name):
        self.tracks[number].update(student_id=None, name=name, manual=True, score=0.0)

    def clear(self, number):
        """Back to anonymous. A student the instructor removed is not matched to this face again."""
        track = self.tracks[number]
        if track['student_id'] is not None:
            track['rejected'].add(track['student_id'])
        track.update(student_id=None, name=None, manual=False, score=0.0)

    def display_name(self, number):
        track = self.tracks.get(number)
        if track and track['name']:
            return track['name']
        return screen_participant_name(participant_key(number))


_trackers = {}  # session_id -> ScreenFaceTracker


def get_tracker(session_id):
    return _trackers.setdefault(str(session_id), ScreenFaceTracker())
