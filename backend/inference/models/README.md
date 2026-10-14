# EMP-EDU Model Directory

Required files (loaded by `../model_loader.py`):

- `deployment_metadata.json` - classes, `image_size`, `face_margin`, `face_detector` file name, `output`
- `face_detection_yunet_2023mar.onnx` - YuNet face detector (name must match `face_detector`)
- one expression classifier `.onnx` (currently `yolo_face_expression_ensemble.onnx`):
  input `[N,3,S,S]` float32 RGB 0-1, output probabilities for the classes in the metadata

`best.pt` and the `*metrics.json` files are training artifacts and are not used at runtime.
