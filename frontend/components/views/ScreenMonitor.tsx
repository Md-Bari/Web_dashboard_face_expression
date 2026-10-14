'use client';

import React, { useEffect, useRef } from 'react';
import { Camera, MonitorUp, MonitorX, ShieldAlert } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { onScreenStream, startCapture, stopScreenCapture } from '@/lib/screenCapture';
import { emotionMeta } from '@/lib/emotions';
import { Card } from './ui';


/** Start/stop controls for classroom capture (shared screen or camera); used in the ribbon and Live Monitoring. */
export function ScreenShareButton({ compact = false }: { compact?: boolean }) {
  const { screen, connection, session } = useDashboardStore();
  const disabled = connection !== 'open' || session?.status !== 'LIVE';
  const button = 'inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50';

  if (screen.sharing) {
    return (
      <button onClick={stopScreenCapture} className={`${button} bg-rose-600 text-white hover:bg-rose-700`}>
        <MonitorX className="w-3.5 h-3.5" />
        {screen.source === 'camera' ? 'Stop camera' : compact ? 'Stop screen' : 'Stop screen monitoring'}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={() => startCapture('screen')}
        disabled={disabled}
        title={disabled ? 'Start the live session first' : 'Share a Meet / Zoom / Teams window'}
        className={`${button} bg-blue-600 text-white hover:bg-blue-700`}
      >
        <MonitorUp className="w-3.5 h-3.5" /> {compact ? 'Monitor screen' : 'Share meeting window'}
      </button>
      <button
        onClick={() => startCapture('camera')}
        disabled={disabled}
        title={disabled ? 'Start the live session first' : 'Use this device camera (e.g. pointed at the classroom)'}
        className={`${button} bg-white text-blue-700 border border-blue-200 hover:bg-blue-50`}
      >
        <Camera className="w-3.5 h-3.5" /> Use camera
      </button>
      {compact && screen.message && <span className="basis-full text-[11px] font-medium text-amber-700">{screen.message}</span>}
    </span>
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
      title="Class monitoring"
      subtitle="Analyse every face in a Google Meet / Zoom / Teams window (gallery view) or from a camera facing the class"
      action={<ScreenShareButton />}
    >
      <div className={`relative w-full bg-slate-900 rounded-xl overflow-hidden ${screen.sharing ? '' : 'hidden'}`}>
        <video ref={videoRef} muted playsInline className="w-full h-auto block" />
        {screen.faces.map((face) => {
          const [x, y, w, h] = face.box;
          const meta = emotionMeta(face.emotion);
          return (
            <div
              key={face.student_id}
              className="absolute border-2 rounded-md pointer-events-none"
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                borderColor: meta.color,
              }}
            >
              <span className="absolute -top-5 left-0 whitespace-nowrap text-[10px] font-bold text-white px-1 rounded bg-slate-900/85">
                #{-face.student_id} · {meta.label} · {Math.round(face.attention * 100)}%
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
            : 'Off. Each face found becomes a "Screen face N" tile and counts in the class statistics.'}
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
