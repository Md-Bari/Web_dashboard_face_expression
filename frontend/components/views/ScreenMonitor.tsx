'use client';

import React, { useEffect, useRef } from 'react';
import { MonitorUp, MonitorX, ShieldAlert } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { onScreenStream, startScreenCapture, stopScreenCapture } from '@/lib/screenCapture';
import { Card } from './ui';

const BOX_COLOR = {
  positive: 'border-emerald-400 bg-emerald-500',
  neutral: 'border-amber-400 bg-amber-500',
  negative: 'border-rose-400 bg-rose-500',
} as const;

/** Toggle for screen capture; usable anywhere (dashboard ribbon, Live Monitoring). */
export function ScreenShareButton({ compact = false }: { compact?: boolean }) {
  const { screen, connection, session } = useDashboardStore();
  const disabled = connection !== 'open' || session?.status !== 'LIVE';
  return screen.sharing ? (
    <button
      onClick={stopScreenCapture}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
    >
      <MonitorX className="w-3.5 h-3.5" /> {compact ? 'Stop screen' : 'Stop screen monitoring'}
    </button>
  ) : (
    <button
      onClick={startScreenCapture}
      disabled={disabled}
      title={disabled ? 'Start the live session first' : 'Share a Meet / Zoom / Teams window'}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
    >
      <MonitorUp className="w-3.5 h-3.5" /> {compact ? 'Monitor screen' : 'Monitor a meeting window'}
    </button>
  );
}

/** Live Monitoring card: shared-screen preview with the faces the server found. */
export function ScreenMonitor() {
  const { screen } = useDashboardStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(
    () =>
      onScreenStream((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          if (stream) videoRef.current.play().catch(() => undefined);
        }
      }),
    []
  );

  return (
    <Card
      title="Screen monitoring"
      subtitle="Analyse every face in a Google Meet, Zoom or Teams window (use gallery view)"
      action={<ScreenShareButton />}
    >
      <div className={`relative w-full bg-slate-900 rounded-xl overflow-hidden ${screen.sharing ? '' : 'hidden'}`}>
        <video ref={videoRef} muted playsInline className="w-full h-auto block" />
        {screen.faces.map((face) => {
          const [x, y, w, h] = face.box;
          const color = BOX_COLOR[face.emotion];
          return (
            <div
              key={face.student_id}
              className={`absolute border-2 rounded-md pointer-events-none ${color.split(' ')[0]}`}
              style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
            >
              <span
                className={`absolute -top-5 left-0 whitespace-nowrap text-[10px] font-bold text-white px-1 rounded ${color.split(' ')[1]}`}
              >
                #{-face.student_id} · {face.emotion} · {Math.round(face.attention * 100)}%
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          {screen.sharing
            ? `${screen.faces.length} face${screen.faces.length === 1 ? '' : 's'} detected${
                screen.latencyMs ? ` · ${screen.latencyMs} ms` : ''
              }`
            : 'Not sharing. Faces appear as "Screen face N" tiles and count in the class statistics.'}
        </span>
        {screen.message && <span className="text-amber-600 font-medium">{screen.message}</span>}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-500">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        Tell participants their video is being analysed. Frames are processed in memory only; just the emotion
        label and attention score are stored, under an anonymous number.
      </p>
    </Card>
  );
}
