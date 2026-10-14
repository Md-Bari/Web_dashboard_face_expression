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
SCREEN_MIN_FACE_PX = 20     # smaller faces are too blurry to classify


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
        }

    @staticmethod
    def _decode(data_url):
        try:
            b64 = data_url.split(',', 1)[1] if ',' in data_url else data_url
            img = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGB')
            return np.ascontiguousarray(np.array(img)[:, :, ::-1])
        except Exception:
            return None

    def analyze_screen(self, data_url):
        """
        Every face in a shared-screen frame (e.g. a Meet/Zoom gallery). Returns a list of
        telemetry dicts with the face box as fractions of the frame, or None when there is
        no model or the frame cannot be decoded.
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
            })
        if faces:
            self.last_latency_ms = max(1, int((time.perf_counter() - start) * 1000))
            self.frames_processed += 1
        return faces

    def analyze(self, data_url):
        """Decode a base64 JPEG data URL and return telemetry, or None if undecodable, no model or no face."""
        self._maybe_reload()
        if not self.custom_model_loaded:
            return None
        frame_bgr = self._decode(data_url)
        if frame_bgr is None:
            return None
        return self._run(frame_bgr)


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
