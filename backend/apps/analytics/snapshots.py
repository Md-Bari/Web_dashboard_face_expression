"""
First-seen expression snapshots: one face crop per (session, student, expression).

    MEDIA_ROOT/expression_snapshots/session_<id>/<expression>/<username>.jpg

The database row claims the slot first (unique constraint), then the file is written, so two
connections of the same student can never both store a "happy". Deleting a row deletes its file.
"""
import os
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import ExpressionSnapshot

ROOT = 'expression_snapshots'


def enabled():
    return getattr(settings, 'EXPRESSION_SNAPSHOTS_ENABLED', True)


def min_confidence():
    return getattr(settings, 'EXPRESSION_SNAPSHOT_MIN_CONFIDENCE', 0.5)


def stored_emotions(session_id, student_id):
    return set(
        ExpressionSnapshot.objects.filter(session_id=session_id, student_id=student_id).values_list('emotion', flat=True)
    )


def relative_path(session_id, emotion, username):
    safe_name = re.sub(r'[^\w.@+-]', '_', username)
    return f"{ROOT}/session_{session_id}/{emotion}/{safe_name}.jpg"


def save_first(session_id, student, emotion, confidence, jpeg_bytes):
    """Store this face as the student's `emotion` snapshot unless one exists. Returns True if stored."""
    if not jpeg_bytes:
        return False
    rel = relative_path(session_id, emotion, student.username)
    try:
        with transaction.atomic():
            snapshot = ExpressionSnapshot.objects.create(
                session_id=session_id, student=student, emotion=emotion, confidence=confidence, image=rel,
            )
    except IntegrityError:
        return False  # already stored (e.g. by the student's other tab)

    path = os.path.join(settings.MEDIA_ROOT, rel)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.tmp"
        with open(tmp, 'wb') as fh:
            fh.write(jpeg_bytes)
        os.replace(tmp, path)
    except OSError as exc:
        print(f"[snapshots] could not write {path}: {exc}")
        snapshot.delete()
        return False
    return True


@receiver(post_delete, sender=ExpressionSnapshot)
def _delete_file(sender, instance, **kwargs):
    try:
        os.remove(os.path.join(settings.MEDIA_ROOT, instance.image))
    except OSError:
        pass
