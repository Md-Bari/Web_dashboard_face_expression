# EMP-EDU: Real-Time Class Analytics & Emotion Detection System
## Full Implementation & Execution Plan

---

## 1. System Overview & Architecture

**EMP-EDU** is an AI-powered e-learning platform providing real-time emotional, cognitive, and engagement telemetry to instructors during live virtual classes.

```
+---------------------------------------------------------------------------------------+
|                                    STUDENT BROWSER                                    |
|  - Consent Modal (Strict privacy & camera permission)                                 |
|  - 224x224 Face extraction canvas (1-2 FPS)                                           |
|  - WebSocket Client -> ws://backend/ws/student/{session_id}/                          |
+------------------------------------------+--------------------------------------------+
                                           | (Base64 JPEG / Binary Frame)
                                           v
+---------------------------------------------------------------------------------------+
|                                  DJANGO CHANNELS                                      |
|  - StudentConsumer validates JWT & Consent                                            |
|  - Pushes frame payload to Redis queue (`inference_tasks`)                            |
+------------------------------------------+--------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                          PYTHON INFERENCE WORKER (/backend/inference)                 |
|  - MediaPipe / OpenCV Face & Gaze Tracking (PyGaze attention score 0.0 - 1.0)        |
|  - ONNX Runtime YOLO / Emotion Model (Positive / Neutral / Negative)                 |
|  - Fallback / Mock Inference Mode when custom ONNX file is not yet mounted            |
|  - Emits result to Redis channel: `session_{id}_predictions`                          |
+------------------------------------------+--------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                         SMOOTHING & AGGREGATION ENGINE (Celery/Redis)                 |
|  - 10-second rolling window smoothing for emotion & attention                         |
|  - Saves `Prediction` records in PostgreSQL                                           |
|  - Aggregates metrics every 2-5 seconds into `SessionSnapshot`                        |
|  - Rule-based AI Teaching Suggestions engine generates contextual interventions        |
|  - Dispatches events to Instructor Group: `session_{session_id}`                      |
+------------------------------------------+--------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                                   INSTRUCTOR DASHBOARD                                |
|  - WebSocket Client <- ws://backend/ws/instructor/{session_id}/                       |
|  - Real-Time Events:                                                                  |
|      * `student.update`       (individual student emotion/attention updates)         |
|      * `session.snapshot`     (class-wide aggregates, percentages, charts)           |
|      * `suggestion.new`       (dynamic teaching suggestions)                         |
|      * `presence`             (online/offline state of 28+ students)                 |
|      * `model.status`         (AI engine status: Active/Latency ms)                  |
|  - Next.js (Tailwind, Lucide, Recharts, Zustand, TanStack Query)                      |
+---------------------------------------------------------------------------------------+
```

---

## 2. Technology Stack & Directory Structure

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Lucide React, Recharts, TanStack Query, Zustand, Canvas API |
| **Backend** | Python 3.12+, Django 5.x, Django REST Framework, Django Channels (Daphne), Celery, Redis, PostgreSQL |
| **Inference** | ONNX Runtime, OpenCV (`opencv-python-headless`), MediaPipe, NumPy |
| **DevOps** | Docker, Docker Compose, Daphne ASGI server, Gunicorn/Uvicorn |

### Directory Layout
```
Web_dashboard/
|-- EXECUTION_PLAN.md
|-- docker-compose.yml
|-- .env.example
|-- backend/
|   |-- Dockerfile
|   |-- requirements.txt
|   |-- manage.py
|   |-- config/
|   |   |-- __init__.py
|   |   |-- asgi.py
|   |   |-- wsgi.py
|   |   |-- urls.py
|   |   |-- settings.py
|   |-- apps/
|   |   |-- accounts/          # User, Instructor, Student models, JWT cookie auth
|   |   |-- courses/           # Course, Enrollment, ClassSession models & views
|   |   |-- analytics/         # Prediction, SessionSnapshot, Suggestions, Consumers
|   |       |-- consumers.py   # StudentConsumer & InstructorConsumer
|   |       |-- routing.py     # Channels routing
|   |       |-- tasks.py       # Celery periodic aggregators & smoothing
|   |       |-- services.py    # Suggestion engine, aggregation calculations
|   |-- inference/
|       |-- Dockerfile
|       |-- requirements.txt
|       |-- worker.py          # Redis consumer & inference dispatcher
|       |-- model_loader.py    # ONNX runtime handler with custom model hook
|       |-- gaze_tracker.py    # PyGaze/MediaPipe gaze & attention calculator
|       |-- models/            # Placeholder for user's YOLO/ONNX model file
|-- frontend/
|   |-- Dockerfile
|   |-- package.json
|   |-- tsconfig.json
|   |-- app/
|   |   |-- layout.tsx
|   |   |-- globals.css
|   |   |-- page.tsx           # Instructor Analytics Dashboard (Exact UI Match)
|   |   |-- student/
|   |   |   |-- page.tsx       # Student Join & Webcam Stream Portal with Consent
|   |-- components/
|   |   |-- dashboard/
|   |   |   |-- Header.tsx     # Session info, instructor profile, live pill
|   |   |   |-- Sidebar.tsx    # EMP-EDU brand, nav items, AI Model status card
|   |   |   |-- MetricCard.tsx # KPI summary cards (Total, Positive, Neutral, etc.)
|   |   |   |-- StudentGrid.tsx# 28 student video tiles with sentiment pills
|   |   |   |-- StudentCard.tsx# Individual webcam avatar & status tag
|   |   |   |-- SentimentDonut.tsx # Recharts Donut chart + legend counts
|   |   |   |-- ConcentrationChart.tsx # Recharts Line chart + Radial score gauge
|   |   |   |-- TeachingSuggestions.tsx # Contextual action cards
|   |   |-- student/
|   |   |   |-- ConsentModal.tsx
|   |   |   |-- VideoCapture.tsx
|   |-- lib/
|   |   |-- api.ts             # Axios / Fetch client with credentials
|   |   |-- store.ts           # Zustand global state (live students, metrics)
|   |   |-- websocket.ts       # Resilient WS client with reconnection logic
|   |   |-- types.ts           # TypeScript interfaces for all WS payloads & models
```

---

## 3. Data Models & Database Schema

### `accounts.User`
- Standard Django AbstractUser.
- `role`: `INSTRUCTOR` | `STUDENT` | `ADMIN`
- `avatar_url`: string

### `courses.Course`
- `instructor`: ForeignKey(User, related_name="courses")
- `title`: string (e.g. "Data Structures")
- `code`: string (e.g. "CS201")
- `created_at`: datetime

### `courses.ClassSession`
- `course`: ForeignKey(Course, related_name="sessions")
- `title`: string (e.g. "Data Structures - Lecture 5")
- `status`: `SCHEDULED` | `LIVE` | `ENDED`
- `started_at`: datetime
- `ended_at`: datetime

### `analytics.Prediction`
- `session`: ForeignKey(ClassSession)
- `student`: ForeignKey(User)
- `timestamp`: datetime
- `raw_emotion`: `positive` | `neutral` | `negative`
- `confidence`: float (0.0 - 1.0)
- `raw_attention`: float (0.0 - 1.0)
- `smoothed_emotion`: `positive` | `neutral` | `negative`
- `smoothed_attention`: float (0.0 - 1.0)

### `analytics.SessionSnapshot`
- `session`: ForeignKey(ClassSession)
- `timestamp`: datetime
- `total_students`: int
- `positive_count`: int
- `positive_pct`: float
- `neutral_count`: int
- `neutral_pct`: float
- `negative_count`: int
- `negative_pct`: float
- `avg_concentration`: float (0.0 - 100.0)
- `low_concentration_count`: int

### `analytics.TeachingSuggestion`
- `session`: ForeignKey(ClassSession)
- `title`: string ("Consider adding more examples")
- `description`: string
- `type`: `CONFUSION` | `ENGAGEMENT` | `FATIGUE` | `PARTICIPATION`
- `created_at`: datetime
- `is_dismissed`: boolean

---

## 4. API & WebSocket Contracts

### Authentication Endpoints (JWT in httpOnly cookies)
- `POST /api/auth/login/`: `{ email, password }` -> sets `access_token`, `refresh_token` httpOnly cookies.
- `POST /api/auth/refresh/`: refreshes access token cookie.
- `POST /api/auth/logout/`: clears cookies.
- `GET /api/auth/me/`: returns current user profile (`id`, `name`, `email`, `role`, `avatar`).

### Course & Session Endpoints
- `GET /api/sessions/current/`: returns active session for instructor (with preloaded student roster).
- `POST /api/sessions/{id}/end/`: ends the session and finalizes report.
- `GET /api/sessions/{id}/history/`: historical snapshot series for charts.

### Student WebSocket (`ws/student/{session_id}/`)
- Client sends every 500-1000ms:
```json
{
  "type": "frame",
  "timestamp": 1716545700000,
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

### Instructor WebSocket (`ws/instructor/{session_id}/`)
- Server pushes:
1. **`presence`**:
   ```json
   {
     "type": "presence",
     "student_id": 1,
     "student_name": "Alice",
     "online": true
   }
   ```
2. **`student.update`**:
   ```json
   {
     "type": "student.update",
     "student_id": 1,
     "name": "Alice",
     "emotion": "positive",
     "smoothed_emotion": "positive",
     "attention": 0.88,
     "confidence": 0.94,
     "timestamp": 1716545701000
   }
   ```
3. **`session.snapshot`** (Every 2-5s):
   ```json
   {
     "type": "session.snapshot",
     "total_students": 28,
     "positive_pct": 57,
     "positive_count": 16,
     "neutral_pct": 28,
     "neutral_count": 8,
     "negative_pct": 15,
     "negative_count": 4,
     "avg_concentration": 72,
     "low_concentration_count": 3,
     "timeline": [
       { "time": "09:30", "concentration": 82 },
       { "time": "09:45", "concentration": 68 },
       { "time": "10:00", "concentration": 75 },
       { "time": "10:15", "concentration": 72 }
     ]
   }
   ```
4. **`suggestion.new`**:
   ```json
   {
     "type": "suggestion.new",
     "id": 101,
     "icon": "book",
     "title": "Consider adding more examples",
     "subtitle": "15% of students look confused. Adding practical examples may help."
   }
   ```
5. **`model.status`**:
   ```json
   {
     "type": "model.status",
     "status": "Active",
     "model_name": "YOLO-Emotion-v8 ONNX",
     "latency_ms": 38
   }
   ```

---

## 5. UI/UX Specifications (Matching the Reference Image)

1. **Header**:
   - Branding: Blue mortarboard icon + **EMP-EDU** / AI-Powered E-learning
   - Title: "Welcome, Instructor 👋" / "Real-time Class Analytics Dashboard"
   - Session Badge: "Data Structures - Lecture 5" with green pulsing `• LIVE` badge
   - Time Card: Clock icon "10:15 AM", "May 24, 2024"
   - Profile: Avatar, "Dr. Laohakangvalvit", "Instructor"
2. **Left Navigation**:
   - Items: Dashboard (Active), Live Monitoring, Students, Sentiment Analysis, Eye Tracking, AI Insights, Teaching Suggestions, Reports, Settings
   - AI Model Card: Brain/chip icon, "AI Model", green dot `• Status: Active`
   - Bottom Button: Red "End Session" with log-out icon
3. **Top 5 KPI Metric Cards**:
   - **Total Students**: `28` (Blue, `• Online`)
   - **Positive**: `57% ↑` (Green, `16`)
   - **Neutral**: `28%` (Yellow, `8`)
   - **Negative**: `15% ↓` (Red, `4`)
   - **Avg. Concentration**: `72%` (Purple target icon, `Good` badge)
4. **Main Student Video Grid**:
   - 28 student tiles (Alice, Bob, Charlie, Diana, Ethan, Fiona, George, Hannah, Ian, Jane, Kevin, Laura, Michael, Natapong, etc.)
   - Each card displays: student index badge (1..28), photo/webcam, student name, and emotion pill (🟢 Positive, 🟡 Neutral, 🔴 Negative)
   - Filter dropdown: "All Students", Positive, Neutral, Negative
   - Grid/List toggle controls
   - Legend bar: Positive (Happy, Engaged), Neutral (Calm, Indifferent), Negative (Confused, Bored, Frustrated)
5. **Right Analytics Column**:
   - **Sentiment Distribution**: Custom Donut Chart (57% green, 28% yellow, 15% red) with breakdown counts
   - **Concentration Overview**: Smooth line chart with timeline points + 72% Average circular progress ring + "3 Students Low Concentration" alert + "View Details" button
6. **AI Teaching Suggestions Bar**:
   - 4 interactive suggestion cards with custom icons and action arrows
   - "View All Suggestions" button
   - Footer compliance note: "ⓘ System uses deep learning for sentiment classification, PyGaze for eye tracking, and XAI for model interpretability."

---

## 6. Phased Implementation Roadmap

- [ ] **Phase 1: Project Skeleton & Docker Setup**
  - Configure `docker-compose.yml` (PostgreSQL, Redis, Daphne Backend, Inference Worker, Frontend).
  - Configure Django settings, ASGI routing, Channels channel layer with Redis.
- [ ] **Phase 2: Backend Architecture & Auth**
  - Implement `accounts` app (Custom User, JWT cookie auth, role-based permissions).
  - Implement `courses` app (`Course`, `ClassSession` models, seed data for 28 students).
  - Implement `analytics` app (`Prediction`, `SessionSnapshot`, `TeachingSuggestion` models).
- [ ] **Phase 3: Real-Time Channels & Inference Worker**
  - Build `StudentConsumer` for camera frame ingestion.
  - Build `InstructorConsumer` for real-time telemetry streaming.
  - Implement `/backend/inference` worker with ONNX Runtime loader, PyGaze attention calculator, and seamless drop-in hook for user's ONNX YOLO model.
  - Implement sliding-window smoothing (10s) and aggregation tasks (2-5s snapshots).
- [ ] **Phase 4: Frontend High-Fidelity Dashboard**
  - Setup Lucide React icons, Recharts, TanStack Query, Zustand store.
  - Build pixel-perfect EMP-EDU dashboard components exactly matching the reference design.
  - Build live interactive WebSocket listener for instantaneous updates.
  - Build mock/live student simulation mode so the dashboard runs with live dynamic telemetries out of the box.
- [ ] **Phase 5: Student Webcam Capture Portal & Consent Flow**
  - Implement `/student` page with explicit GDPR/privacy camera consent modal.
  - Client-side 224x224 canvas extraction at 1-2 FPS streaming to `ws/student/{session_id}/`.
- [ ] **Phase 6: Verification, Testing & Documentation**
  - End-to-end testing of WebSocket connections and REST endpoints.
  - Verification checklist and guide for mounting the user's custom ONNX model.

