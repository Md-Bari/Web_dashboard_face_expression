'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Video,
  VideoOff,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Radio,
  ArrowLeft,
  GraduationCap,
  Loader2,
  LogOut,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLogout } from '@/lib/useLogout';
import { wsBase } from '@/lib/config';
import { Avatar } from '@/components/dashboard/Avatar';
import { emotionMeta, type EmotionType } from '@/lib/emotions';

type WsStatus = 'disconnected' | 'connecting' | 'connected';
interface RosterStudent {
  id: number;
  name: string;
  avatar_url: string;
}
interface LiveInfo {
  id: number;
  title: string;
  course: string;
  students: RosterStudent[];
}
interface Telemetry {
  emotion: EmotionType;
  attention: number;
  confidence: number;
  latency_ms: number;
  model_name: string;
}

const FRAME_INTERVAL_MS = 660; // ~1.5 fps
const MAX_FRAME_WIDTH = 640;

export default function StudentPortal() {
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [consented, setConsented] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [account, setAccount] = useState(false);
  const router = useRouter();
  const { logout, loggingOut } = useLogout();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framesSentRef = useRef(0);

  const student = live?.students.find((s) => s.id === studentId) ?? null;

  // A signed-in student joins as themselves; instructors/admins belong on the dashboard;
  // without an account the open guest roster is used when the server allows it.
  useEffect(() => {
    const NO_LIVE = 'No live class session right now. Ask your instructor to start the session.';
    (async () => {
      try {
        const me = await api.me();
        if (me.role !== 'student') {
          router.replace('/');
          return;
        }
        setAccount(true);
        try {
          const current = await api.currentSession();
          if (current.status !== 'LIVE') throw new ApiError(404, NO_LIVE);
          setLive({
            id: current.id,
            title: current.title,
            course: current.course.title,
            students: [{ id: me.id, name: me.name, avatar_url: me.avatar_url }],
          });
          setStudentId(me.id);
        } catch {
          setLoadError(NO_LIVE);
        }
        return;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) {
          setLoadError('Cannot reach the class server.');
          return;
        }
      }
      try {
        const info = await api.publicLiveSession();
        setLive(info);
        setStudentId(info.students[0]?.id ?? null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) router.replace('/login'); // guest access disabled
        else setLoadError(NO_LIVE);
      }
    })();
  }, [router]);

  useEffect(() => {
    const t = setInterval(() => {
      setFps(framesSentRef.current);
      framesSentRef.current = 0;
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const releaseCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  }, []);

  const handleStop = useCallback(
    (revoke = false) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (revoke) ws.send(JSON.stringify({ type: 'consent.revoke' }));
        ws.close();
      }
      wsRef.current = null;
      releaseCamera();
      setIsStreaming(false);
      setWsStatus('disconnected');
      setTelemetry(null);
      if (revoke) {
        setConsented(false);
        setMessage('Consent revoked. Your camera is off and no more data is sent.');
      }
    },
    [releaseCamera]
  );

  useEffect(() => () => handleStop(), [handleStop]);

  // Send the whole frame (at most 640 px wide); the server detects and crops the face itself
  const captureAndSend = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ws = wsRef.current;
    if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN || video.videoWidth === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    ws.send(JSON.stringify({ type: 'frame', image: canvas.toDataURL('image/jpeg', 0.85), timestamp: Date.now() }));
    framesSentRef.current += 1;
  }, []);

  const handleStart = async () => {
    if (!live || studentId === null) return;
    setMessage(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      setMessage(`Could not start the camera: ${err instanceof Error ? err.message : 'permission denied.'}`);
      return;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      // Not awaited: play() can stay pending while the element is hidden, which must not block the connection
      videoRef.current.play().catch(() => undefined);
    }

    setWsStatus('connecting');
    // Signed-in students are identified by their auth cookie; guests name a roster entry
    const query = account ? 'consent=1' : `student_id=${studentId}&consent=1`;
    const ws = new WebSocket(`${wsBase()}/ws/student/${live.id}/?${query}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ready') {
          setWsStatus('connected');
          setIsStreaming(true);
          timerRef.current = setInterval(captureAndSend, FRAME_INTERVAL_MS);
        } else if (data.type === 'telemetry') {
          setTelemetry(data);
          setMessage(null);
        } else if (data.type === 'model.missing' || data.type === 'face.missing') {
          setMessage(data.message);
        } else if (data.type === 'error') {
          setMessage(data.message);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        releaseCamera();
        setIsStreaming(false);
        setWsStatus('disconnected');
      }
    };
    ws.onerror = () => setMessage('Could not reach the class server.');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
        <div className="flex items-center gap-3">
          {account ? (
            <button
              onClick={() => {
                handleStop();
                logout();
              }}
              disabled={loggingOut}
              className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </Link>
          )}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <GraduationCap className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-white text-sm">EMP-EDU Student Portal</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              wsStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : wsStatus === 'connecting' ? 'bg-amber-400' : 'bg-rose-500'
            }`}
          ></span>
          <span className="text-xs font-medium text-slate-400 capitalize">
            {wsStatus === 'connected' ? 'Live Telemetry Active' : wsStatus}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col items-center justify-center">
        {loadError ? (
          <div className="flex items-center gap-2 text-sm text-slate-300 bg-slate-950 border border-slate-800 rounded-2xl p-6 max-w-md">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            {loadError}
          </div>
        ) : !live ? (
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        ) : !consented ? (
          /* Consent screen */
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Student Privacy & Camera Consent</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              To assist your instructor with lecture pacing and comprehension, EMP-EDU computes real-time engagement
              telemetry from your webcam.
            </p>

            <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80 mb-6 text-xs">
              {[
                ['Zero Raw Video Storage:', 'No video or audio is ever recorded, downloaded, or stored to disk.'],
                ['In-Memory Processing:', 'Frames are downscaled to at most 640px wide and processed exclusively in volatile memory.'],
                ['Right to Revoke:', 'You can stop your camera stream and withdraw consent at any point during class.'],
              ].map(([title, body]) => (
                <div key={title} className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-slate-300">
                    <strong>{title}</strong> {body}
                  </span>
                </div>
              ))}
            </div>

            {account ? (
              <div className="mb-6 flex items-center gap-3 text-xs text-slate-300">
                {student && (
                  <Avatar name={student.name} src={student.avatar_url} className="w-10 h-10 rounded-full text-xs" imgClassName="object-cover" />
                )}
                <span>
                  Joining <b className="text-white">{live.course}</b> as <b className="text-white">{student?.name}</b>
                </span>
              </div>
            ) : (
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Join {live.course} as:
              </label>
              <div className="flex items-center gap-3">
                {student && (
                  <Avatar name={student.name} src={student.avatar_url} className="w-10 h-10 rounded-full text-xs" imgClassName="object-cover" />
                )}
                <select
                  value={studentId ?? ''}
                  onChange={(e) => setStudentId(Number(e.target.value))}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500"
                >
                  {live.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            )}

            <button
              onClick={() => setConsented(true)}
              disabled={studentId === null}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              I Understand & Grant Consent
            </button>
            {message && <p className="mt-3 text-xs text-emerald-400">{message}</p>}
          </div>
        ) : (
          /* Live stream */
          <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">Class Session: {live.title}</h2>
                <p className="text-xs text-slate-400">Student: {student?.name}</p>
              </div>
              {isStreaming && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-semibold text-emerald-400">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>{fps} frames/s</span>
                </div>
              )}
            </div>

            <div className="relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover -scale-x-100 ${!isStreaming && wsStatus !== 'connecting' ? 'hidden' : ''}`}
              />
              {!isStreaming && wsStatus !== 'connecting' && (
                <div className="flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                  <VideoOff className="w-12 h-12 mb-2 text-slate-600" />
                  <p className="text-sm font-semibold">Webcam currently stopped</p>
                  <p className="text-xs text-slate-600 max-w-xs mt-1">
                    Click &ldquo;Start Webcam Stream&rdquo; to connect to the lecture session.
                  </p>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />

              {isStreaming && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-56 rounded-full border-2 border-dashed border-blue-400/50 flex items-end justify-center pb-2">
                    <span className="text-[10px] text-blue-300/80 bg-black/60 px-2 py-0.5 rounded-full">Keep your face inside the guide</span>
                  </div>
                </div>
              )}
            </div>

            {/* What the instructor sees about you (real server response) */}
            {isStreaming && (
              <div className="mt-4 w-full grid grid-cols-3 gap-2 text-center text-xs">
                <div
                  className="rounded-xl border border-slate-800 p-2.5"
                  style={telemetry ? { borderColor: emotionMeta(telemetry.emotion).color } : undefined}
                >
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Expression</p>
                  <p className="font-bold mt-0.5 text-white">{telemetry ? emotionMeta(telemetry.emotion).label : '…'}</p>
                </div>
                <div className="rounded-xl border border-slate-800 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Attention</p>
                  <p className="font-bold text-white mt-0.5">{telemetry ? `${Math.round(telemetry.attention * 100)}%` : '…'}</p>
                </div>
                <div className="rounded-xl border border-slate-800 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Latency</p>
                  <p className="font-bold text-white mt-0.5">{telemetry ? `${telemetry.latency_ms} ms` : '…'}</p>
                </div>
              </div>
            )}

            <div className="w-full mt-5 flex gap-3">
              {!isStreaming ? (
                <button
                  onClick={handleStart}
                  disabled={wsStatus === 'connecting'}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {wsStatus === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  <span>Start Webcam Stream</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleStop(false)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm rounded-xl transition-all active:scale-[0.98]"
                  >
                    <VideoOff className="w-4 h-4" />
                    <span>Pause Stream</span>
                  </button>
                  <button
                    onClick={() => handleStop(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/30 transition-all active:scale-[0.98]"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Stop & Revoke Consent</span>
                  </button>
                </>
              )}
            </div>

            {message && (
              <p className="mt-3 w-full text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">{message}</p>
            )}

            <div className="mt-4 w-full bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Streaming camera frames to <code className="text-blue-400">ws/student/{live.id}/</code>. Only the emotion label and attention
                score are kept - zero video recorded.
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
