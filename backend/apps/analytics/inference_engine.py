"""
In-process inference engine used by the Channels consumers.

Wraps the same EmotionModel / GazeTracker classes the standalone worker uses
(backend/inference). Any .onnx file dropped into backend/inference/models/ is
picked up automatically (rescanned every few seconds); until then the adaptive
fallback engine produces the telemetry.

PRIVACY: frames are decoded in memory only and never written anywhere.
"""
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
        return tuple(sorted(glob.glob(os.path.join(MODELS_DIR, '*.onnx'))))

    def _maybe_reload(self):
        now = time.time()
        if now - self._last_scan < RESCAN_SECONDS:
            return
        self._last_scan = now
        files = self._scan()
        if files != self._known_files:
            self._known_files = files
            with self._lock:
                self.emotion_model.session = None
                self.emotion_model.load_model()

    @property
    def custom_model_loaded(self):
        return self.emotion_model.session is not None

    def status(self):
        return {
            'status': 'Active',
            'model_name': self.emotion_model.model_name,
            'custom_model': self.custom_model_loaded,
            'latency_ms': self.last_latency_ms,
        }

    def warmup(self):
        blank = np.full((224, 224, 3), 128, dtype=np.uint8)
        self._run(blank)

    def _run(self, face_bgr):
        start = time.perf_counter()
        emotion, confidence, scores = self.emotion_model.predict(face_bgr)
        attention = self.gaze.estimate_attention(face_bgr)
        self.last_latency_ms = max(1, int((time.perf_counter() - start) * 1000))
        self.frames_processed += 1
        return {
            'emotion': emotion,
            'confidence': round(float(confidence), 2),
            'attention': round(float(attention), 2),
            'scores': scores,
            'latency_ms': self.last_latency_ms,
        }

    def analyze(self, data_url):
        """Decode a base64 JPEG data URL and return telemetry, or None if undecodable."""
        self._maybe_reload()
        try:
            b64 = data_url.split(',', 1)[1] if ',' in data_url else data_url
            img = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGB')
            if img.size != (224, 224):
                img = img.resize((224, 224), Image.Resampling.BILINEAR)
            face_bgr = np.array(img)[:, :, ::-1]
        except Exception:
            return None
        return self._run(face_bgr)


_engine = None
_engine_lock = threading.Lock()


def get_engine():
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = InferenceEngine()
    return _engine
