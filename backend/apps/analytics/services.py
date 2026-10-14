from collections import Counter
from datetime import timedelta
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .emotions import empty_counts, percentages
from .models import Prediction, SessionSnapshot, TeachingSuggestion
from apps.courses.models import ClassSession


class SmoothingEngine:
    """
    Smooths predictions over a 10-second rolling window per student (or per screen
    participant when `student` is None). Majority vote for emotion, mean for attention.
    """
    @staticmethod
    def smooth(session, student, current_raw_emotion, current_raw_attention, current_confidence, participant=''):
        now = timezone.now()
        window_start = now - timedelta(seconds=10)

        who = {'student': student} if student is not None else {'student__isnull': True, 'participant': participant}
        recent_predictions = list(
            Prediction.objects.filter(
                session=session,
                timestamp__gte=window_start,
                **who,
            ).values_list('raw_emotion', 'raw_attention')
        )

        emotions = [r[0] for r in recent_predictions] + [current_raw_emotion]
        attentions = [r[1] for r in recent_predictions] + [current_raw_attention]

        # Majority vote for emotion
        emotion_counts = Counter(emotions)
        smoothed_emotion = emotion_counts.most_common(1)[0][0]

        # Mean for attention
        smoothed_attention = round(float(sum(attentions) / len(attentions)), 3)

        # Persist prediction (labels and scores only - never image data)
        prediction = Prediction.objects.create(
            session=session,
            student=student,
            participant='' if student is not None else participant,
            raw_emotion=current_raw_emotion,
            confidence=current_confidence,
            raw_attention=current_raw_attention,
            smoothed_emotion=smoothed_emotion,
            smoothed_attention=smoothed_attention,
        )

        return prediction


def serialize_suggestion(sug):
    return {
        "id": sug.id,
        "title": sug.title,
        "description": sug.description,
        "category": sug.category,
        "icon": sug.icon,
        "created_at": sug.created_at.isoformat(),
    }


class AggregationService:
    """
    Aggregates student telemetry every 2-5 seconds, creates SessionSnapshot,
    evaluates rule-based AI teaching suggestions, and broadcasts over Channels.
    """
    ACTIVE_WINDOW_SECONDS = 15
    TIMELINE_POINTS = 24

    @staticmethod
    def latest_predictions(session, window_seconds=None):
        """Latest prediction per enrolled student (optionally only within a recent window)."""
        enrolled_ids = set(session.course.enrollments.values_list('student_id', flat=True))
        qs = Prediction.objects.filter(session=session, student_id__in=enrolled_ids)
        if window_seconds:
            qs = qs.filter(timestamp__gte=timezone.now() - timedelta(seconds=window_seconds))
        latest = {}
        for pred in qs.order_by('-timestamp').iterator():
            if pred.student_id not in latest:
                latest[pred.student_id] = pred
                if len(latest) == len(enrolled_ids):
                    break
        return latest, len(enrolled_ids)

    @staticmethod
    def latest_screen_predictions(session, window_seconds):
        """Latest prediction per screen-capture participant seen within the window."""
        qs = Prediction.objects.filter(
            session=session, student__isnull=True,
            timestamp__gte=timezone.now() - timedelta(seconds=window_seconds),
        ).exclude(participant='')
        latest = {}
        for pred in qs.order_by('-timestamp').iterator():
            latest.setdefault(pred.participant, pred)
        return latest

    @staticmethod
    def build_timeline(session_id, limit=None):
        limit = limit or AggregationService.TIMELINE_POINTS
        rows = list(
            SessionSnapshot.objects.filter(session_id=session_id)
            .order_by('-timestamp')
            .values('timestamp', 'avg_concentration')[:limit]
        )
        rows.reverse()
        return [
            {
                'timestamp': r['timestamp'].isoformat(),
                'time': r['timestamp'].strftime('%H:%M:%S'),
                'concentration': round(r['avg_concentration']),
            }
            for r in rows
        ]

    @staticmethod
    def serialize_snapshot(snapshot, with_timeline=True):
        data = {
            "total_students": snapshot.total_students,
            "emotion_counts": {**empty_counts(), **snapshot.emotion_counts},
            "emotion_pcts": percentages(snapshot.emotion_counts, snapshot.total_students),
            "avg_concentration": snapshot.avg_concentration,
            "low_concentration_count": snapshot.low_concentration_count,
            "timestamp": snapshot.timestamp.isoformat(),
        }
        if with_timeline:
            data["timeline"] = AggregationService.build_timeline(snapshot.session_id)
        return data

    @staticmethod
    def aggregate_session(session_id):
        try:
            session = ClassSession.objects.select_related('course').get(id=session_id)
        except (ClassSession.DoesNotExist, ValueError):
            return None

        latest, _ = AggregationService.latest_predictions(
            session, AggregationService.ACTIVE_WINDOW_SECONDS
        )
        screen = AggregationService.latest_screen_predictions(session, AggregationService.ACTIVE_WINDOW_SECONDS)
        preds = list(latest.values()) + list(screen.values())
        total_active = len(preds)

        counts = empty_counts()
        for p in preds:
            if p.smoothed_emotion in counts:
                counts[p.smoothed_emotion] += 1
        if preds:
            att_values = [p.smoothed_attention for p in preds]
            avg_conc = round(sum(att_values) / len(att_values) * 100)
            low_conc_count = sum(1 for a in att_values if a < 0.5)
        else:
            low_conc_count = 0
            avg_conc = 0

        snapshot = SessionSnapshot.objects.create(
            session=session,
            total_students=total_active,
            emotion_counts=counts,
            avg_concentration=avg_conc,
            low_concentration_count=low_conc_count,
        )

        if total_active:
            AggregationService.evaluate_suggestions(
                session, percentages(counts, total_active), avg_conc, low_conc_count
            )

        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"session_{session.id}",
                {
                    "type": "broadcast_session_snapshot",
                    "snapshot": AggregationService.serialize_snapshot(snapshot),
                },
            )

        return snapshot

    @staticmethod
    def prune_old_predictions(session_id, keep_minutes=30):
        """Predictions are only needed for smoothing and live views; snapshots keep the history."""
        Prediction.objects.filter(
            session_id=session_id,
            timestamp__lt=timezone.now() - timedelta(minutes=keep_minutes),
        ).delete()

    @staticmethod
    def evaluate_suggestions(session, pcts, avg_conc, low_conc_count):
        """Rule-based suggestions from the class-wide share of each expression (percent)."""
        suggestions_to_add = []

        worried = pcts['sad'] + pcts['fear']
        if worried >= 20:
            suggestions_to_add.append({
                "title": "Consider adding more examples",
                "description": f"{worried}% of students look sad or anxious. Practical examples may help them follow.",
                "category": "CONFUSION",
                "icon": "book"
            })

        if pcts['angry'] >= 15:
            suggestions_to_add.append({
                "title": "Check for frustration",
                "description": f"{pcts['angry']}% of students look frustrated. Slow down and check understanding.",
                "category": "CONFUSION",
                "icon": "message-square"
            })

        if pcts['surprise'] >= 25:
            suggestions_to_add.append({
                "title": "Recap the last point",
                "description": f"{pcts['surprise']}% of students look surprised. A short recap can help it sink in.",
                "category": "ENGAGEMENT",
                "icon": "book"
            })

        if pcts['neutral'] >= 50:
            suggestions_to_add.append({
                "title": "Engage students with a quick poll",
                "description": f"{pcts['neutral']}% of students look neutral. Try an interactive poll or question.",
                "category": "ENGAGEMENT",
                "icon": "users"
            })

        if avg_conc < 75 or low_conc_count >= 3:
            suggestions_to_add.append({
                "title": "Take a short break",
                "description": "Attention levels are dropping for some students.",
                "category": "FATIGUE",
                "icon": "clock"
            })

        suggestions_to_add.append({
            "title": "Encourage participation",
            "description": "Ask open-ended questions to improve engagement.",
            "category": "PARTICIPATION",
            "icon": "message-square"
        })

        channel_layer = get_channel_layer()
        group_name = f"session_{session.id}"

        for item in suggestions_to_add:
            # Check if recently suggested within 2 minutes
            recent = TeachingSuggestion.objects.filter(
                session=session,
                title=item["title"],
                created_at__gte=timezone.now() - timedelta(minutes=2)
            ).first()

            if not recent:
                sug = TeachingSuggestion.objects.create(
                    session=session,
                    title=item["title"],
                    description=item["description"],
                    category=item["category"],
                    icon=item["icon"],
                )
                if channel_layer:
                    async_to_sync(channel_layer.group_send)(
                        group_name,
                        {
                            "type": "broadcast_suggestion",
                            "suggestion": serialize_suggestion(sug),
                        }
                    )
