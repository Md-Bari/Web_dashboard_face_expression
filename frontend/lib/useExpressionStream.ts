'use client';

import { useEffect, useRef, useState } from 'react';
import { wsBase } from './config';
import type { EmotionType } from './emotions';

const FRAME_INTERVAL_MS = 350; // ~2.8 fps for responsive detection
const HEARTBEAT_MS = 10_000; // "still in the class" while no frames are sent (camera off)
const MAX_FRAME_WIDTH = 480;

export interface ExpressionState {
  status: 'off' | 'connecting' | 'on' | 'error';
  emotion: EmotionType | null;
  message: string | null;
}

const OFF: ExpressionState = { status: 'off', emotion: null, message: null };

/**
 * A student in the class meeting stays connected to the analysis socket for the whole meeting,
 * so the instructor sees them as present even without a camera. While their camera is on
 * (`track`, the camera already published to the meeting), a frame at most 640 px wide is sent
 * about every 0.7 s; with the camera off nothing is sent. Frames are analysed in server memory only.
 */
export function useExpressionStream(sessionId: number | null, track: MediaStreamTrack | null): ExpressionState {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reading, setReading] = useState<{ emotion: EmotionType | null; message: string | null; error: boolean }>({
    emotion: null,
    message: null,
    error: false,
  });

  // The socket: open for the whole meeting
  useEffect(() => {
    if (sessionId === null) return;
    let disposed = false;
    const ws = new WebSocket(`${wsBase()}/ws/student/${sessionId}/?consent=1`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      if (disposed) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ready') setConnected(true);
        else if (data.type === 'telemetry') setReading({ emotion: data.emotion, message: null, error: false });
        else if (data.type === 'face.missing' || data.type === 'model.missing')
          setReading((r) => ({ ...r, message: data.message }));
        else if (data.type === 'error') setReading({ emotion: null, message: data.message, error: true });
      } catch {
        // ignore malformed messages
      }
    };
    ws.onclose = () => {
      if (!disposed) setConnected(false);
    };
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
    }, HEARTBEAT_MS);
    return () => {
      disposed = true;
      clearInterval(heartbeat);
      wsRef.current = null;
      ws.close();
      setConnected(false);
    };
  }, [sessionId]);

  // The frames: only while the camera is on
  useEffect(() => {
    if (!track || !connected) return;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    video.play().catch(() => undefined);
    const canvas = document.createElement('canvas');
    const timer = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || video.videoWidth === 0) return;
      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ws.send(JSON.stringify({ type: 'frame', image: canvas.toDataURL('image/jpeg', 0.7), timestamp: Date.now() }));
    }, FRAME_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      video.srcObject = null;
    };
  }, [track, connected]);

  if (sessionId === null) return OFF;
  if (reading.error) return { status: 'error', emotion: null, message: reading.message };
  if (!track) return OFF;
  if (!connected) return { status: 'connecting', emotion: null, message: null };
  return { status: 'on', emotion: reading.emotion, message: reading.message };
}
