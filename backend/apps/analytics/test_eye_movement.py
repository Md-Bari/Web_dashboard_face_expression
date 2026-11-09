"""Eye movement analysis (backend/inference/eye_movement.py) on synthetic eyes and gaze sequences."""
import cv2
import numpy as np
from django.test import SimpleTestCase

import apps.analytics.inference_engine  # noqa: F401  (puts backend/inference on sys.path)
from eye_movement import EyeMovementAnalyzer, measure_eyes

# Frontal face: eyes 80 px apart, nose centred at 55 % of the eye-to-mouth height
RIGHT_EYE, LEFT_EYE = (160, 200), (240, 200)
FRONTAL = [RIGHT_EYE, LEFT_EYE, (200, 233), (170, 260), (230, 260)]


def face_image(iris_dx=0, closed=False):
    """Skin-coloured frame with two eyes; the irises are shifted by iris_dx px, or eyes closed."""
    img = np.full((400, 400, 3), 180, np.uint8)
    for cx, cy in (RIGHT_EYE, LEFT_EYE):
        cv2.ellipse(img, (cx, cy), (18, 9), 0, 0, 360, (235, 235, 235), -1)       # sclera
        if closed:
            cv2.line(img, (cx - 18, cy + 2), (cx + 18, cy + 2), (30, 30, 30), 2)  # lash line
        else:
            cv2.circle(img, (cx + iris_dx, cy), 7, (40, 40, 40), -1)              # iris + pupil
    return img


class MeasureEyesTests(SimpleTestCase):
    def test_frontal_open_eyes_look_at_screen(self):
        m = measure_eyes(face_image(), FRONTAL)
        self.assertTrue(m['eyes_open'])
        self.assertTrue(m['on_screen'])
        self.assertLess(abs(m['gaze'][0]), 0.2)

    def test_iris_direction_moves_gaze(self):
        # Iris towards the image's left = the student looks to their right (+x)
        right = measure_eyes(face_image(iris_dx=-8), FRONTAL)['gaze'][0]
        left = measure_eyes(face_image(iris_dx=8), FRONTAL)['gaze'][0]
        self.assertGreater(right, 0.2)
        self.assertLess(left, -0.2)

    def test_closed_eyes(self):
        m = measure_eyes(face_image(closed=True), FRONTAL)
        self.assertFalse(m['eyes_open'])
        self.assertFalse(m['on_screen'])

    def test_head_turned_is_off_screen(self):
        turned = [RIGHT_EYE, LEFT_EYE, (170, 233), (150, 260), (210, 260)]
        self.assertFalse(measure_eyes(face_image(), turned)['on_screen'])

    def test_tiny_face_falls_back_to_head_direction(self):
        small = [(100, 100), (115, 100), (107.5, 106), (102, 111), (113, 111)]
        m = measure_eyes(face_image(), small)
        self.assertIsNone(m['eyes_open'])
        self.assertTrue(m['on_screen'])


def sample(x, y=0.0, eyes_open=True):
    return {'gaze': (x, y), 'eyes_open': eyes_open,
            'on_screen': abs(x) <= 0.5 and abs(y) <= 0.5 and eyes_open}


class AnalyzerTests(SimpleTestCase):
    def feed(self, values, dt=0.35):
        a = EyeMovementAnalyzer()
        for i, v in enumerate(values):
            a.add(i * dt, v)
        return a.summary()

    def test_steady_gaze_is_one_long_fixation(self):
        s = self.feed([sample(0.05)] * 40)
        self.assertEqual(s['fixations'], 1)
        self.assertGreaterEqual(s['fixation_pct'], 95)
        self.assertEqual(s['gaze_shifts_per_min'], 0)
        self.assertEqual(s['on_screen_pct'], 100)

    def test_gaze_shifts_between_screen_regions(self):
        # Reading back and forth: 4 samples left, 4 samples right, repeated
        s = self.feed(([sample(-0.4)] * 4 + [sample(0.4)] * 4) * 5)
        self.assertEqual(s['fixations'], 10)
        self.assertGreater(s['gaze_shifts_per_min'], 0)
        self.assertGreater(s['mean_fixation_s'], 0.6)

    def test_closures_and_drowsiness(self):
        blinks = ([sample(0)] * 8 + [sample(0, eyes_open=False)]) * 4
        s = self.feed(blinks)
        self.assertGreater(s['closures_per_min'], 0)
        self.assertFalse(s['drowsy'])
        s = self.feed([sample(0)] * 30 + [sample(0, eyes_open=False)] * 5)
        self.assertTrue(s['drowsy'])

    def test_missing_face_counts_as_off_screen(self):
        s = self.feed([sample(0)] * 30 + [None] * 10)
        self.assertEqual(s['on_screen_pct'], 75)
        self.assertFalse(s['on_screen'])
        self.assertIsNone(s['gaze'])

    def test_rates_need_enough_data(self):
        s = self.feed([sample(0)] * 5)
        self.assertIsNone(s['gaze_shifts_per_min'])

    def test_window_drops_old_samples(self):
        a = EyeMovementAnalyzer(window=10)
        for i in range(100):
            a.add(i * 0.5, sample(0))
        self.assertLessEqual(a.samples[-1][0] - a.samples[0][0], 10)
