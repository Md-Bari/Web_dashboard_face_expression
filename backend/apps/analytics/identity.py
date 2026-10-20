"""
Putting names on the faces in the instructor's shared screen.

Each consenting student has a few face templates (FaceReference: 128-number SFace embeddings,
not images). A screen face is named after the enrolled student whose template it resembles
most, when the cosine similarity clears MATCH_THRESHOLD; otherwise it stays an anonymous
"Screen face N" that the instructor can name by hand - which also stores a template, so the
student is recognised automatically from then on.

Templates come from
  * the student's own webcam stream (one every WEBCAM_REFERENCE_INTERVAL seconds, up to MAX_PER_SOURCE),
  * the instructor naming a screen face,
  * the student's first-seen expression photos, for students who streamed before this existed.
"""
import os
import time

import numpy as np
from django.conf import settings
from django.contrib.auth import get_user_model

from apps.courses.models import ClassSession
from .models import ExpressionSnapshot, FaceReference

MATCH_THRESHOLD = 0.45           # SFace cosine similarity (OpenCV: 0.363); measured: same student >= 0.55, strangers <= 0.43
MAX_PER_SOURCE = 5               # templates kept per student and source
WEBCAM_REFERENCE_INTERVAL = 30.0
PHOTO_BACKFILL = 3               # expression photos turned into templates for a student without any
CACHE_SECONDS = 30.0

User = get_user_model()


def enabled():
    return getattr(settings, 'FACE_RECOGNITION_ENABLED', True)


def reference_count(student_id, source):
    return FaceReference.objects.filter(student_id=student_id, source=source).count()


def add_reference(student, embedding, source='webcam'):
    """Store a template, keeping the newest MAX_PER_SOURCE of this source for the student."""
    FaceReference.objects.create(
        student=student, source=source, embedding=[round(float(v), 6) for v in embedding],
    )
    stale = list(
        FaceReference.objects.filter(student=student, source=source)
        .order_by('-created_at').values_list('id', flat=True)[MAX_PER_SOURCE:]
    )
    if stale:
        FaceReference.objects.filter(id__in=stale).delete()


class ReferenceSet:
    """Templates of the students who can be recognised in one session."""

    def __init__(self, rows):
        # rows: [(student_id, embedding)]
        self.student_ids = np.array([sid for sid, _ in rows], dtype=np.int64)
        self.matrix = (
            np.array([emb for _, emb in rows], dtype=np.float32) if rows else np.zeros((0, 128), np.float32)
        )

    def __len__(self):
        return len(set(self.student_ids.tolist()))

    def ranked(self, embedding, threshold=MATCH_THRESHOLD):
        """[(student_id, similarity)] at or above the threshold, best first; one entry per student."""
        if embedding is None or not len(self.student_ids):
            return []
        sims = self.matrix @ np.asarray(embedding, dtype=np.float32)
        best = {}
        for sid, sim in zip(self.student_ids.tolist(), sims.tolist()):
            if sim > best.get(sid, -1.0):
                best[sid] = sim
        return sorted(((sid, sim) for sid, sim in best.items() if sim >= threshold), key=lambda r: -r[1])


_cache = {}               # session_id -> (loaded_at, ReferenceSet)
_backfill_tried = set()   # student ids whose photos were already tried


def invalidate(session_id):
    _cache.pop(str(session_id), None)


def references_for(session_id, model=None):
    """ReferenceSet of the session's enrolled, consenting students (cached for CACHE_SECONDS)."""
    key = str(session_id)
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
        return cached[1]

    session = ClassSession.objects.select_related('course').filter(id=session_id).first()
    student_ids = []
    if session:
        student_ids = list(
            session.course.enrollments.filter(student__consent_given=True).values_list('student_id', flat=True)
        )
    if model is not None and student_ids:
        backfill_from_photos(model, student_ids)

    rows = list(FaceReference.objects.filter(student_id__in=student_ids).values_list('student_id', 'embedding'))
    refs = ReferenceSet(rows)
    _cache[key] = (time.monotonic(), refs)
    return refs


def backfill_from_photos(model, student_ids):
    """Templates from saved expression photos, for students who have photos but no template yet."""
    if not getattr(model, 'can_recognise', False):
        return
    have = set(FaceReference.objects.filter(student_id__in=student_ids).values_list('student_id', flat=True))
    todo = [sid for sid in student_ids if sid not in have and sid not in _backfill_tried]
    if not todo:
        return
    import cv2

    for student in User.objects.filter(id__in=todo):
        _backfill_tried.add(student.id)
        photos = ExpressionSnapshot.objects.filter(student=student).order_by('-confidence')[:PHOTO_BACKFILL]
        for photo in photos:
            image = cv2.imread(os.path.join(settings.MEDIA_ROOT, photo.image))
            if image is None:
                continue
            embedding = model.embed_largest(image, min_score=0.6)
            if embedding is not None:
                add_reference(student, embedding, source='webcam')
