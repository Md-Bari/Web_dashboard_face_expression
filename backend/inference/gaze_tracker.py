import numpy as np


class GazeTracker:
    """
    Attention score from head pose, measured on the five YuNet face landmarks
    (right eye, left eye, nose tip, right and left mouth corners).

    A face turned sideways (yaw) or tilted far up/down (pitch) is looking away from
    the screen. 1.0 = facing the screen, 0.0 = turned well away.
    """
    YAW_TOLERANCE = 0.08     # nose offset / eye distance still counted as frontal
    YAW_LIMIT = 0.45         # offset at which attention reaches 0
    PITCH_CENTER = 0.55      # nose position between the eye line (0) and mouth line (1) when frontal
    PITCH_TOLERANCE = 0.10
    PITCH_LIMIT = 0.35

    def estimate_attention(self, landmarks):
        pts = np.asarray(landmarks, dtype=np.float32).reshape(5, 2)
        right_eye, left_eye, nose, right_mouth, left_mouth = pts
        eye_mid = (right_eye + left_eye) / 2
        mouth_mid = (right_mouth + left_mouth) / 2

        eye_dist = float(np.linalg.norm(left_eye - right_eye))
        face_height = float(mouth_mid[1] - eye_mid[1])
        if eye_dist < 1e-3 or face_height < 1e-3:
            return 0.0

        yaw = abs(float(nose[0] - eye_mid[0])) / eye_dist
        pitch = abs(float(nose[1] - eye_mid[1]) / face_height - self.PITCH_CENTER)

        yaw_pen = np.clip((yaw - self.YAW_TOLERANCE) / (self.YAW_LIMIT - self.YAW_TOLERANCE), 0.0, 1.0)
        pitch_pen = np.clip((pitch - self.PITCH_TOLERANCE) / (self.PITCH_LIMIT - self.PITCH_TOLERANCE), 0.0, 1.0)
        attention = (1.0 - yaw_pen) * (1.0 - pitch_pen)
        return round(float(attention), 2)
