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

Run the entire platform (PostgreSQL, Redis, Django Channels backend, Celery worker/beat, Inference worker, Next.js frontend, an nginx reverse proxy and a Cloudflare Tunnel) with a single command:

```bash
docker-compose up --build
```

Everything is served from one origin through **nginx** (`http://localhost:8080` by default). A
`cloudflared` service publishes that same origin at a random public `https://<name>.trycloudflare.com`
URL — read it from the tunnel logs:

```bash
docker compose logs cloudflared
```

Share that URL with students; it works from anywhere with no port forwarding. The URL changes each
time the `cloudflared` container restarts (quick tunnels are ephemeral).

### Services & Endpoints
- **Instructor Dashboard**: [http://localhost:8080](http://localhost:8080)
- **Student Webcam Portal**: [http://localhost:8080/student](http://localhost:8080/student)
- **Backend API & Admin**: [http://localhost:8080](http://localhost:8080) (or directly at [http://localhost:8000](http://localhost:8000))
- **Instructor sign-in**: [http://localhost:8080/login](http://localhost:8080/login)
- **Django Admin**: [http://localhost:8080/admin/](http://localhost:8080/admin/)
- **Public tunnel URL**: see `docker compose logs cloudflared`

> Behind the tunnel nginx routes `/api`, `/admin`, `/static` and `/ws` to Django and everything else
> to Next.js, so the browser only ever talks to one hostname. That keeps the JWT auth cookies
> same-site (no CORS) and lets Django recognise HTTPS via `X-Forwarded-Proto`.

### Going live (Cloudflare Tunnel)

The stack ships with a **quick tunnel** (`cloudflared` service, `command: tunnel --url http://nginx:80`).
It is the fastest way to get a public HTTPS URL, but the URL is random and rotates on restart. For a
stable hostname, either:

- **Pin a quick tunnel** by reading the URL each run: `docker compose logs cloudflared`.
- **Use a named tunnel** on your own domain instead of the quick tunnel: replace the `cloudflared`
  service with one that runs your named tunnel (e.g. `command: tunnel --no-autoupdate run --token <TOKEN>`
  or mount `~/.cloudflared` and a `config.yml` routing your hostname to `http://nginx:80`), then add
  `https://your.domain` to `CSRF_TRUSTED_ORIGINS` in `.env` and restart the backend.

Only `/api`, `/admin`, `/static` and `/ws` need to reach Django; the tunnel/nginx already handles that
for both quick and named tunnels.

### Binding to a different local port

Set `PUBLIC_PORT` in `.env` (defaults to `8080`) if that port is already in use on the host.



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
# Without Docker the backend is on a different origin, so point the app at it:
# create frontend/.env.local with:
#   NEXT_PUBLIC_API_URL=http://localhost:8000
#   NEXT_PUBLIC_WS_URL=ws://localhost:8000
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and sign in with your instructor account.
(No `.env.local` is needed with Docker Compose: nginx serves everything same-origin.)

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
resize the short side to `image_size`, centre crop, classify. The dashboard uses the model's six classes
directly - **Happy, Surprise, Neutral, Fear, Sad, Angry** - in tiles, the distribution donut, the trend,
filters, reports and CSV (defined once in `backend/apps/analytics/emotions.py` and `frontend/lib/emotions.ts`).
Teaching suggestions fire on sad + fear >= 20%, angry >= 15%, surprise >= 25%, neutral >= 50%, or low
attention. Attention comes from head yaw/pitch measured on the YuNet landmarks (`gaze_tracker.py`).

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

