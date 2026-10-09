import os
import glob
import numpy as np

class EmotionModel:
    """
    ONNX Runtime Inference Engine for Face Emotion Detection.
    Automatically discovers and loads any custom trained YOLO or classification .onnx model
    placed in backend/inference/models/.
    Provides high-fidelity fallback when custom ONNX model is not yet mounted.
    """
    def __init__(self, models_dir=None):
        if models_dir is None:
            models_dir = os.path.join(os.path.dirname(__file__), 'models')
        self.models_dir = models_dir
        self.session = None
        self.model_name = "Heuristic-Fallback-Model"
        self.input_name = None
        self.output_names = None
        self.load_model()

    def load_model(self):
        onnx_files = glob.glob(os.path.join(self.models_dir, '*.onnx'))
        if onnx_files:
            model_path = onnx_files[0]
            try:
                import onnxruntime as ort
                self.session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
                self.model_name = os.path.basename(model_path)
                self.input_name = self.session.get_inputs()[0].name
                self.output_names = [out.name for out in self.session.get_outputs()]
                print(f"[Inference] Loaded custom ONNX model: {self.model_name}")
                return
            except Exception as e:
                print(f"[Inference] Failed to load ONNX model {model_path}: {e}")

        print("[Inference] No ONNX model found in models/ directory. Emotion predictions are disabled.")
        self.model_name = "No model loaded"

    def predict(self, face_bgr):
        """
        Takes 224x224 BGR numpy image.
        Returns (emotion_label, confidence, emotion_scores), or None when no model is
        loaded or it fails - predictions are never invented.
        Labels: 'positive' | 'neutral' | 'negative'
        """
        if self.session is None:
            return None
        try:
            # Preprocess: 224x224 BGR -> RGB -> Float32 [0, 1] -> NCHW
            rgb = face_bgr[:, :, ::-1].astype(np.float32) / 255.0
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
            norm = (rgb - mean) / std
            tensor = np.transpose(norm, (2, 0, 1))
            tensor = np.expand_dims(tensor, axis=0)

            outputs = self.session.run(self.output_names, {self.input_name: tensor})
            raw_logits = outputs[0][0]

            # Softmax
            exp_logits = np.exp(raw_logits - np.max(raw_logits))
            probs = exp_logits / np.sum(exp_logits)
            if len(probs) < 3:
                print(f"[Inference] Model returned {len(probs)} outputs; expected 3 (positive, neutral, negative)")
                return None

            labels = ['positive', 'neutral', 'negative']
            top_idx = int(np.argmax(probs[:3]))
            conf = float(probs[top_idx])
            return labels[top_idx], conf, {
                'positive': float(probs[0]),
                'neutral': float(probs[1]),
                'negative': float(probs[2]),
            }
        except Exception as ex:
            print(f"[Inference] ONNX evaluation error: {ex}")
            return None

