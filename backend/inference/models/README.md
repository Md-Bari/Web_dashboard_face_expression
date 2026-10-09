# EMP-EDU ONNX Model Directory

Place your custom trained YOLO or Emotion Classification ONNX model here (e.g. `emotion_yolo.onnx` or `model.onnx`).

### Expected Model Specs:
- **Input shape**: `[1, 3, 224, 224]` (Batch size 1, 3 channels RGB/BGR, 224x224 pixels)
- **Output shape**: `[1, 3]` (Classification logits or probabilities for: 0: positive, 1: neutral, 2: negative) or YOLO detection outputs.
- The worker automatically discovers any `.onnx` file placed in this directory upon startup.

