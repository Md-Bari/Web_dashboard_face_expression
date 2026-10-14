'use client';

import { useDashboardStore } from './store';
import { sendInstructorAction } from './websocket';
import type { ScreenFace } from './types';
import { describeMediaError, openCamera, openScreen, type MediaKind } from './media';

/**
 * Instructor capture: share a Google Meet / Zoom / Teams window (or any screen), or use a
 * camera pointed at the classroom, and send a downscaled frame about once a second over the
 * instructor socket. The server finds every face, analyses it and tracks it as an anonymous
 * "Screen face N".
 *
 * Lives outside React so sharing keeps running while the instructor switches dashboard tabs.
 * PRIVACY: frames are analysed in server memory only; face thumbnails are cropped here in the
 * browser for the tiles and never uploaded.
 */

const FRAME_INTERVAL_MS = 1000;
const MAX_FRAME_WIDTH = 1280;
const THUMB_SIZE = 112;

let stream: MediaStream | null = null;
let video: HTMLVideoElement | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const frameCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const thumbCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const listeners = new Set<(s: MediaStream | null) => void>();

const store = () => useDashboardStore.getState();

export function getScreenStream() {
  return stream;
}

/** Subscribe to the shared stream (for a preview <video>). Returns an unsubscribe function. */
export function onScreenStream(listener: (s: MediaStream | null) => void) {
  listeners.add(listener);
  listener(stream);
  return () => {
    listeners.delete(listener);
  };
}

export async function startCapture(source: MediaKind = 'screen') {
  if (stream) return;
  try {
    stream =
      source === 'camera'
        ? await openCamera({ width: { ideal: 1280 }, height: { ideal: 720 } })
        : await openScreen();
  } catch (err) {
    store().setScreen({ message: describeMediaError(err, source) });
    return;
  }
  video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.play().catch(() => undefined);
  // The browser's own "Stop sharing" button ends the track
  stream.getVideoTracks()[0]?.addEventListener('ended', stopScreenCapture);

  timer = setInterval(sendFrame, FRAME_INTERVAL_MS);
  store().setScreen({ sharing: true, source, faces: [], message: 'Looking for faces…' });
  listeners.forEach((l) => l(stream));
}

export function stopScreenCapture() {
  if (timer) clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) video.srcObject = null;
  video = null;
  store().setScreen({ sharing: false, source: null, faces: [], message: null, latencyMs: 0 });
  listeners.forEach((l) => l(null));
}

function sendFrame() {
  if (!video || !frameCanvas || video.videoWidth === 0) return;
  const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
  frameCanvas.width = Math.round(video.videoWidth * scale);
  frameCanvas.height = Math.round(video.videoHeight * scale);
  const ctx = frameCanvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
  if (!sendInstructorAction('screen_frame', { image: frameCanvas.toDataURL('image/jpeg', 0.75) })) {
    store().setScreen({ message: 'Waiting for the dashboard connection…' });
  }
}

function cropThumbnails(faces: ScreenFace[]) {
  const thumbs: Record<number, string> = {};
  if (!video || !thumbCanvas || video.videoWidth === 0) return thumbs;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  thumbCanvas.width = THUMB_SIZE;
  thumbCanvas.height = THUMB_SIZE;
  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) return thumbs;
  for (const face of faces) {
    const [x, y, w, h] = face.box;
    const side = Math.max(w * vw, h * vh) * 1.4;
    const cx = (x + w / 2) * vw;
    const cy = (y + h / 2) * vh;
    ctx.drawImage(video, cx - side / 2, cy - side / 2, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
    thumbs[face.student_id] = thumbCanvas.toDataURL('image/jpeg', 0.7);
  }
  return thumbs;
}

/** Called by the instructor socket for every `screen.result` message. */
export function handleScreenResult(result: {
  faces: ScreenFace[];
  latency_ms?: number;
  model_loaded?: boolean;
  error?: string;
}) {
  if (!stream) return;
  const faces = result.faces || [];
  let message: string | null = null;
  if (result.error) message = result.error;
  else if (result.model_loaded === false) message = 'No AI model is loaded on the server.';
  else if (!faces.length)
    message =
      store().screen.source === 'camera'
        ? 'No faces found. Point the camera at the class with good lighting.'
        : 'No faces found. Share the meeting window in gallery view.';
  store().setScreen({ faces, latencyMs: result.latency_ms ?? 0, message });
  if (faces.length) store().applyThumbnails(cropThumbnails(faces));
}
