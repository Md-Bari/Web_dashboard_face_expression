from rest_framework import serializers
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
    class Meta:
        model = SessionSnapshot
        fields = '__all__'


class TeachingSuggestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeachingSuggestion
        fields = '__all__'

