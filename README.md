# EMP-EDU: AI-Powered Real-Time Class Analytics Platform

An AI-powered e-learning platform providing live emotional, attentional, and engagement telemetry for instructors during live lectures.

![EMP-EDU Dashboard](docs/dashboard-preview.png)

---

## Architecture Stack

- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Zustand) in `/frontend`
- **Backend**: Django 5 + Django REST Framework + Django Channels (Daphne ASGI) + Celery + Redis + PostgreSQL in `/backend`
- **AI Inference Worker**: Python standalone service (ONNX Runtime, OpenCV, PyGaze/MediaPipe gaze tracking) in `/backend/inference`
- **Orchestration**: Docker Compose

---

## Core Telemetry Loop

1. **Student Camera Ingestion**:
   - Students navigate to the `/student` portal and must grant **explicit camera & privacy consent**.
   - Student browser extracts 224x224 face crops at 1–2 fps over WebSocket `ws://backend/ws/student/{session_id}/`.
2. **AI Inference & Gaze Tracking**:
   - The backend runs the inference engine in-process (ONNX Runtime; custom YOLO/emotion model or adaptive fallback) and computes attention scores (0.0 to 1.0) simulating PyGaze. The standalone worker in `backend/inference` is the same code for scaling inference out via Redis.
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
- **Instructor sign-in**: [http://localhost:3000/login](http://localhost:3000/login) - `instructor` / `password123`
- **Django Admin Login**: `admin` / `password123`

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
python manage.py seed_data      # Seeds instructor Dr. Laohakangvalvit, 28 students, a LIVE session
python manage.py runserver 127.0.0.1:8000   # Daphne ASGI (HTTP + WebSockets)
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and sign in as `instructor` / `password123`.

No Redis, Postgres or Celery is needed locally: the backend falls back to SQLite and an in-memory
channel layer, and aggregates snapshots inside the ASGI process.

### Demo telemetry vs. real webcams
- Enrolled students who are **not** streaming get simulated telemetry (toggle: *Demo Telemetry* in the
  dashboard ribbon or Settings; env `DEMO_SIMULATION=False` to start with it off).
- Open [http://localhost:3000/student](http://localhost:3000/student), pick a name, grant consent and start
  the webcam: that student then uses real frames through the inference engine instead.
- `ALLOW_GUEST_STUDENTS` (defaults to `DEBUG`) controls the open student portal; turn it off in production
  and require student logins.

---

## Adding Your Custom YOLO ONNX Model

Place your trained model file into:
```
backend/inference/models/your_model.onnx
```
The engine rescans this directory every few seconds, so a model dropped in while the server runs is picked
up without a restart (Settings and the sidebar then show *Custom ONNX*). If none is present, it uses the
built-in adaptive telemetry engine. Input `[1,3,224,224]`, output 3 logits (positive, neutral, negative);
adjust `backend/inference/model_loader.py` if your YOLO head differs.

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

