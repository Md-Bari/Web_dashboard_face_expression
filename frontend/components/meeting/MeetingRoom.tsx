'use client';

import '@livekit/components-styles';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CarouselLayout,
  ConnectionStateToast,
  DisconnectButton,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  isTrackReference,
  useChat,
  useLocalParticipant,
  useParticipantAttributes,
  useParticipants,
  useTrackRefContext,
  useTracks,
} from '@livekit/components-react';
import { DisconnectReason, Participant, Track } from 'livekit-client';
import {
  BarChart3,
  Hand,
  Loader2,
  MessageSquare,
  Send,
  MicOff,
  PhoneOff,
  ScanFace,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { useInstructorSocket } from '@/lib/websocket';
import { useExpressionStream } from '@/lib/useExpressionStream';
import { EMOTIONS, EMOTION_META, emotionMeta } from '@/lib/emotions';
import type { MeetingPass } from '@/lib/types';

type Panel = 'chat' | 'people' | 'insights' | null;

interface MeetingRoomProps {
  pass: MeetingPass;
  sessionId: number;
  title: string;
  subtitle: string;
  startedAt: string | null;
  choices: { audio: boolean; video: boolean };
  onLeft: (reason?: DisconnectReason) => void;
}

/** The class meeting: video grid, controls, chat, participants and (for the instructor) live expression insights. */
export function MeetingRoom({ pass, sessionId, title, subtitle, startedAt, choices, onLeft }: MeetingRoomProps) {
  return (
    <LiveKitRoom
      serverUrl={pass.url}
      token={pass.token}
      connect
      audio={choices.audio}
      video={choices.video}
      onDisconnected={onLeft}
      // No camera or microphone on this device: stay in the class with it off
      onMediaDeviceFailure={() => undefined}
      data-lk-theme="default"
      // Inline: LiveKit's stylesheet (unlayered) would beat Tailwind's height utilities
      style={{ height: '100dvh' }}
      className="flex flex-col bg-[#0b0f17] text-slate-100"
    >
      <LayoutContextProvider>
        <RoomBody host={pass.host} sessionId={sessionId} title={title} subtitle={subtitle} startedAt={startedAt} />
      </LayoutContextProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LiveKitRoom>
  );
}

function userIdOf(participant: Participant) {
  const match = /^user-(\d+)$/.exec(participant.identity);
  return match ? Number(match[1]) : null;
}

function roleOf(participant: Participant): 'host' | 'student' {
  try {
    return JSON.parse(participant.metadata || '{}').role === 'host' ? 'host' : 'student';
  } catch {
    return 'student';
  }
}

function RoomBody({
  host,
  sessionId,
  title,
  subtitle,
  startedAt,
}: {
  host: boolean;
  sessionId: number;
  title: string;
  subtitle: string;
  startedAt: string | null;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setPanel((current) => (current === p ? null : p));
  // One chat subscription for the room (a second one would not receive messages)
  const chat = useChat();

  // The instructor gets the class analytics stream (expressions per student) right in the meeting
  useInstructorSocket(host ? sessionId : null);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const screenShare = tracks.find((t) => isTrackReference(t) && t.source === Track.Source.ScreenShare);
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera);

  return (
    <>
      <TopBar host={host} sessionId={sessionId} title={title} subtitle={subtitle} startedAt={startedAt} />
      <div className="flex-1 min-h-0 flex relative">
        <div className="flex-1 min-w-0 p-2">
          {screenShare && isTrackReference(screenShare) ? (
            <FocusLayoutContainer className="h-full">
              <CarouselLayout tracks={cameras}>
                <Tile host={host} />
              </CarouselLayout>
              <FocusLayout trackRef={screenShare} />
            </FocusLayoutContainer>
          ) : (
            <GridLayout tracks={cameras} className="h-full">
              <Tile host={host} />
            </GridLayout>
          )}
        </div>
        {panel && (
          <aside className="absolute inset-0 z-20 sm:static sm:w-80 shrink-0 bg-[#111827] border-l border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-semibold">
                {panel === 'chat' ? 'Chat' : panel === 'people' ? 'Participants' : 'Class insights'}
              </h2>
              <button onClick={() => setPanel(null)} aria-label="Close panel" className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={`flex-1 min-h-0 ${panel === 'chat' ? '' : 'overflow-y-auto'}`}>
              {panel === 'chat' && <ChatPanel chat={chat} />}
              {panel === 'people' && <PeoplePanel host={host} sessionId={sessionId} />}
              {panel === 'insights' && <InsightsPanel />}
            </div>
          </aside>
        )}
      </div>
      <ControlStrip host={host} sessionId={sessionId} panel={panel} onToggle={toggle} messageCount={chat.chatMessages.length} />
    </>
  );
}

function Elapsed({ since }: { since: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className="font-mono">{h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}</span>;
}

function TopBar({
  host,
  sessionId,
  title,
  subtitle,
  startedAt,
}: {
  host: boolean;
  sessionId: number;
  title: string;
  subtitle: string;
  startedAt: string | null;
}) {
  const participants = useParticipants();
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-[#0b0f17]">
      <div className="min-w-0">
        <h1 className="text-sm font-semibold truncate">{title}</h1>
        <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-slate-300">
        {!host && <ExpressionChip sessionId={sessionId} />}
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> <Elapsed since={startedAt} />
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5">
          <Users className="w-3.5 h-3.5" /> {participants.length}
        </span>
      </div>
    </header>
  );
}

/** Student: sends their own camera to the expression model while the camera is on. */
function ExpressionChip({ sessionId }: { sessionId: number }) {
  const { cameraTrack } = useLocalParticipant();
  const track = cameraTrack && !cameraTrack.isMuted ? cameraTrack.track?.mediaStreamTrack ?? null : null;
  const state = useExpressionStream(sessionId, track);
  const label =
    state.status === 'on'
      ? 'Expression analysis on'
      : state.status === 'connecting'
      ? 'Connecting analysis…'
      : state.status === 'error'
      ? 'Analysis unavailable'
      : 'Camera off - not analysed';
  return (
    <span
      title={state.message ?? label}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${
        state.status === 'on' ? 'bg-emerald-500/15 text-emerald-300' : state.status === 'error' ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-slate-400'
      }`}
    >
      <ScanFace className="w-3.5 h-3.5" />
      <span className="hidden md:inline">{label}</span>
    </span>
  );
}

/** One video tile, with the raised hand and (for the instructor) the student's live expression. */
function Tile({ host }: { host: boolean }) {
  const trackRef = useTrackRefContext();
  const participant = trackRef.participant;
  const { attributes } = useParticipantAttributes({ participant });
  const userId = userIdOf(participant);
  const student = useDashboardStore((s) => (host && userId !== null ? s.students.find((x) => x.id === userId) : undefined));
  const showExpression = host && roleOf(participant) === 'student' && student?.has_data && student.online;
  const meta = student ? emotionMeta(student.smoothed_emotion || student.emotion) : null;

  return (
    <div className="relative w-full h-full">
      <ParticipantTile trackRef={trackRef} className="h-full" />
      {attributes?.hand === '1' && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-400 text-slate-900 text-xs font-bold shadow">
          <Hand className="w-3.5 h-3.5" /> Hand raised
        </span>
      )}
      {showExpression && meta && student && (
        <span
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-xs font-semibold"
          title={`Attention ${Math.round(student.attention * 100)}%`}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
          {meta.label} · {Math.round(student.attention * 100)}%
        </span>
      )}
    </div>
  );
}

function ControlStrip({
  host,
  sessionId,
  panel,
  onToggle,
  messageCount,
}: {
  host: boolean;
  sessionId: number;
  panel: Panel;
  onToggle: (p: Exclude<Panel, null>) => void;
  messageCount: number;
}) {
  const { localParticipant } = useLocalParticipant();
  const { attributes } = useParticipantAttributes({ participant: localParticipant });
  const handUp = attributes?.hand === '1';
  const participants = useParticipants();
  const hands = participants.filter((p) => p.attributes?.hand === '1').length;
  const [seenMessages, setSeenMessages] = useState(0);
  const unread = panel === 'chat' ? 0 : Math.max(0, messageCount - seenMessages);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);

  // Messages count as read while the chat is open
  const chatOpen = panel === 'chat';
  if (chatOpen && seenMessages !== messageCount) setSeenMessages(messageCount);

  const endClass = async () => {
    setEnding(true);
    try {
      await api.endSession(sessionId); // the server closes the room: everyone is disconnected
    } catch {
      setEnding(false);
    }
  };

  const button = 'lk-button relative';
  const badge = 'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center';

  return (
    <footer className="flex flex-wrap items-center justify-center gap-2 px-3 py-3 border-t border-white/10 bg-[#0b0f17]">
      <TrackToggle source={Track.Source.Microphone} showIcon>
        <span className="hidden sm:inline">Mic</span>
      </TrackToggle>
      <TrackToggle source={Track.Source.Camera} showIcon>
        <span className="hidden sm:inline">Camera</span>
      </TrackToggle>
      {host && (
        <TrackToggle source={Track.Source.ScreenShare} showIcon>
          <span className="hidden sm:inline">Share screen</span>
        </TrackToggle>
      )}
      {!host && (
        <button
          className={button}
          aria-pressed={handUp}
          onClick={() => localParticipant.setAttributes({ hand: handUp ? '' : '1' })}
          style={handUp ? { background: '#fbbf24', color: '#0f172a' } : undefined}
        >
          <Hand className="w-4 h-4" /> <span className="hidden sm:inline">{handUp ? 'Lower hand' : 'Raise hand'}</span>
        </button>
      )}
      <button className={button} aria-pressed={panel === 'chat'} onClick={() => onToggle('chat')}>
        <MessageSquare className="w-4 h-4" /> <span className="hidden sm:inline">Chat</span>
        {unread > 0 && <span className={`${badge} bg-blue-500 text-white`}>{unread}</span>}
      </button>
      <button className={button} aria-pressed={panel === 'people'} onClick={() => onToggle('people')}>
        <Users className="w-4 h-4" /> <span className="hidden sm:inline">People</span>
        {hands > 0 && <span className={`${badge} bg-amber-400 text-slate-900`}>{hands}</span>}
      </button>
      {host && (
        <button className={button} aria-pressed={panel === 'insights'} onClick={() => onToggle('insights')}>
          <BarChart3 className="w-4 h-4" /> <span className="hidden sm:inline">Insights</span>
        </button>
      )}
      <DisconnectButton>
        <PhoneOff className="w-4 h-4" /> <span className="hidden sm:inline">Leave</span>
      </DisconnectButton>
      {host &&
        (confirmEnd ? (
          <span className="inline-flex items-center gap-2 text-xs">
            End the class for everyone?
            <button className="lk-button lk-disconnect-button" onClick={endClass} disabled={ending}>
              {ending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} End class
            </button>
            <button className="lk-button" onClick={() => setConfirmEnd(false)} disabled={ending}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="lk-button lk-disconnect-button" onClick={() => setConfirmEnd(true)}>
            End class
          </button>
        ))}
    </footer>
  );
}

function ChatPanel({ chat }: { chat: ReturnType<typeof useChat> }) {
  const [draft, setDraft] = useState('');
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const count = chat.chatMessages.length;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [count]);

  return (
    <div className="h-full flex flex-col">
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {count === 0 && <p className="text-xs text-slate-500 text-center mt-6">No messages yet. Say hello!</p>}
        {chat.chatMessages.map((m) => (
          <div key={m.id} className={m.from?.isLocal ? 'text-right' : ''}>
            <p className="text-[11px] text-slate-400">
              {m.from?.isLocal ? 'You' : m.from?.name || m.from?.identity || 'Someone'} ·{' '}
              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p
              className={`inline-block mt-0.5 px-3 py-1.5 rounded-2xl text-sm text-left whitespace-pre-wrap break-words max-w-full ${
                m.from?.isLocal ? 'bg-blue-600 text-white' : 'bg-white/10 text-slate-100'
              }`}
            >
              {m.message}
            </p>
          </div>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft('');
          await chat.send(text);
        }}
        className="flex gap-2 p-3 border-t border-white/10"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message everyone"
          maxLength={1000}
          aria-label="Chat message"
          className="flex-1 min-w-0 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-hidden focus:border-blue-500"
        />
        <button type="submit" disabled={chat.isSending || !draft.trim()} className="lk-button" aria-label="Send">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

function PeoplePanel({ host, sessionId }: { host: boolean; sessionId: number }) {
  const participants = useParticipants();
  const students = useDashboardStore((s) => s.students);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...participants].sort((a, b) => {
        const hand = Number(b.attributes?.hand === '1') - Number(a.attributes?.hand === '1');
        if (hand) return hand;
        const role = Number(roleOf(b) === 'host') - Number(roleOf(a) === 'host');
        return role || (a.name || a.identity).localeCompare(b.name || b.identity);
      }),
    [participants]
  );

  const moderate = async (action: 'remove' | 'mute', participant: Participant) => {
    setError(null);
    try {
      const mic = participant.getTrackPublication(Track.Source.Microphone);
      await api.moderate(sessionId, action, participant.identity, mic?.trackSid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
  };

  return (
    <div className="p-2 space-y-1">
      {error && <p className="m-2 text-xs text-rose-300 bg-rose-500/10 rounded-lg p-2">{error}</p>}
      {sorted.map((p) => {
        const userId = userIdOf(p);
        const student = host && userId !== null ? students.find((s) => s.id === userId) : undefined;
        const meta = student?.has_data && student.online ? emotionMeta(student.smoothed_emotion || student.emotion) : null;
        const isHost = roleOf(p) === 'host';
        return (
          <div key={p.identity} className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/5">
            <span className="w-8 h-8 rounded-full bg-blue-600/80 flex items-center justify-center text-xs font-bold shrink-0">
              {(p.name || p.identity).slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">
                {p.name || p.identity}
                {p.isLocal && <span className="text-slate-400"> (you)</span>}
              </p>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                {isHost ? 'Instructor' : 'Student'}
                {meta && student && (
                  <>
                    · <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} /> {meta.label}{' '}
                    {Math.round(student.attention * 100)}%
                  </>
                )}
              </p>
            </div>
            {p.attributes?.hand === '1' && <Hand className="w-4 h-4 text-amber-400 shrink-0" aria-label="Hand raised" />}
            {!p.isMicrophoneEnabled && <MicOff className="w-4 h-4 text-slate-500 shrink-0" aria-label="Muted" />}
            {host && !p.isLocal && !isHost && (
              <span className="flex gap-1 shrink-0">
                {p.isMicrophoneEnabled && (
                  <button onClick={() => moderate('mute', p)} title="Mute" className="p-1.5 rounded-lg hover:bg-white/10">
                    <MicOff className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => moderate('remove', p)} title="Remove from the class" className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300">
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Instructor: live class-wide expression shares, attention and suggestions, from the analytics stream. */
function InsightsPanel() {
  const { snapshot, students, suggestions } = useDashboardStore();
  const live = students.filter((s) => s.online && s.has_data !== false);
  const low = live.filter((s) => s.attention < 0.5);
  // The same advice can be stored more than once over a class; show each once
  const advice = suggestions.filter((s, i) => suggestions.findIndex((x) => x.title === s.title) === i);
  return (
    <div className="p-4 space-y-5 text-sm">
      <section>
        <p className="text-xs text-slate-400 mb-2">
          {snapshot.total_students} face{snapshot.total_students === 1 ? '' : 's'} analysed · average attention{' '}
          <b className="text-white">{snapshot.avg_concentration}%</b>
        </p>
        <div className="space-y-1.5">
          {EMOTIONS.map((e) => (
            <div key={e} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-slate-300">{EMOTION_META[e].label}</span>
              <span className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${snapshot.emotion_pcts[e]}%`, backgroundColor: EMOTION_META[e].color }}
                />
              </span>
              <span className="w-9 text-right font-mono text-slate-300">{snapshot.emotion_pcts[e]}%</span>
            </div>
          ))}
        </div>
      </section>

      {low.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-300 mb-1.5">Low attention</h3>
          <ul className="space-y-1">
            {low.map((s) => (
              <li key={s.id} className="flex justify-between text-xs text-slate-300">
                <span className="truncate">{s.name}</span>
                <span className="font-mono text-amber-300">{Math.round(s.attention * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold text-slate-300 mb-1.5">Suggestions</h3>
        {advice.length === 0 ? (
          <p className="text-xs text-slate-500">None right now.</p>
        ) : (
          <ul className="space-y-2">
            {advice.slice(0, 4).map((s) => (
              <li key={s.id} className="rounded-xl bg-white/5 p-2.5">
                <p className="text-xs font-semibold text-white">{s.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{s.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
