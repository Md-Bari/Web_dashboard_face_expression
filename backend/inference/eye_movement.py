"""
Eye movement analysis from an ordinary webcam.

Two layers, in the spirit of research eye-tracking toolkits such as PyGaze:

1. `measure_eyes(frame, landmarks)` - one frame: where the eyes point and whether they are open.
   Gaze direction = head direction (from the five YuNet landmarks) plus the position of the
   iris inside each eye patch (the darkest blob around the eye landmark). Eye openness comes
   from the shape of that blob: an open eye shows a round iris, a closed eye only a thin
   lash line.

2. `EyeMovementAnalyzer` - one student over time: a sliding window of gaze samples classified
   into fixations (dispersion-threshold identification, I-DT), gaze shifts (large jumps between
   consecutive samples, the low-frame-rate counterpart of saccades), eye closures (blinks
   caught by a frame, and prolonged closures as a drowsiness sign) and time looking at the
   screen versus away.

Limits, stated honestly: the student's browser sends ~3 frames per second at <= 640 px, so this
is not a research-grade eye tracker. Real saccades (20-80 ms) and pupil diameter need 60 Hz+
infrared hardware; here gaze shifts are counted between frames, a blink is only seen when a
frame happens to land inside it, and gaze is coarse (screen regions, not pixels).

Gaze coordinates are normalised to the screen: x -1 = student's left, +1 = right;
y -1 = up, +1 = down; |x|, |y| <= ON_SCREEN_LIMIT counts as looking at the screen.
Frames are expected unmirrored (as the camera delivers them).
"""
from collections import deque

import cv2
import numpy as np

# ---- per-frame measurement
MIN_EYE_DIST_PX = 22          # smaller faces have eyes a few pixels wide: no reliable iris
PATCH_W = 0.50                # eye patch size as a fraction of the inter-eye distance
PATCH_H = 0.30                # (kept below the eyebrows)
DARK_PERCENTILE = 20          # the iris/pupil and lashes are the darkest pixels of the patch ...
DARK_LEVEL = 0.30             # ... and lie in the bottom 30 % of its contrast range (skin does not)
OPEN_ASPECT = 0.55            # blob height/width of a clearly open eye (round iris)
CLOSED_ASPECT = 0.28          # ... of a closed eye (a thin lash line)
OPEN_THRESHOLD = 0.4          # openness below this on both eyes = eyes closed

# head direction: same geometry as GazeTracker, but signed
YAW_LIMIT = 0.45
PITCH_CENTER = 0.55
PITCH_LIMIT = 0.35
IRIS_WEIGHT = 0.6             # how far the eyes turn the gaze relative to the head
ON_SCREEN_LIMIT = 0.5

# ---- temporal analysis
WINDOW_SECONDS = 60.0
MAX_GAP_SECONDS = 1.5         # samples further apart do not form one fixation / one shift
FIXATION_DISPERSION = 0.30    # I-DT: (max-min x) + (max-min y) within a fixation
MIN_FIXATION_SECONDS = 0.6    # ~2-3 frames at the student's frame rate
SHIFT_THRESHOLD = 0.35        # gaze jump between consecutive samples counted as a gaze shift
DROWSY_CLOSURE_SECONDS = 1.0  # eyes closed this long in a row
MIN_SPAN_FOR_RATES = 10.0     # per-minute rates need at least this much data
TRAIL_POINTS = 15


def _signed_head_direction(pts):
    right_eye, left_eye, nose, right_mouth, left_mouth = pts
    eye_mid = (right_eye + left_eye) / 2
    mouth_mid = (right_mouth + left_mouth) / 2
    eye_dist = float(np.linalg.norm(left_eye - right_eye))
    face_height = float(mouth_mid[1] - eye_mid[1])
    if eye_dist < 1e-3 or face_height < 1e-3:
        return None
    # Turning to their own right moves the nose to the image's left (unmirrored camera)
    hx = -float(nose[0] - eye_mid[0]) / eye_dist / YAW_LIMIT
    hy = (float(nose[1] - eye_mid[1]) / face_height - PITCH_CENTER) / PITCH_LIMIT
    return hx, hy, eye_dist


def _eye_patch(gray, center, eye_dist):
    w = max(6, int(round(eye_dist * PATCH_W)))
    h = max(4, int(round(eye_dist * PATCH_H)))
    x0, y0 = int(round(center[0] - w / 2)), int(round(center[1] - h / 2))
    img_h, img_w = gray.shape[:2]
    if x0 < 0 or y0 < 0 or x0 + w > img_w or y0 + h > img_h:
        return None
    return gray[y0:y0 + h, x0:x0 + w]


def _iris(patch):
    """(offset_x, offset_y, openness) of the darkest blob in an eye patch, offsets in -1..1."""
    if patch is None or patch.size == 0:
        return None
    p = cv2.GaussianBlur(patch, (3, 3), 0)
    p = cv2.normalize(p, None, 0, 255, cv2.NORM_MINMAX)
    if int(p.max()) - int(p.min()) < 20:          # flat patch: no eye structure visible
        return None
    mask = (p <= min(DARK_LEVEL * 255, np.percentile(p, DARK_PERCENTILE))).astype(np.uint8)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count < 2:
        return None
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    bw, bh = stats[best, cv2.CC_STAT_WIDTH], stats[best, cv2.CC_STAT_HEIGHT]
    if bw == 0:
        return None
    cx, cy = centroids[best]
    ph, pw = patch.shape[:2]
    off_x = float(np.clip((cx - pw / 2) / (pw / 2), -1, 1))
    off_y = float(np.clip((cy - ph / 2) / (ph / 2), -1, 1))
    openness = float(np.clip((bh / bw - CLOSED_ASPECT) / (OPEN_ASPECT - CLOSED_ASPECT), 0, 1))
    return off_x, off_y, openness


def measure_eyes(frame_bgr, landmarks):
    """
    One frame. Returns {'gaze': (x, y), 'on_screen': bool, 'eyes_open': bool | None,
    'openness': float | None} or None when the face geometry is unusable. When the eyes are
    too small to find the iris, gaze falls back to head direction alone and eyes_open is None.
    """
    pts = np.asarray(landmarks, dtype=np.float32).reshape(5, 2)
    head = _signed_head_direction(pts)
    if head is None:
        return None
    hx, hy, eye_dist = head

    irises = []
    if eye_dist >= MIN_EYE_DIST_PX and frame_bgr is not None:
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY) if frame_bgr.ndim == 3 else frame_bgr
        for center in (pts[0], pts[1]):
            found = _iris(_eye_patch(gray, center, eye_dist))
            if found is not None:
                irises.append(found)

    openness = float(np.mean([i[2] for i in irises])) if irises else None
    eyes_open = None if openness is None else openness >= OPEN_THRESHOLD
    gx, gy = hx, hy
    if irises and eyes_open:
        # Iris to the image's left = looking to the student's right
        gx += IRIS_WEIGHT * -float(np.mean([i[0] for i in irises]))
        gy += IRIS_WEIGHT * float(np.mean([i[1] for i in irises]))
    gx, gy = float(np.clip(gx, -1.5, 1.5)), float(np.clip(gy, -1.5, 1.5))
    return {
        'gaze': (round(gx, 3), round(gy, 3)),
        'on_screen': abs(gx) <= ON_SCREEN_LIMIT and abs(gy) <= ON_SCREEN_LIMIT and eyes_open is not False,
        'eyes_open': eyes_open,
        'openness': None if openness is None else round(openness, 2),
    }


class EyeMovementAnalyzer:
    """
    Sliding-window eye movement metrics for one student. Feed every frame with `add(t, sample)`
    (sample from measure_eyes, or None when no face was found) and read `summary()`.
    `t` is a monotonic time in seconds.
    """

    def __init__(self, window=WINDOW_SECONDS):
        self.window = window
        self.samples = deque()   # (t, gaze or None, eyes_open or None, on_screen)

    def add(self, t, sample):
        if sample is None:
            self.samples.append((t, None, None, False))
        else:
            self.samples.append((t, sample['gaze'], sample['eyes_open'], sample['on_screen']))
        while self.samples and t - self.samples[0][0] > self.window:
            self.samples.popleft()

    # ------------------------------------------------------------------ classification

    def _gaze_runs(self):
        """Consecutive open-eye gaze samples with no gap longer than MAX_GAP_SECONDS."""
        runs, run, last_t = [], [], None
        for t, gaze, eyes_open, _ in self.samples:
            usable = gaze is not None and eyes_open is not False
            if not usable or (last_t is not None and t - last_t > MAX_GAP_SECONDS):
                if len(run) > 1:
                    runs.append(run)
                run = []
            if usable:
                run.append((t, gaze[0], gaze[1]))
            last_t = t
        if len(run) > 1:
            runs.append(run)
        return runs

    @staticmethod
    def _fixations(run):
        """I-DT over one run: list of (start, end, cx, cy)."""
        out, i, n = [], 0, len(run)
        while i < n:
            j = i
            xs, ys = [run[i][1]], [run[i][2]]
            while j + 1 < n:
                nx, ny = xs + [run[j + 1][1]], ys + [run[j + 1][2]]
                if (max(nx) - min(nx)) + (max(ny) - min(ny)) > FIXATION_DISPERSION:
                    break
                xs, ys, j = nx, ny, j + 1
            if run[j][0] - run[i][0] >= MIN_FIXATION_SECONDS:
                out.append((run[i][0], run[j][0], float(np.mean(xs)), float(np.mean(ys))))
                i = j + 1
            else:
                i += 1
        return out

    def summary(self):
        if not self.samples:
            return None
        samples = list(self.samples)
        span = samples[-1][0] - samples[0][0]
        per_min = (60.0 / span) if span >= MIN_SPAN_FOR_RATES else None

        runs = self._gaze_runs()
        fixations = [f for run in runs for f in self._fixations(run)]
        shifts = sum(
            1 for run in runs for a, b in zip(run, run[1:])
            if np.hypot(b[1] - a[1], b[2] - a[2]) > SHIFT_THRESHOLD
        )
        tracked = sum(r[-1][0] - r[0][0] for r in runs)
        fixated = sum(f[1] - f[0] for f in fixations)

        closures, longest, closed_since, prev_open = 0, 0.0, None, None
        for t, _, eyes_open, _ in samples:
            if eyes_open is False:
                if prev_open is True:
                    closures += 1
                closed_since = t if closed_since is None else closed_since
                longest = max(longest, t - closed_since)
            else:
                closed_since = None
            if eyes_open is not None:
                prev_open = eyes_open

        last = samples[-1]
        trail = [list(s[1]) for s in samples if s[1] is not None][-TRAIL_POINTS:]
        return {
            'gaze': list(last[1]) if last[1] is not None else None,
            'on_screen': bool(last[3]),
            'eyes_open': last[2],
            'on_screen_pct': round(100 * sum(1 for s in samples if s[3]) / len(samples)),
            'fixation_pct': round(100 * fixated / tracked) if tracked > 0 else 0,
            'fixations': len(fixations),
            'mean_fixation_s': round(fixated / len(fixations), 2) if fixations else 0.0,
            'gaze_shifts_per_min': round(shifts * per_min, 1) if per_min else None,
            'closures_per_min': round(closures * per_min, 1) if per_min else None,
            'longest_closure_s': round(longest, 1),
            'drowsy': longest >= DROWSY_CLOSURE_SECONDS,
            'trail': trail,
            'window_s': round(span),
        }
