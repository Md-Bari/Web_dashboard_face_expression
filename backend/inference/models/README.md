# EMP-EDU Model Directory

Required files (loaded by `../model_loader.py`):

- `deployment_metadata.json` - classes, `image_size`, `face_margin`, `face_detector` file name, `output`
- `face_detection_yunet_2023mar.onnx` - YuNet face detector (name must match `face_detector`)
- one expression classifier `.onnx` (currently `yolo_face_expression_ensemble.onnx`):
  input `[N,3,S,S]` float32 RGB 0-1, output probabilities for the classes in the metadata

Optional:

- `face_recognition_sface_2021dec.onnx` - SFace face recogniser (name must match `face_recognizer` in the
  metadata, which defaults to this file name). Names the faces in the instructor's shared screen. Download:
  https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface
  (sha256 `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`)

`best.pt` and the `*metrics.json` files are training artifacts and are not used at runtime.
