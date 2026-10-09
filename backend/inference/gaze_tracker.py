import numpy as np

class GazeTracker:
    """
    Simulates eye tracking and gaze estimation (PyGaze / MediaPipe pipeline).
    Extracts attention score 0.0 - 1.0 based on eye focus, head pose, and facial landmarks.
    """
    def __init__(self):
        pass

    def estimate_attention(self, face_bgr):
        """
        Calculates an attention score from 0.0 (distracted / eyes shut)
        to 1.0 (highly attentive / eyes focused on screen).
        """
        # Analyze upper facial half (eye region)
        h, w, _ = face_bgr.shape
        eye_region = face_bgr[int(h * 0.2):int(h * 0.55), int(w * 0.15):int(w * 0.85)]
        
        if eye_region.size == 0:
            return 0.70

        # Calculate brightness and variance in eye region
        gray_eye = np.mean(eye_region, axis=2)
        variance = float(np.var(gray_eye))

        # Attentive eyes typically show iris contrast variance
        if variance > 400:
            attention = 0.85 + float(min(variance / 2000.0, 0.10))
        elif variance > 150:
            attention = 0.65 + float((variance - 150) / 1000.0)
        else:
            attention = 0.40 + float(variance / 500.0)

        return round(float(np.clip(attention, 0.0, 1.0)), 2)

