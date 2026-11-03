"""
In-process inference engine used by the Channels consumers.

Wraps the same EmotionModel / GazeTracker classes the standalone worker uses
(backend/inference): YuNet face detection + the ONNX expression ensemble described
by backend/inference/models/deployment_metadata.json. Changes to the model files are
picked up automatically (rescanned every few seconds); while a model is missing no
emotion or attention values are produced at all.

PRIVACY: frames are decoded in memory only and never written anywhere.
"""
import asyncio
import base64
import glob
import io
import os
import sys
import threading
import time

import cv2
import numpy as np
from django.conf import settings
from PIL import Image

INFERENCE_DIR = os.path.join(str(settings.BASE_DIR), 'inference')
MODELS_DIR = os.path.join(INFERENCE_DIR, 'models')
if INFERENCE_DIR not in sys.path:
    sys.path.insert(0, INFERENCE_DIR)

from model_loader import EmotionModel  # noqa: E402
from gaze_tracker import GazeTracker  # noqa: E402

RESCAN_SECONDS = 5
SCREEN_MAX_FACES = 49       # a full 7x7 Meet/Zoom gallery
SCREEN_MIN_FACE_PX = 24     # smaller faces are too blurry to classify or recognise
SCREEN_MIN_SCORE = 0.8      # stricter than webcams: a shared screen is full of text and graphics
SCREEN_THUMB_PX = 96        # tile thumbnail cut from the analysed frame itself
PREVIEW_SIZE = (192, 144)   # instructor tile preview (4:3)
PREVIEW_QUALITY = 60


class InferenceEngine:
    def __init__(self):
        self._lock = threading.Lock()
        self.emotion_model = EmotionModel(MODELS_DIR)
        self.gaze = GazeTracker()
        self._known_files = self._scan()
        self._last_scan = time.time()
        self.last_latency_ms = 0
        self.frames_processed = 0
        self.warmup()

    @staticmethod
    def _scan():
        files = glob.glob(os.path.join(MODELS_DIR, '*.onnx')) + glob.glob(os.path.join(MODELS_DIR, '*.json'))
        return tuple(sorted((f, os.path.getmtime(f)) for f in files))

    def _maybe_reload(self):
        now = time.time()
        if now - self._last_scan < RESCAN_SECONDS:
            return
        self._last_scan = now
        files = self._scan()
        if files != self._known_files:
            self._known_files = files
            with self._lock:
                self.emotion_model.load_model()
                self.emotion_model.warmup()

    @property
    def custom_model_loaded(self):
        return self.emotion_model.session is not None

    def status(self):
        # Polled every few seconds by the session loop, so a dropped-in model is noticed
        # even while no student is streaming.
        self._maybe_reload()
        loaded = self.custom_model_loaded
        return {
            'status': 'Active' if loaded else 'No model',
            'model_name': self.emotion_model.model_name,
            'custom_model': loaded,
            'latency_ms': self.last_latency_ms if loaded else 0,
        }

    def warmup(self):
        self.emotion_model.warmup()

    def _run(self, frame_bgr):
        """Telemetry for the face in one frame, or None when there is no model or no face."""
        start = time.perf_counter()
        prediction = self.emotion_model.predict(frame_bgr)
        if prediction is None:
            return None
        attention = self.gaze.estimate_attention(prediction['landmarks'])
        self.last_latency_ms = max(1, int((time.perf_counter() - start) * 1000))
        self.frames_processed += 1
        return {
            'emotion': prediction['emotion'],
            'confidence': round(prediction['confidence'], 2),
            'attention': round(float(attention), 2),
            'scores': prediction['scores'],
            'latency_ms': self.last_latency_ms,
            # Lazily encoded: only needed the first time a student shows an expression
            'face_jpeg': lambda: self._face_jpeg(frame_bgr, prediction.get('box')),
            # Lazily computed: a face template is only collected every so often
            'face_embedding': lambda: self.emotion_model.embed(frame_bgr, prediction.get('detection')),
        }

    def _face_jpeg(self, frame_bgr, box):
        """JPEG bytes of the classified face crop (for the first-seen expression snapshots)."""
        if box is None:
            return None
        try:
            crop = self.emotion_model.face_crop(frame_bgr, box)
            if crop is None:
                return None
            success, buf = cv2.imencode('.jpg', crop, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            return buf.tobytes() if success else None
        except Exception:
            return None

    @staticmethod
    def _decode(data_url):
        try:
            b64 = data_url.split(',', 1)[1] if ',' in data_url else data_url
            raw = base64.b64decode(b64)
            arr = np.frombuffer(raw, dtype=np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def analyze_screen(self, data_url):
        """
        Every face in a shared-screen frame (e.g. a Meet/Zoom gallery). Returns a list of
        telemetry dicts with the face box as fractions of the frame, a thumbnail of the face
        and a lazy `embed()` for recognition, or None when there is no model or the frame
        cannot be decoded. Detections that do not look like a real face (text, logos,
        graphics) are dropped.
        """
        self._maybe_reload()
        if not self.custom_model_loaded:
            return None
        frame_bgr = self._decode(data_url)
        if frame_bgr is None:
            return None
        start = time.perf_counter()
        predictions = self.emotion_model.predict_faces(
            frame_bgr, max_faces=SCREEN_MAX_FACES, min_size=SCREEN_MIN_FACE_PX,
            min_score=SCREEN_MIN_SCORE, plausible_only=True,
        )
        img_h, img_w = frame_bgr.shape[:2]
        faces = []
        for p in predictions:
            x, y, w, h = p['box']
            faces.append({
                'box': [round(x / img_w, 4), round(y / img_h, 4), round(w / img_w, 4), round(h / img_h, 4)],
                'emotion': p['emotion'],
                'confidence': round(p['confidence'], 2),
                'attention': round(float(self.gaze.estimate_attention(p['landmarks'])), 2),
                'thumb': self._thumbnail(frame_bgr, p['box']),
                'embed': (lambda detection=p['detection']: self.emotion_model.embed(frame_bgr, detection)),
            })
        if faces:
            self.last_latency_ms = max(1, int((time.perf_counter() - start) * 1000))
            self.frames_processed += 1
        return faces

    @staticmethod
    def _thumbnail(frame_bgr, box):
        """Square JPEG data URL around a face, cut from the analysed frame (memory only, never stored)."""
        x, y, w, h = box
        img_h, img_w = frame_bgr.shape[:2]
        side = max(w, h) * 1.4
        cx, cy = x + w / 2, y + h / 2
        x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
        x1, y1 = int(min(img_w, cx + side / 2)), int(min(img_h, cy + side / 2))
        crop = frame_bgr[y0:y1, x0:x1]
        if crop.size == 0:
            return None
        try:
            ch, cw = crop.shape[:2]
            scale = min(SCREEN_THUMB_PX / cw, SCREEN_THUMB_PX / ch)
            nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
            resized = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_AREA)
            success, buf = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if not success:
                return None
            return 'data:image/jpeg;base64,' + base64.b64encode(buf).decode('ascii')
        except Exception:
            return None

    @property
    def can_recognise(self):
        return self.emotion_model.can_recognise

    @staticmethod
    def _preview(frame_bgr):
        """Small JPEG of the frame for the instructor's live tile. Kept in memory only, never stored."""
        try:
            h, w = frame_bgr.shape[:2]
            scale = min(PREVIEW_SIZE[0] / w, PREVIEW_SIZE[1] / h)
            nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
            resized = cv2.resize(frame_bgr, (nw, nh), interpolation=cv2.INTER_AREA)
            success, buf = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), PREVIEW_QUALITY])
            if not success:
                return None
            return 'data:image/jpeg;base64,' + base64.b64encode(buf).decode('ascii')
        except Exception:
            return None

    def analyze_frame(self, data_url):
        """(telemetry or None, live preview data URL or None) for one student webcam frame."""
        self._maybe_reload()
        frame_bgr = self._decode(data_url)
        if frame_bgr is None:
            return None, None
        preview = self._preview(frame_bgr)
        if not self.custom_model_loaded:
            return None, preview
        return self._run(frame_bgr), preview

    def analyze(self, data_url):
        """Decode a base64 JPEG data URL and return telemetry, or None if undecodable, no model or no face."""
        return self.analyze_frame(data_url)[0]


_engine = None
_engine_lock = threading.Lock()


def get_engine():
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = InferenceEngine()
    return _engine


# Loading (or reloading) the ~200 MB model takes seconds. Async code must never do that on the
# event loop: it freezes every socket and the Redis channel layer times out. Use these instead.
async def aget_engine():
    return await asyncio.to_thread(get_engine)


async def engine_status():
    return await asyncio.to_thread(lambda: get_engine().status())


def preload_engine_in_background():
    """Start loading the model when the server starts, so the first student does not wait for it."""
    threading.Thread(target=get_engine, name='inference-preload', daemon=True).start()
