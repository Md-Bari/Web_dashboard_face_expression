'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, MonitorUp, MonitorX, ShieldAlert, Tag, UserCheck } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { onScreenStream, startCapture, stopScreenCapture } from '@/lib/screenCapture';
import { emotionMeta } from '@/lib/emotions';
import type { ScreenFace } from '@/lib/types';
import { Avatar } from '@/components/dashboard/Avatar';
import { NameFaceDialog } from '@/components/dashboard/NameFaceDialog';
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

/** Live Monitoring card: shared-screen preview with the faces the server found and their names. */
export function ScreenMonitor() {
  const { screen } = useDashboardStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [namingId, setNamingId] = useState<number | null>(null);
  const naming: ScreenFace | undefined = screen.faces.find((f) => f.screen_id === namingId);
  const unnamed = screen.faces.filter((f) => !f.match).length;

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
              key={face.screen_id}
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
                {face.name} · {meta.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          {screen.sharing
            ? `${screen.faces.length} face${screen.faces.length === 1 ? '' : 's'} found${
                unnamed ? ` · ${unnamed} not named yet` : ''
              }${screen.latencyMs ? ` · ${screen.latencyMs} ms` : ''}`
            : "Off. Each real face found is matched to an enrolled student's tile by face recognition; faces it does not know get a \"Screen face N\" tile you can name."}
        </span>
        {screen.message && <span className="text-amber-600 font-medium">{screen.message}</span>}
      </div>

      {screen.sharing && screen.faces.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {screen.faces.map((face) => (
            <li key={face.screen_id}>
              <button
                onClick={() => setNamingId(face.screen_id)}
                title={face.match ? 'Change name' : 'Name this face'}
                className={`inline-flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${
                  face.match
                    ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                    : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <Avatar name={face.name} src={face.thumb ?? undefined} className="w-6 h-6 rounded-full text-[9px]" imgClassName="object-cover" />
                <span className="max-w-[9rem] truncate">{face.name}</span>
                {face.match ? (
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" aria-label={face.match === 'auto' ? 'recognised' : 'named by you'} />
                ) : (
                  <Tag className="w-3.5 h-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {screen.sharing && !screen.recognition && (
        <p className="mt-2 text-[11px] text-slate-500">
          Face recognition is off on the server (no face recogniser model), so faces are not named automatically.
          Click a face to name it.
        </p>
      )}

      {naming && (
        <NameFaceDialog
          screenId={naming.screen_id}
          currentName={naming.name}
          currentStudentId={naming.student_id > 0 ? naming.student_id : null}
          named={!!naming.match}
          thumb={naming.thumb ?? undefined}
          onClose={() => setNamingId(null)}
        />
      )}

      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-500">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        Tell participants their video is being analysed. Frames are processed in memory only; just the emotion
        label and attention score are stored - under the student&apos;s name when recognised, otherwise under an
        anonymous number.
      </p>
    </Card>
  );
}
