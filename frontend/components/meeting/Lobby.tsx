'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { describeMediaError, openCamera } from '@/lib/media';

interface LobbyProps {
  name: string;
  joinLabel: string;
  busy?: boolean;
  note?: React.ReactNode;
  onJoin: (choices: { audio: boolean; video: boolean }) => void;
}

/** Camera preview with microphone / camera choices before entering the meeting. */
export function Lobby({ name, joinLabel, busy = false, note, onJoin }: LobbyProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [video, setVideo] = useState(true);
  const [audio, setAudio] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noMic, setNoMic] = useState(false);

  // A device without a microphone joins muted instead of failing
  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((devices) => {
        if (!devices.some((d) => d.kind === 'audioinput')) {
          setNoMic(true);
          setAudio(false);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    if (!video) {
      stop();
      return;
    }
    openCamera({ width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(describeMediaError(err, 'camera'));
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [video]);

  const toggle = 'w-11 h-11 rounded-full flex items-center justify-center transition-colors';

  return (
    <div className="w-full max-w-lg">
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-800 border border-white/10">
        <video ref={videoRef} muted playsInline className={`w-full h-full object-cover -scale-x-100 ${video && !error ? '' : 'hidden'}`} />
        {(!video || error) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 p-6 text-center">
            <span className="w-16 h-16 rounded-full bg-blue-600 text-white text-2xl font-bold flex items-center justify-center">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-xs">{error ?? 'Camera is off'}</span>
            {error && <span className="text-xs text-slate-300">You can still join the class without a camera.</span>}
          </div>
        )}
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-3">
          <button
            onClick={() => setAudio((a) => !a)}
            disabled={noMic}
            title={noMic ? 'No microphone found' : undefined}
            aria-pressed={audio}
            aria-label={audio ? 'Turn microphone off' : 'Turn microphone on'}
            className={`${toggle} ${audio ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-rose-600 text-white'}`}
          >
            {audio ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setVideo((v) => !v)}
            aria-pressed={video}
            aria-label={video ? 'Turn camera off' : 'Turn camera on'}
            className={`${toggle} ${video ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-rose-600 text-white'}`}
          >
            {video ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {note && <div className="mt-4 text-xs text-slate-400">{note}</div>}

      <button
        onClick={() => {
          // Hand the devices over to the meeting
          streamRef.current?.getTracks().forEach((t) => t.stop());
          onJoin({ audio, video: video && !error });
        }}
        disabled={busy}
        className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-60"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {error ? `${joinLabel} without camera` : joinLabel}
      </button>
    </div>
  );
}
