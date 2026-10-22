'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  History,
  Link2,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  ShieldOff,
  Video,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLogout } from '@/lib/useLogout';
import { Avatar } from '@/components/dashboard/Avatar';
import type { AuthUser, SessionInfo, StudentCourse } from '@/lib/types';

const REFRESH_MS = 20_000;
const PAST_SHOWN = 3;
const FILTER_KEY = 'emp-edu:student-course';
const ACCENTS = [
  'from-blue-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-fuchsia-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-sky-500',
];

type Filter = 'all' | number;

const instructorName = (u: AuthUser) => u.display_title || u.name || u.username;
const sectionLabel = (s: SessionInfo) =>
  s.sections && s.sections.length > 0 ? `Section ${s.sections.map((x) => x.name).join(', ')}` : 'Whole class';
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function countdown(iso: string, now: number) {
  const mins = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (mins <= 0) return 'starting soon';
  if (mins < 60) return `starts in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `starts in ${hours} h${mins % 60 ? ` ${mins % 60} min` : ''}`;
  const days = Math.round(hours / 24);
  return `starts in ${days} day${days === 1 ? '' : 's'}`;
}

/** Invite link (/join/<code>), meeting link (/meet/<code>) or a bare code */
function parseLink(text: string): { kind: 'join' | 'meet'; code: string } | null {
  const t = text.trim();
  const m = t.match(/\/(join|meet)\/([A-Za-z0-9_-]+)/);
  if (m) return { kind: m[1] as 'join' | 'meet', code: m[2] };
  return /^[A-Za-z0-9_-]{4,}$/.test(t) ? { kind: 'join', code: t } : null;
}

export default function StudentDashboard() {
  const router = useRouter();
  const { logout, loggingOut } = useLogout();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [courses, setCourses] = useState<StudentCourse[] | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [joinOpen, setJoinOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.myCourses(), api.sessions()]);
      setCourses(c);
      setSessions(s);
      setError(null);
    } catch {
      setError('Cannot reach the class server. Retrying…');
    }
    setNow(Date.now());
  }, []);

  // Sign-in check, then the classes and sessions, refreshed so a class that starts shows up by itself
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const boot = setTimeout(async () => {
      try {
        const user = await api.me();
        if (cancelled) return;
        if (user.role !== 'student') {
          router.replace('/');
          return;
        }
        setMe(user);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace('/login?next=/student');
          return;
        }
        setError('Cannot reach the class server. Retrying…');
      }
      try {
        const saved = window.localStorage.getItem(FILTER_KEY);
        if (saved && saved !== 'all' && Number(saved)) setFilter(Number(saved));
      } catch {
        // storage unavailable: show all classes
      }
      await refresh();
      if (!cancelled) timer = setInterval(refresh, REFRESH_MS);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(boot);
      if (timer) clearInterval(timer);
    };
  }, [router, refresh]);

  const chooseFilter = (f: Filter) => {
    setFilter(f);
    try {
      window.localStorage.setItem(FILTER_KEY, String(f));
    } catch {
      // not remembered, that's fine
    }
  };

  const byCourse = useMemo(() => {
    const map = new Map<number, SessionInfo[]>();
    for (const s of sessions) {
      const id = s.course?.id;
      if (id == null) continue;
      map.set(id, [...(map.get(id) ?? []), s]);
    }
    return map;
  }, [sessions]);

  const live = sessions.filter((s) => s.status === 'LIVE' && (filter === 'all' || s.course?.id === filter));
  const accentOf = (courseId: number) => {
    const i = courses?.findIndex((c) => c.id === courseId) ?? 0;
    return ACCENTS[Math.max(i, 0) % ACCENTS.length];
  };
  // A remembered class the student has since left falls back to all classes
  const activeFilter: Filter = filter !== 'all' && courses && !courses.some((c) => c.id === filter) ? 'all' : filter;
  const shown = (courses ?? []).filter((c) => activeFilter === 'all' || c.id === activeFilter);

  if (!me || courses === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-canvas text-slate-500 text-sm">
        {error ? (
          <>
            <AlertCircle className="w-6 h-6 text-amber-500" /> {error}
          </>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin" />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-slate-800">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </span>
            <span className="font-bold text-slate-900 truncate">
              EMP-EDU <span className="hidden sm:inline font-medium text-slate-500">· My classes</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              <Avatar name={me.name} src={me.avatar_url} className="w-8 h-8 rounded-full text-xs" imgClassName="object-cover" />
              <span className="text-sm font-semibold text-slate-700 max-w-[160px] truncate">{me.name}</span>
            </div>
            <button
              onClick={logout}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <LogOut className="w-3.5 h-3.5" /> {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Hi {me.first_name || me.name} 👋</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {courses.length === 0
                ? 'You are not in any class yet.'
                : `You are in ${courses.length} class${courses.length === 1 ? '' : 'es'}. Your sessions are listed per class.`}
            </p>
          </div>
          <button
            onClick={() => setJoinOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
          >
            {joinOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} Join a class
          </button>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}

        {(joinOpen || courses.length === 0) && (
          <JoinClass
            onJoined={async (courseName) => {
              setJoinOpen(true); // keep the form (and its confirmation) after the first class appears
              await refresh();
              return courseName;
            }}
            onMeet={(code) => router.push(`/meet/${code}`)}
          />
        )}

        {/* Live now, across every class */}
        <section>
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            <span className="relative flex w-2.5 h-2.5">
              {live.length > 0 && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />}
              <span className={`relative w-2.5 h-2.5 rounded-full ${live.length ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            </span>
            Live now
          </h2>
          {live.length === 0 ? (
            <p className="text-sm text-slate-500 bg-white border border-dashed border-slate-200 rounded-2xl p-4">
              No class is live right now. This page updates by itself when your instructor starts one.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {live.map((s) => (
                <div
                  key={s.id}
                  className="min-w-0 flex items-center gap-3 sm:gap-4 rounded-2xl p-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
                >
                  <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{s.title}</p>
                    <p className="text-xs text-emerald-50 truncate">
                      {s.course?.code} · {s.course?.title} · {sectionLabel(s)}
                    </p>
                  </div>
                  {s.join_code && (
                    <Link
                      href={`/meet/${s.join_code}`}
                      className="shrink-0 px-4 py-2 rounded-xl bg-white text-emerald-700 text-sm font-bold hover:bg-emerald-50"
                    >
                      Join class
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {courses.length > 0 && (
          <section>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <FilterChip active={activeFilter === 'all'} onClick={() => chooseFilter('all')}>
                All classes
              </FilterChip>
              {courses.map((c) => (
                <FilterChip key={c.id} active={activeFilter === c.id} onClick={() => chooseFilter(c.id)}>
                  {c.code} · {c.title}
                </FilterChip>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {shown.map((c) => (
                <CourseCard key={c.id} course={c} sessions={byCourse.get(c.id) ?? []} accent={accentOf(c.id)} now={now} />
              ))}
            </div>
          </section>
        )}

        <PrivacyCard me={me} onChange={setMe} />
      </main>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function CourseCard({
  course,
  sessions,
  accent,
  now,
}: {
  course: StudentCourse;
  sessions: SessionInfo[];
  accent: string;
  now: number;
}) {
  const [allPast, setAllPast] = useState(false);
  const live = sessions.filter((s) => s.status === 'LIVE');
  const upcoming = sessions
    .filter((s) => s.status === 'SCHEDULED')
    .sort((a, b) => (a.scheduled_for ? Date.parse(a.scheduled_for) : Infinity) - (b.scheduled_for ? Date.parse(b.scheduled_for) : Infinity));
  const past = sessions
    .filter((s) => s.status === 'ENDED')
    .sort((a, b) => Date.parse(b.ended_at ?? b.started_at ?? '') - Date.parse(a.ended_at ?? a.started_at ?? ''));
  const pastShown = allPast ? past : past.slice(0, PAST_SHOWN);

  return (
    <article className="min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className={`bg-gradient-to-r ${accent} px-5 py-4 text-white`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">{course.code}</p>
            <h3 className="text-lg font-bold leading-tight truncate">{course.title}</h3>
            <p className="text-xs text-white/85 mt-0.5 truncate">{instructorName(course.instructor)}</p>
          </div>
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-white/20 text-xs font-bold">
            {course.my_section ? `Section ${course.my_section.name}` : 'No section'}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4 flex-1">
        {sessions.length === 0 && (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-400" /> No sessions yet. Your instructor has not scheduled a class.
          </p>
        )}

        {live.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate">{s.title}</p>
              <p className="text-xs text-emerald-700">Live now · {sectionLabel(s)}</p>
            </div>
            {s.join_code && (
              <Link
                href={`/meet/${s.join_code}`}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                Join class
              </Link>
            )}
          </div>
        ))}

        {upcoming.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              <CalendarClock className="w-3.5 h-3.5" /> Upcoming
            </p>
            <ul className="space-y-2">
              {upcoming.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="w-12 shrink-0 text-center rounded-lg bg-blue-50 text-blue-700 py-1">
                    {s.scheduled_for ? (
                      <>
                        <p className="text-[10px] font-bold uppercase">
                          {new Date(s.scheduled_for).toLocaleString(undefined, { month: 'short' })}
                        </p>
                        <p className="text-lg font-bold leading-none">{new Date(s.scheduled_for).getDate()}</p>
                      </>
                    ) : (
                      <p className="text-[10px] font-bold py-1.5">TBA</p>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{s.title}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {s.scheduled_for ? dateTime(s.scheduled_for) : 'Time to be announced'} · {sectionLabel(s)}
                    </p>
                    {s.scheduled_for && now > 0 && (
                      <p className="text-[11px] font-semibold text-blue-600 mt-0.5">{countdown(s.scheduled_for, now)}</p>
                    )}
                  </div>
                  {s.join_code && (
                    <Link
                      href={`/meet/${s.join_code}`}
                      title="Opens the class lobby; you enter automatically when the class starts"
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold"
                    >
                      Join &amp; wait
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              <History className="w-3.5 h-3.5" /> Past
            </p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {pastShown.map((s) => {
                const when = s.ended_at ?? s.started_at;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="min-w-0 truncate font-medium text-slate-700">{s.title}</span>
                    <span className="shrink-0 text-slate-400">{when ? dateTime(when) : 'Ended'}</span>
                  </li>
                );
              })}
            </ul>
            {past.length > PAST_SHOWN && (
              <button
                onClick={() => setAllPast((a) => !a)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${allPast ? 'rotate-180' : ''}`} />
                {allPast ? 'Show less' : `Show all ${past.length}`}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function JoinClass({
  onJoined,
  onMeet,
}: {
  onJoined: (courseName: string) => Promise<string>;
  onMeet: (code: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseLink(text);
    setError(null);
    setDone(null);
    if (!target) {
      setError('Paste the invite link your instructor shared, e.g. https://…/join/AB12CD34');
      return;
    }
    if (target.kind === 'meet') {
      onMeet(target.code);
      return;
    }
    setBusy(true);
    try {
      const info = await api.joinInfo(target.code);
      await api.joinEnroll(target.code);
      const name = `${info.course.code} · ${info.course.title}${info.section ? ` (Section ${info.section})` : ''}`;
      setText('');
      setDone(await onJoined(name));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join this class.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 sm:p-5">
      <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
        <Link2 className="w-4 h-4 text-blue-600" /> Join a class with an invite link
      </p>
      <p className="text-xs text-slate-500 mt-0.5">
        Paste the link (or code) your instructor shared. You are added to that class and section; a meeting link opens
        the class directly.
      </p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://…/join/AB12CD34"
          className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Join
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      {done && (
        <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
          <CheckCircle2 className="w-4 h-4" /> You joined {done}.
        </p>
      )}
    </form>
  );
}

function PrivacyCard({ me, onChange }: { me: AuthUser; onChange: (u: AuthUser) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const withdraw = async () => {
    if (!window.confirm('Withdraw consent? Expression analysis stops and your saved expression photos and face templates are deleted.')) return;
    setBusy(true);
    try {
      await api.setConsent(false);
      onChange({ ...me, consent_given: false, consent_timestamp: null });
      setNote('Consent withdrawn. Your photos and face templates were deleted.');
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : 'Could not withdraw consent.');
    }
    setBusy(false);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          me.consent_given ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {me.consent_given ? <ShieldCheck className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900">Camera &amp; expression analysis</p>
        <p className="text-xs text-slate-500">
          {me.consent_given
            ? `You gave consent${me.consent_timestamp ? ` on ${dateTime(me.consent_timestamp)}` : ''}. No video is recorded; only expression labels, attention and one photo per expression are kept.`
            : 'You have not given consent. You will be asked when you join a class.'}
        </p>
        {note && <p className="text-xs text-emerald-600 mt-1">{note}</p>}
      </div>
      {me.consent_given && (
        <button
          onClick={withdraw}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Withdraw consent
        </button>
      )}
    </section>
  );
}
