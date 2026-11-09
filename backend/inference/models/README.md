# EMP-EDU Model Directory

Required files (loaded by `../model_loader.py`):

- `deployment_metadata.json` - classes, `image_size`, `face_margin`, `face_detector` file name, `output`
- `face_detection_yunet_2023mar.onnx` - YuNet face detector (name must match `face_detector`)
- `yolov8m_face_expression.onnx` - expression classifier, input `[N,3,256,256]` float32 RGB 0-1,
  output probabilities for the six classes in the metadata. The face crop is converted to grayscale
  and replicated across the RGB channels before inference.

Fallback when no custom expression classifier is present:

- `emotion-ferplus-8.onnx` - Microsoft FER+ pretrained model (ONNX Model Zoo, MIT license), 64x64 grayscale,
  8 classes; disgust/contempt are dropped so it reports the same six classes. It is ignored whenever
  another expression classifier `.onnx` is in this folder. Download:
  https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx
  (sha256 `a2a2ba6a335a3b29c21acb6272f962bd3d47f84952aaffa03b60986e04efa61c`)
- YuNet download: https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
  (sha256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`)

Optional:

- `face_recognition_sface_2021dec.onnx` - SFace face recogniser (name must match `face_recognizer` in the
  metadata, which defaults to this file name). Names the faces in the instructor's shared screen. Download:
  https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface
  (sha256 `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`)

`best.pt` and the `*metrics.json` files are training artifacts and are not used at runtime.
