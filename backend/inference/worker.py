import os
import json
import time
import base64
import io
import numpy as np
from PIL import Image
from model_loader import EmotionModel
from gaze_tracker import GazeTracker

try:
    import redis
    REDIS_HOST = os.environ.get('REDIS_HOST', '127.0.0.1')
    REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
except Exception:
    r = None

def decode_base64_image(b64_string):
    """Decodes base64 string to 224x224 BGR numpy array."""
    if ',' in b64_string:
        b64_string = b64_string.split(',')[1]
    img_bytes = base64.b64decode(b64_string)
    pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    if pil_img.size != (224, 224):
        pil_img = pil_img.resize((224, 224), Image.Resampling.BILINEAR)
    # RGB to BGR
    img_np = np.array(pil_img)[:, :, ::-1]
    return img_np

def run_worker():
    print("[Inference Worker] Initializing AI models...")
    emotion_model = EmotionModel()
    gaze_tracker = GazeTracker()
    print(f"[Inference Worker] Ready. Active Model: {emotion_model.model_name}")

    queue_name = "inference_tasks"
    last_heartbeat = time.time()

    while True:
        try:
            # Emit heartbeat every 5 seconds
            if time.time() - last_heartbeat > 5:
                last_heartbeat = time.time()
                if r:
                    r.publish("model_status", json.dumps({
                        "status": "Active",
                        "model_name": emotion_model.model_name,
                        "timestamp": int(time.time() * 1000)
                    }))

            if not r:
                time.sleep(1)
                continue

            # Pop task from Redis queue (blocking with timeout 1s)
            item = r.brpop(queue_name, timeout=1)
            if not item:
                continue

            _, task_json = item
            task = json.loads(task_json.decode('utf-8'))

            start_t = time.time()
            face_bgr = decode_base64_image(task['image'])
            
            prediction = emotion_model.predict(face_bgr)
            if prediction is None:
                # No model loaded (or it failed): publish nothing rather than an invented result
                continue
            emotion, conf, scores = prediction
            attention = gaze_tracker.estimate_attention(face_bgr)
            latency_ms = int((time.time() - start_t) * 1000)

            result = {
                "session_id": task.get("session_id"),
                "student_id": task.get("student_id"),
                "emotion": emotion,
                "confidence": conf,
                "attention": attention,
                "scores": scores,
                "latency_ms": latency_ms,
                "timestamp": task.get("timestamp", int(time.time() * 1000))
            }

            # Return result via pub/sub channel
            channel = f"inference_results_{task.get('session_id')}"
            r.publish(channel, json.dumps(result))

        except Exception as e:
            print(f"[Inference Worker Error]: {e}")
            time.sleep(0.5)

if __name__ == '__main__':
    run_worker()

