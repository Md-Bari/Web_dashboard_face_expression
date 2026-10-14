from rest_framework import serializers
from .emotions import empty_counts, percentages
from .models import Prediction, SessionSnapshot, TeachingSuggestion


class PredictionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)

    class Meta:
        model = Prediction
        fields = [
            'id',
            'session',
            'student',
            'student_name',
            'timestamp',
            'raw_emotion',
            'confidence',
            'raw_attention',
            'smoothed_emotion',
            'smoothed_attention',
        ]


class SessionSnapshotSerializer(serializers.ModelSerializer):
    emotion_counts = serializers.SerializerMethodField()
    emotion_pcts = serializers.SerializerMethodField()

    class Meta:
        model = SessionSnapshot
        fields = '__all__'

    def get_emotion_counts(self, obj):
        return {**empty_counts(), **obj.emotion_counts}

    def get_emotion_pcts(self, obj):
        return percentages(obj.emotion_counts, obj.total_students)


class TeachingSuggestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeachingSuggestion
        fields = '__all__'

