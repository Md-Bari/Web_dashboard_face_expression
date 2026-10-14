from django.db import migrations


def delete_simulated_predictions(apps, schema_editor):
    """Demo Telemetry rows were generated, not measured; drop them before the flag goes away."""
    Prediction = apps.get_model('analytics', 'Prediction')
    Prediction.objects.filter(is_simulated=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('analytics', '0002_prediction_is_simulated'),
    ]

    operations = [
        migrations.RunPython(delete_simulated_predictions, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='prediction',
            name='is_simulated',
        ),
    ]
