"""The six facial expression classes the model is trained on (display order)."""

EMOTIONS = ('happy', 'surprise', 'neutral', 'fear', 'sad', 'angry')

EMOTION_CHOICES = tuple((e, e.capitalize()) for e in EMOTIONS)


def empty_counts():
    return {e: 0 for e in EMOTIONS}


def percentages(counts, total):
    return {e: round(counts.get(e, 0) / total * 100) if total else 0 for e in EMOTIONS}
