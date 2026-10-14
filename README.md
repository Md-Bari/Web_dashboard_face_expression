# EMP-EDU: AI-Powered Real-Time Class Analytics Platform

An AI-powered e-learning platform providing live emotional, attentional, and engagement telemetry for instructors during live lectures.

![EMP-EDU Dashboard](docs/dashboard-preview.png)

---

## Architecture Stack

- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Zustand) in `/frontend`
- **Backend**: Django 5 + Django REST Framework + Django Channels (Daphne ASGI) + Celery + Redis + PostgreSQL in `/backend`
- **AI Inference Worker**: Python standalone service (ONNX Runtime, OpenCV YuNet face detection, head-pose attention) in `/backend/inference`
- **Orchestration**: Docker Compose

---

## Core Telemetry Loop

1. **Student Camera Ingestion**:
   - Students navigate to the `/student` portal and must grant **explicit camera & privacy consent**.
   - Student browser sends webcam frames (at most 640 px wide) at 1–2 fps over WebSocket `ws://backend/ws/student/{session_id}/`.
2. **AI Inference & Gaze Tracking**:
   - The backend runs the inference engine in-process: YuNet finds the face, the YOLO11m expression ensemble (ONNX Runtime) classifies it, and attention (0.0 to 1.0) is computed from head pose using the face landmarks. Frames without a face produce no data. The standalone worker in `backend/inference` is the same code for scaling inference out via Redis.
   - **Privacy Guarantee**: No raw video is stored on disk or in the database.
3. **Smoothing & Aggregation**:
   - Telemetries are smoothed over a 10-second rolling window (`Prediction` records).
   - Class-wide metrics are aggregated every 2–5 seconds into `SessionSnapshot` rows.
4. **Real-time Instructor Push**:
   - Broadcast to instructors over `ws://backend/ws/instructor/{session_id}/` via:
     - `student.update`: individual student emotion & attention changes.
     - `session.snapshot`: class percentages, distribution counts, concentration curve.
     - `suggestion.new`: pedagogical AI teaching interventions.
     - `presence`: online/offline status.
     - `model.status`: AI model heartbeat & latency (ms).

---

## Quickstart with Docker Compose

Run the entire platform (PostgreSQL, Redis, Django Channels backend, Celery worker/beat, Inference worker, Next.js frontend) with a single command:

```bash
docker-compose up --build
```

### Services & Endpoints
- **Instructor Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Student Webcam Portal**: [http://localhost:3000/student](http://localhost:3000/student)
- **Backend API & Admin**: [http://localhost:8000](http://localhost:8000)
- **Instructor sign-in**: [http://localhost:3000/login](http://localhost:3000/login)
- **Django Admin**: [http://localhost:8000/admin/](http://localhost:8000/admin/)

### First-time setup (real data)
No demo data is created. Set up your own accounts and classes:

```bash
docker compose exec backend python manage.py createsuperuser
```

Then in the Django admin:
1. **Users**: add the instructor (role `instructor`) and each student (role `student`).
2. **Courses**: enroll the students in a course (inline at the bottom).

An instructor without a session gets a setup screen on the dashboard to create a course and start a
live session.

### Sign-in and roles
Everyone uses the same page, `/login`, and is sent to the right place by role:

| Role | Lands on | Can |
| --- | --- | --- |
| `admin` (any superuser) | Dashboard | See and run every course and session |
| `instructor` | Dashboard | Create/run sessions for their own courses |
| `student` | `/student` | Stream their own webcam to the live session of a course they're enrolled in |

The guest portal (pick a name from the roster, no account) is only available while `ALLOW_GUEST_STUDENTS`
is on (defaults to `DEBUG`).

### Monitoring an online class (Meet / Zoom / Teams)
In **Live Monitoring** (or *Monitor screen* in the dashboard ribbon), share the meeting window in gallery
view. About once a second a frame goes to the server, which detects every face (up to 49), classifies it
and tracks it as an anonymous **Screen face N** tile. These faces count in the class statistics, suggestions
and reports. Faces are numbered by position, so a gallery reshuffle can renumber them. Tell participants
their video is being analysed.

Upgrading from an older version that ran `seed_data`? Remove the demo accounts, course and analytics with
`python manage.py purge_demo_data` (lists them) and `python manage.py purge_demo_data --yes` (deletes them).
Migration `analytics.0003` already deletes all simulated predictions.

---

## Local Development (Without Docker)

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # On Windows
# source venv/bin/activate     # On Linux/Mac

pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # then add users, courses and sessions in /admin (see above)
python manage.py runserver 127.0.0.1:8000   # Daphne ASGI (HTTP + WebSockets)
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and sign in with your instructor account.

No Redis, Postgres or Celery is needed locally: the backend falls back to SQLite and an in-memory
channel layer, and aggregates snapshots inside the ASGI process.

### Student webcams
- All telemetry comes from real webcams. Students who are not streaming show *No data*.
- Open [http://localhost:3000/student](http://localhost:3000/student), pick a name, grant consent and start
  the webcam: frames go through the inference engine.
- `ALLOW_GUEST_STUDENTS` (defaults to `DEBUG`) controls the open student portal; turn it off in production
  and require student logins.

---

## AI Models

`backend/inference/models/` holds:

| File | Purpose |
| --- | --- |
| `yolo_face_expression_ensemble.onnx` | 5-fold YOLO11m expression classifier, input `[N,3,256,256]` RGB 0-1, output probabilities |
| `face_detection_yunet_2023mar.onnx` | YuNet face detector (OpenCV `FaceDetectorYN`) |
| `deployment_metadata.json` | Classes, image size, face margin and detector file name used by the loader |

Pipeline (`backend/inference/model_loader.py`): detect the largest face, grow the box by `face_margin`,
resize the short side to `image_size`, centre crop, classify. The six expressions are grouped for the
dashboard as **positive** (happy, surprise), **neutral**, and **negative** (angry, fear, sad). Attention
comes from head yaw/pitch measured on the YuNet landmarks (`gaze_tracker.py`).

The engine rescans this directory every few seconds, so replaced model files are picked up without a
restart. If a model file is missing, no emotion or attention data is produced at all.

---

## Running Verification Tests

```bash
cd backend
python manage.py test apps
```
Tests verify:
- JWT auth in httpOnly cookies
- Mandatory student consent before capture
- Strict instructor course isolation
- No raw video persistence
- 10-second rolling window smoothing
- WebSocket auth (instructor-only dashboard socket, student consent gate, frame ingestion)
- Per-instructor isolation of analytics, reports and session start/end

