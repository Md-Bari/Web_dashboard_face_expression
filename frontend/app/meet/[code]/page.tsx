'use client';

import React, { use, useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarClock, GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { MeetInfo, MeetingPass } from '@/lib/types';
import { AccountForms } from '@/components/auth/AccountForms';
import { Lobby } from '@/components/meeting/Lobby';
import dynamic from 'next/dynamic';
import type { LeaveReason } from '@/components/meeting/MeetingRoom';

// The LiveKit SDK is large: load it only when the student actually enters the room
const MeetingRoom = dynamic(() => import('@/components/meeting/MeetingRoom').then((m) => m.MeetingRoom), {
  ssr: false,
  loading: () => (
    <div className="min-h-dvh flex items-center justify-center bg-slate-950">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  ),
});

type Stage =
  | { name: 'loading' }
  | { name: 'message'; title: string; text: string; rejoin?: boolean }
  | { name: 'account' }
  | { name: 'consent' }
  | { name: 'lobby' }
  | { name: 'waiting'; choices: Choices }
  | { name: 'room'; pass: MeetingPass; choices: Choices };

type Choices = { audio: boolean; video: boolean };

const CONSENT_POINTS: [string, string][] = [
  ['Expression analysis:', 'While your camera is on, a small picture is sent about once a second and analysed in server memory for your expression and attention. Turn the camera off and nothing is analysed.'],
  ['What is kept:', 'The expression label and attention score, one photo per expression per class, and a few face templates (numbers, not photos) so your instructor sees your name.'],
  ['No recording:', 'The class video and audio are never recorded or stored.'],
  ['Your choice:', 'You can withdraw consent at any time from the student portal; your photos and templates are then deleted.'],
];

/**
 * Meeting link of a class session (/meet/<code>): sign in or create an account, accept the
 * camera consent (students), check camera and microphone, and enter the class meeting.
 */
export default function MeetPage({ params }: { params: Promise<{ code: string }> }) {
  // The link code is only known per request: render the page inside a Suspense boundary
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-[#0B1528]">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </main>
      }
    >
      <Meet params={params} />
    </Suspense>
  );
}

function Meet({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [info, setInfo] = useState<MeetInfo | null>(null);
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Work out the next step from what the server says about the link and the visitor. */
  const evaluate = useCallback(async (): Promise<void> => {
    // A second pass follows when the link has just added the student to the class
    for (let pass = 0; pass < 2; pass++) {
      let next: MeetInfo;
      try {
        next = await api.meetInfo(code);
      } catch (e) {
        setStage({
          name: 'message',
          title: 'Cannot open this class',
          text: e instanceof ApiError && e.status === 404 ? 'This meeting link is not valid. Ask your instructor for the right one.' : 'Cannot reach the class server.',
        });
        return;
      }
      setInfo(next);
      const viewer = next.viewer;
      if (!next.meetings_enabled) {
        setStage({ name: 'message', title: 'Video meetings are off', text: 'The server has no video meeting service configured yet.' });
      } else if (next.session.status === 'ENDED') {
        setStage({ name: 'message', title: 'This class has ended', text: 'The session is over. Your instructor can share a new link.' });
      } else if (!viewer.signed_in) {
        setStage({ name: 'account' });
      } else if (viewer.host) {
        setStage({ name: 'lobby' });
      } else if (viewer.role !== 'student') {
        setStage({ name: 'message', title: 'Not your class', text: 'Only the class instructor and its students can join this meeting.' });
      } else if (!viewer.allowed) {
        if (viewer.enrolled || pass > 0) {
          setStage({ name: 'message', title: 'Another section', text: 'This class session is for a different section than yours.' });
          return;
        }
        try {
          await api.meetEnroll(code); // the link adds the student when it makes the section clear
          continue;
        } catch (e) {
          setStage({ name: 'message', title: 'You are not in this class yet', text: e instanceof ApiError ? e.message : 'Cannot reach the class server.' });
        }
      } else if (!viewer.consent_given) {
        setStage({ name: 'consent' });
      } else {
        setStage({ name: 'lobby' });
      }
      return;
    }
  }, [code]);

  useEffect(() => {
    const first = setTimeout(evaluate, 0);
    return () => clearTimeout(first);
  }, [evaluate]);

  const enter = useCallback(
    async (choices: Choices) => {
      if (!info) return;
      setBusy(true);
      setError(null);
      try {
        if (info.viewer.host && info.session.status !== 'LIVE') {
          await api.startSession(info.session.id);
        }
        const pass = await api.meetingPass(info.session.id);
        const fresh = await api.meetInfo(code); // started_at for the class timer
        setInfo(fresh);
        setStage({ name: 'room', pass, choices });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setStage({ name: 'waiting', choices });
        else if (e instanceof ApiError && e.status === 403 && e.message.toLowerCase().includes('consent')) setStage({ name: 'consent' });
        else setError(e instanceof ApiError ? e.message : 'Could not join the class.');
      }
      setBusy(false);
    },
    [info, code]
  );

  // Students who arrive early wait here and enter as soon as the instructor starts the class
  useEffect(() => {
    if (stage.name !== 'waiting') return;
    const timer = setInterval(async () => {
      try {
        const next = await api.meetInfo(code);
        if (next.session.status === 'LIVE') {
          setInfo(next);
          enter(stage.choices);
        } else if (next.session.status === 'ENDED') {
          setStage({ name: 'message', title: 'This class has ended', text: 'The session is over.' });
        }
      } catch {
        // keep waiting
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [stage, code, enter]);

  const onLeft = (reason: LeaveReason) => {
    if (reason === 'ended') {
      setStage({ name: 'message', title: 'The class has ended', text: 'Your instructor ended the class. Thanks for joining!' });
    } else if (reason === 'removed') {
      setStage({ name: 'message', title: 'You were removed', text: 'The instructor removed you from this class meeting.' });
    } else {
      setStage({ name: 'message', title: 'You left the class', text: 'You can rejoin while the class is running.', rejoin: true });
    }
  };

  if (stage.name === 'room' && info) {
    const sections = info.session.sections.length ? ` · Section ${info.session.sections.join(', ')}` : '';
    return (
      <MeetingRoom
        pass={stage.pass}
        sessionId={info.session.id}
        title={info.session.title}
        subtitle={`${info.course.title}${sections} · ${info.instructor}`}
        startedAt={info.session.started_at}
        choices={stage.choices}
        onLeft={onLeft}
      />
    );
  }

  const isHost = !!info?.viewer.host;
  const notLive = info?.session.status !== 'LIVE';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#0B1528] text-slate-100 p-4 sm:p-6">
      <div className="flex items-center gap-3 max-w-lg w-full">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-lg leading-tight truncate">{info ? info.session.title : 'Class meeting'}</h1>
          {info && (
            <p className="text-[11px] text-slate-400 truncate">
              {info.course.code} · {info.course.title}
              {info.session.sections.length ? ` · Section ${info.session.sections.join(', ')}` : ''} · {info.instructor}
            </p>
          )}
        </div>
      </div>

      {stage.name === 'loading' && <Loader2 className="w-6 h-6 animate-spin text-slate-400" />}

      {stage.name === 'message' && (
        <div className="max-w-lg w-full bg-white/5 border border-white/10 rounded-2xl p-6">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" /> {stage.title}
          </p>
          <p className="mt-2 text-sm text-slate-300">{stage.text}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {stage.rejoin && (
              <button onClick={() => evaluate()} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold">
                Rejoin
              </button>
            )}
            <Link href="/" className="px-4 py-2 rounded-xl border border-white/15 text-sm font-semibold text-slate-200 hover:bg-white/5">
              {isHost ? 'Back to the dashboard' : 'Go to my portal'}
            </Link>
          </div>
        </div>
      )}

      {stage.name === 'account' && (
        <div className="max-w-sm w-full bg-white text-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <p className="mb-4 text-sm text-slate-600">Sign in or create your student account to join the class.</p>
          <AccountForms
            registerDisabledReason={
              info && !info.can_register
                ? "This class has several sections. Create your account with your section's invite link from your instructor, then come back."
                : null
            }
            submitLabels={{ register: 'Create account & continue', signin: 'Sign in & continue' }}
            onRegister={async (data) => {
              await api.meetRegister(code, data);
              await evaluate();
            }}
            onSignIn={async (username, password) => {
              await api.login(username, password);
              await evaluate();
            }}
          />
        </div>
      )}

      {stage.name === 'consent' && (
        <div className="max-w-lg w-full bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Camera &amp; privacy consent
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            {CONSENT_POINTS.map(([title, body]) => (
              <li key={title}>
                <b className="text-white">{title}</b> {body}
              </li>
            ))}
          </ul>
          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await api.setConsent(true);
                await evaluate();
              } catch {
                setError('Could not save your consent. Try again.');
              }
              setBusy(false);
            }}
            disabled={busy}
            className="mt-5 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-semibold text-sm disabled:opacity-60"
          >
            I understand &amp; agree
          </button>
        </div>
      )}

      {stage.name === 'lobby' && info && (
        <>
          <Lobby
            name={info.viewer.name || 'You'}
            busy={busy}
            joinLabel={isHost ? (notLive ? 'Start class & join' : 'Join as instructor') : notLive ? 'Join & wait for the class' : 'Join class'}
            note={
              isHost ? (
                notLive ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="w-4 h-4" /> The session is not live yet. Joining starts it for your students.
                  </span>
                ) : (
                  'You join as the host: you can share your screen, mute or remove participants and end the class.'
                )
              ) : (
                'While your camera is on, your expression is analysed for your instructor. You can turn the camera off at any time.'
              )
            }
            onJoin={enter}
          />
          {error && <p className="max-w-lg w-full text-sm text-rose-300">{error}</p>}
        </>
      )}

      {stage.name === 'waiting' && (
        <div className="max-w-lg w-full bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
          <div>
            <p className="font-semibold">Waiting for the instructor to start the class…</p>
            <p className="text-sm text-slate-400">
              {info?.session.scheduled_for
                ? `Scheduled for ${new Date(info.session.scheduled_for).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. `
                : ''}
              You will enter automatically.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
