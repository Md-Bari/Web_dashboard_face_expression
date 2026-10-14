import glob
import json
import os
import threading

import numpy as np

# The dashboard works with three sentiment groups; the model predicts six expressions.
SENTIMENT_GROUPS = {
    'positive': ('happy', 'surprise'),
    'neutral': ('neutral',),
    'negative': ('angry', 'fear', 'sad'),
}

DEFAULT_METADATA = {
    'classes': ['angry', 'fear', 'happy', 'neutral', 'sad', 'surprise'],
    'image_size': 256,
    'output': 'probabilities',
    'face_detector': 'face_detection_yunet_2023mar.onnx',
    'face_margin': 0.2,
}

FACE_SCORE_THRESHOLD = 0.6


class EmotionModel:
    """
    Face expression pipeline described by models/deployment_metadata.json:

      1. YuNet (OpenCV FaceDetectorYN) finds the faces in the frame.
      2. The face box is grown by `face_margin`, cropped, its short side resized to
         `image_size` and centre cropped.
      3. The ONNX expression ensemble returns probabilities for the six classes, which
         are summed into the dashboard's positive / neutral / negative groups.

    Nothing is predicted when a model file is missing or no face is found.
    """

    def __init__(self, models_dir=None):
        if models_dir is None:
            models_dir = os.path.join(os.path.dirname(__file__), 'models')
        self.models_dir = models_dir
        self.session = None
        self.detector = None
        self.model_name = "No model loaded"
        self.input_name = None
        self.metadata = dict(DEFAULT_METADATA)
        self._detector_lock = threading.Lock()  # cv2.FaceDetectorYN is not thread-safe
        self.load_model()

    def _read_metadata(self):
        path = os.path.join(self.models_dir, 'deployment_metadata.json')
        metadata = dict(DEFAULT_METADATA)
        if os.path.exists(path):
            try:
                with open(path, encoding='utf-8') as fh:
                    metadata.update(json.load(fh))
            except Exception as e:
                print(f"[Inference] Could not read {path}: {e}")
        return metadata

    def load_model(self):
        self.session = None
        self.detector = None
        self.model_name = "No model loaded"
        self.metadata = self._read_metadata()

        detector_file = self.metadata['face_detector']
        detector_path = os.path.join(self.models_dir, detector_file)
        classifier_files = sorted(
            f for f in glob.glob(os.path.join(self.models_dir, '*.onnx'))
            if os.path.basename(f) != detector_file
        )
        if not classifier_files:
            print("[Inference] No expression .onnx model in models/. Emotion predictions are disabled.")
            return
        if not os.path.exists(detector_path):
            print(f"[Inference] Face detector {detector_file} missing from models/. Emotion predictions are disabled.")
            return

        model_path = classifier_files[0]
        try:
            import cv2
            import onnxruntime as ort
            self.detector = cv2.FaceDetectorYN.create(detector_path, "", (320, 320), FACE_SCORE_THRESHOLD, 0.3, 50)
            session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
            self.input_name = session.get_inputs()[0].name
            n_out = session.get_outputs()[0].shape[-1]
            if isinstance(n_out, int) and n_out != len(self.metadata['classes']):
                print(f"[Inference] {os.path.basename(model_path)} has {n_out} outputs but metadata lists "
                      f"{len(self.metadata['classes'])} classes. Emotion predictions are disabled.")
                self.detector = None
                return
            self.session = session
            self.model_name = os.path.basename(model_path)
            print(f"[Inference] Loaded {self.model_name} ({', '.join(self.metadata['classes'])}) "
                  f"with face detector {detector_file}")
        except Exception as e:
            self.detector = None
            print(f"[Inference] Failed to load models from {self.models_dir}: {e}")

    def detect_faces(self, frame_bgr, max_faces=1, min_size=0):
        """Faces as (x, y, w, h, landmarks[5x2]), largest first."""
        h, w = frame_bgr.shape[:2]
        with self._detector_lock:
            self.detector.setInputSize((w, h))
            _, faces = self.detector.detect(frame_bgr)
        if faces is None or len(faces) == 0:
            return []
        faces = sorted((f for f in faces if min(f[2], f[3]) >= min_size), key=lambda f: f[2] * f[3], reverse=True)
        return [
            (float(f[0]), float(f[1]), float(f[2]), float(f[3]), f[4:14].reshape(5, 2).astype(np.float32))
            for f in faces[:max_faces]
        ]

    def _preprocess(self, frame_bgr, box):
        import cv2
        x, y, fw, fh = box
        margin = float(self.metadata.get('face_margin', 0.2))
        img_h, img_w = frame_bgr.shape[:2]
        x0 = int(max(0, x - fw * margin))
        y0 = int(max(0, y - fh * margin))
        x1 = int(min(img_w, x + fw * (1 + margin)))
        y1 = int(min(img_h, y + fh * (1 + margin)))
        crop = frame_bgr[y0:y1, x0:x1]
        if crop.size == 0:
            return None

        size = int(self.metadata.get('image_size', 256))
        ch, cw = crop.shape[:2]
        scale = size / min(ch, cw)
        nh, nw = max(size, round(ch * scale)), max(size, round(cw * scale))
        crop = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
        top, left = (nh - size) // 2, (nw - size) // 2
        crop = crop[top:top + size, left:left + size]

        rgb = crop[:, :, ::-1].astype(np.float32) / 255.0
        return np.transpose(rgb, (2, 0, 1))

    def _classify(self, batch):
        """[N,3,S,S] -> [N, classes] probabilities."""
        probs = self.session.run(None, {self.input_name: np.ascontiguousarray(batch)})[0].astype(np.float64)
        if self.metadata.get('output') != 'probabilities':
            probs = np.exp(probs - probs.max(axis=1, keepdims=True))
            probs /= probs.sum(axis=1, keepdims=True)
        return probs

    def warmup(self):
        if self.session is None:
            return
        size = int(self.metadata.get('image_size', 256))
        self._classify(np.zeros((1, 3, size, size), dtype=np.float32))

    def _describe(self, probs, face):
        classes = self.metadata['classes']
        expressions = {c: float(p) for c, p in zip(classes, probs)}
        scores = {
            group: float(sum(expressions.get(c, 0.0) for c in members))
            for group, members in SENTIMENT_GROUPS.items()
        }
        emotion = max(scores, key=scores.get)
        return {
            'emotion': emotion,
            'confidence': scores[emotion],
            'scores': scores,
            'expression': classes[int(np.argmax(probs))],
            'expressions': expressions,
            'box': face[:4],
            'landmarks': face[4],
        }

    def predict_faces(self, frame_bgr, max_faces=1, min_size=0):
        """
        Takes a BGR frame. Returns one dict per detected face (largest first) with the
        dashboard sentiment ('positive' | 'neutral' | 'negative'), its confidence,
        per-group scores, the top expression class, the face box (pixels) and landmarks.
        Empty when no model is loaded, no face is visible, or inference fails -
        predictions are never invented.
        """
        if self.session is None or self.detector is None:
            return []
        try:
            faces, tensors = [], []
            for face in self.detect_faces(frame_bgr, max_faces=max_faces, min_size=min_size):
                tensor = self._preprocess(frame_bgr, face[:4])
                if tensor is not None:
                    faces.append(face)
                    tensors.append(tensor)
            if not faces:
                return []
            probs = self._classify(np.stack(tensors))
            return [self._describe(p, face) for p, face in zip(probs, faces)]
        except Exception as ex:
            print(f"[Inference] ONNX evaluation error: {ex}")
            return []

    def predict(self, frame_bgr):
        """The largest face in the frame (a student's own webcam), or None."""
        results = self.predict_faces(frame_bgr, max_faces=1)
        return results[0] if results else None
