import glob
import json
import os
import threading

import numpy as np

DEFAULT_METADATA = {
    'classes': ['angry', 'fear', 'happy', 'neutral', 'sad', 'surprise'],
    'image_size': 256,
    'output': 'probabilities',
    'face_detector': 'face_detection_yunet_2023mar.onnx',
    'face_margin': 0.2,
    'face_recognizer': 'face_recognition_sface_2021dec.onnx',
}

FACE_SCORE_THRESHOLD = 0.6

# Pretrained fallback used only while no expression model of your own is in models/:
# Microsoft FER+ (ONNX Model Zoo, MIT). Input [1,1,64,64] grayscale 0-255, output 8 logits.
# Its disgust/contempt classes have no counterpart here and are left out of the softmax.
FERPLUS_FILE = 'emotion-ferplus-8.onnx'
FERPLUS_OUTPUTS = ['neutral', 'happiness', 'surprise', 'sadness', 'anger', 'disgust', 'fear', 'contempt']
FERPLUS_NAMES = {'angry': 'anger', 'fear': 'fear', 'happy': 'happiness',
                 'neutral': 'neutral', 'sad': 'sadness', 'surprise': 'surprise'}
FERPLUS_SIZE = 64


class EmotionModel:
    """
    Face expression pipeline described by models/deployment_metadata.json:

      1. YuNet (OpenCV FaceDetectorYN) finds the faces in the frame.
      2. The face box is grown by `face_margin`, cropped, its short side resized to
         `image_size` and centre cropped.
      3. The ONNX expression ensemble returns probabilities for the six classes
         (angry, fear, happy, neutral, sad, surprise); the top class is the prediction.

    Optional: SFace (OpenCV FaceRecognizerSF, `face_recognizer`) turns an aligned face into a
    128-number identity embedding, used to recognise students in a shared screen.

    When no expression model of your own is present, the pretrained FER+ model
    (emotion-ferplus-8.onnx) is used instead if it is in models/.

    Nothing is predicted when a model file is missing or no face is found.
    """

    def __init__(self, models_dir=None):
        if models_dir is None:
            models_dir = os.path.join(os.path.dirname(__file__), 'models')
        self.models_dir = models_dir
        self.session = None
        self.detector = None
        self.recognizer = None
        self.model_name = "No model loaded"
        self.input_name = None
        self.ferplus = False  # True while the FER+ fallback is the classifier
        self.ferplus_index = None
        self.metadata = dict(DEFAULT_METADATA)
        self._detector_lock = threading.Lock()  # cv2.FaceDetectorYN is not thread-safe
        self._recognizer_lock = threading.Lock()  # neither is cv2.FaceRecognizerSF
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
        self.recognizer = None
        self.ferplus = False
        self.model_name = "No model loaded"
        self.metadata = self._read_metadata()

        detector_file = self.metadata['face_detector']
        detector_path = os.path.join(self.models_dir, detector_file)
        recognizer_file = self.metadata['face_recognizer']
        classifier_files = sorted(
            f for f in glob.glob(os.path.join(self.models_dir, '*.onnx'))
            if os.path.basename(f) not in (detector_file, recognizer_file, FERPLUS_FILE)
        )
        ferplus_path = os.path.join(self.models_dir, FERPLUS_FILE)
        if not classifier_files and os.path.exists(ferplus_path):
            missing = [c for c in self.metadata['classes'] if c.lower() not in FERPLUS_NAMES]
            if missing:
                print(f"[Inference] FER+ has no class for {missing}. Emotion predictions are disabled.")
                return
            classifier_files = [ferplus_path]
            self.ferplus = True
            self.ferplus_index = [FERPLUS_OUTPUTS.index(FERPLUS_NAMES[c.lower()]) for c in self.metadata['classes']]
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
            if not self.ferplus and isinstance(n_out, int) and n_out != len(self.metadata['classes']):
                print(f"[Inference] {os.path.basename(model_path)} has {n_out} outputs but metadata lists "
                      f"{len(self.metadata['classes'])} classes. Emotion predictions are disabled.")
                self.detector = None
                return
            self.session = session
            self.model_name = os.path.basename(model_path) + (' (pretrained fallback)' if self.ferplus else '')
            print(f"[Inference] Loaded {self.model_name} ({', '.join(self.metadata['classes'])}) "
                  f"with face detector {detector_file}")
        except Exception as e:
            self.detector = None
            self.ferplus = False
            print(f"[Inference] Failed to load models from {self.models_dir}: {e}")
            return

        recognizer_path = os.path.join(self.models_dir, recognizer_file)
        if os.path.exists(recognizer_path):
            try:
                import cv2
                self.recognizer = cv2.FaceRecognizerSF.create(recognizer_path, "")
                print(f"[Inference] Face recognition enabled ({recognizer_file})")
            except Exception as e:
                print(f"[Inference] Could not load face recogniser {recognizer_file}: {e}")
        else:
            print(f"[Inference] {recognizer_file} not in models/. Screen faces will not be recognised by name.")

    def detect_faces(self, frame_bgr, max_faces=1, min_size=0, min_score=0.0, plausible_only=False):
        """Faces as (x, y, w, h, landmarks[5x2], score), largest first."""
        h, w = frame_bgr.shape[:2]
        with self._detector_lock:
            self.detector.setInputSize((w, h))
            _, faces = self.detector.detect(frame_bgr)
        if faces is None or len(faces) == 0:
            return []
        found = [
            (float(f[0]), float(f[1]), float(f[2]), float(f[3]), f[4:14].reshape(5, 2).astype(np.float32), float(f[14]))
            for f in faces
            if min(f[2], f[3]) >= min_size and f[14] >= min_score
        ]
        if plausible_only:
            found = [f for f in found if plausible_face(f)]
        found.sort(key=lambda f: f[2] * f[3], reverse=True)
        return found[:max_faces]

    def face_crop(self, frame_bgr, box):
        """The face exactly as the classifier sees it: margin, short side -> image_size, centre crop (BGR uint8)."""
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
        return crop[top:top + size, left:left + size]

    def _preprocess(self, frame_bgr, box):
        crop = self.face_crop(frame_bgr, box)
        if crop is None:
            return None
        if self.ferplus:
            import cv2
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            gray = cv2.resize(gray, (FERPLUS_SIZE, FERPLUS_SIZE), interpolation=cv2.INTER_AREA)
            return gray.astype(np.float32)[None, :, :]  # [1,64,64], raw 0-255 as FER+ was trained
        rgb = crop[:, :, ::-1].astype(np.float32) / 255.0
        return np.transpose(rgb, (2, 0, 1))

    def _classify(self, batch):
        """[N,3,S,S] -> [N, classes] probabilities."""
        if self.ferplus:
            # The FER+ graph has a fixed batch of 1; keep only the classes this app uses
            logits = np.stack([
                self.session.run(None, {self.input_name: np.ascontiguousarray(x[None])})[0][0]
                for x in batch
            ]).astype(np.float64)[:, self.ferplus_index]
            probs = np.exp(logits - logits.max(axis=1, keepdims=True))
            return probs / probs.sum(axis=1, keepdims=True)
        probs = self.session.run(None, {self.input_name: np.ascontiguousarray(batch)})[0].astype(np.float64)
        if self.metadata.get('output') != 'probabilities':
            probs = np.exp(probs - probs.max(axis=1, keepdims=True))
            probs /= probs.sum(axis=1, keepdims=True)
        return probs

    def warmup(self):
        if self.session is None:
            return
        if self.ferplus:
            self._classify(np.zeros((1, 1, FERPLUS_SIZE, FERPLUS_SIZE), dtype=np.float32))
            return
        size = int(self.metadata.get('image_size', 256))
        self._classify(np.zeros((1, 3, size, size), dtype=np.float32))

    def _describe(self, probs, face):
        classes = [c.lower() for c in self.metadata['classes']]
        top = int(np.argmax(probs))
        return {
            'emotion': classes[top],
            'confidence': float(probs[top]),
            'scores': {c: float(p) for c, p in zip(classes, probs)},
            'box': face[:4],
            'landmarks': face[4],
            'detection': face,
        }

    def predict_faces(self, frame_bgr, max_faces=1, min_size=0, min_score=0.0, plausible_only=False):
        """
        Takes a BGR frame. Returns one dict per detected face (largest first) with the top
        expression class ('angry' | 'fear' | 'happy' | 'neutral' | 'sad' | 'surprise'), its
        probability, all class probabilities, the face box (pixels) and landmarks.
        Empty when no model is loaded, no face is visible, or inference fails -
        predictions are never invented.
        """
        if self.session is None or self.detector is None:
            return []
        try:
            faces, tensors = [], []
            for face in self.detect_faces(frame_bgr, max_faces=max_faces, min_size=min_size,
                                          min_score=min_score, plausible_only=plausible_only):
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

    # ------------------------------------------------------------------ identity

    @property
    def can_recognise(self):
        return self.recognizer is not None

    def embed(self, frame_bgr, detection):
        """Unit-length identity embedding of one detected face (see detect_faces), or None."""
        if self.recognizer is None or detection is None:
            return None
        x, y, w, h, landmarks, score = detection
        row = np.array([[x, y, w, h, *landmarks.reshape(-1), score]], dtype=np.float32)
        try:
            with self._recognizer_lock:
                aligned = self.recognizer.alignCrop(frame_bgr, row)
                feature = self.recognizer.feature(aligned).reshape(-1).astype(np.float32)
        except Exception as ex:
            print(f"[Inference] Face embedding error: {ex}")
            return None
        norm = float(np.linalg.norm(feature))
        return feature / norm if norm > 0 else None

    def embed_largest(self, frame_bgr, min_score=0.8):
        """Embedding of the largest clear face in an image (a webcam frame or a saved face crop)."""
        if self.recognizer is None or self.detector is None:
            return None
        faces = self.detect_faces(frame_bgr, max_faces=1, min_score=min_score, plausible_only=True)
        return self.embed(frame_bgr, faces[0]) if faces else None


def plausible_face(face):
    """
    Rejects detections whose landmarks do not form a face. Text, logos and graphics in a
    shared screen often fool the detector, but rarely give two level eyes above a nose above
    a mouth at human proportions.
    """
    x, y, w, h, lm, _ = face
    if not 0.55 <= w / max(h, 1e-6) <= 1.5:
        return False
    pad_x, pad_y = w * 0.15, h * 0.15
    if not ((lm[:, 0] >= x - pad_x).all() and (lm[:, 0] <= x + w + pad_x).all()
            and (lm[:, 1] >= y - pad_y).all() and (lm[:, 1] <= y + h + pad_y).all()):
        return False
    right_eye, left_eye, nose, mouth_r, mouth_l = lm
    eye_vec = left_eye - right_eye
    eye_dist = float(np.linalg.norm(eye_vec))
    if not 0.25 * w <= eye_dist <= 0.75 * w:
        return False
    if eye_vec[0] <= 0 or abs(eye_vec[1]) > 0.6 * eye_vec[0]:  # eyes roughly level, in the right order
        return False
    down = np.array([-eye_vec[1], eye_vec[0]]) / eye_dist      # perpendicular to the eye line
    eye_mid = (right_eye + left_eye) / 2
    nose_drop = float((nose - eye_mid) @ down)
    mouth_drop = float(((mouth_r + mouth_l) / 2 - eye_mid) @ down)
    if not 0.15 * eye_dist < nose_drop < mouth_drop:
        return False
    if not 0.6 * eye_dist <= mouth_drop <= 1.8 * eye_dist:
        return False
    mouth_width = float(np.linalg.norm(mouth_l - mouth_r))
    return 0.35 * eye_dist <= mouth_width <= 1.5 * eye_dist
