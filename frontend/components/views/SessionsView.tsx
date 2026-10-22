'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, CalendarPlus, Check, LayoutDashboard, Link2, Loader2, Play, Square, Trash2, Video } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { copyText, meetingLink } from '@/lib/clipboard';
import { closePendingTab, openPendingTab, showMeeting } from '@/lib/classTab';
import type { CourseInfo, SessionInfo } from '@/lib/types';
import { Card, PageTitle } from './ui';

const input = 'rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-hidden focus:border-blue-500';
const primary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50';
const secondary =
  'inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;

/** Schedule and run class sessions; each has a meeting link for its class / sections. */
export function SessionsView({ onOpenSession }: { onOpenSession: (id: number, tab?: 'Dashboard' | 'Reports') => void }) {
  const { catalogVersion, bumpCatalog, session: current } = useDashboardStore();
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [classFilter, setClassFilter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [courseList, sessionList] = await Promise.all([api.courses(), api.sessions({ course: classFilter })]);
      setCourses(courseList);
      setSessions(sessionList);
    } catch (e) {
      setError(message(e, 'Could not load the sessions.'));
    }
  }, [classFilter]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load, catalogVersion]);

  const act = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      bumpCatalog();
      if (current?.id === id) onOpenSession(id); // refresh the dashboard's copy
    } catch (e) {
      setError(message(e, 'That did not work.'));
    }
    setBusyId(null);
  };

  const groups: [string, SessionInfo[]][] = sessions
    ? [
        ['Live now', sessions.filter((s) => s.status === 'LIVE')],
        ['Upcoming', sessions.filter((s) => s.status === 'SCHEDULED')],
        ['Past', sessions.filter((s) => s.status === 'ENDED')],
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageTitle
        title="Sessions"
        subtitle="Schedule a class for one or more sections and share its meeting link"
        action={
          <select
            value={classFilter ?? ''}
            onChange={(e) => setClassFilter(e.target.value ? Number(e.target.value) : null)}
            aria-label="Filter by class"
            className={input}
          >
            <option value="">All classes</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.title}
              </option>
            ))}
          </select>
        }
      />
      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4">
          <ScheduleForm
            courses={courses}
            onCreated={async (session, startNow) => {
              bumpCatalog();
              if (startNow) onOpenSession(session.id);
            }}
          />
        </div>

        <div className="xl:col-span-8 space-y-4">
          {sessions === null ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : sessions.length === 0 ? (
            <Card>
              <p className="py-10 text-center text-xs text-slate-500">No sessions yet. Schedule one on the left.</p>
            </Card>
          ) : (
            groups.map(
              ([label, list]) =>
                list.length > 0 && (
                  <Card key={label} title={`${label} (${list.length})`}>
                    <div className="divide-y divide-slate-100">
                      {list.map((s) => (
                        <SessionRow
                          key={s.id}
                          session={s}
                          busy={busyId === s.id}
                          isCurrent={current?.id === s.id}
                          onStart={() => {
                            // Start the class and open its meeting in a new tab (opened inside the click)
                            const tab = openPendingTab();
                            act(s.id, async () => {
                              try {
                                await api.startSession(s.id);
                              } catch (e) {
                                closePendingTab(tab);
                                throw e;
                              }
                              if (s.join_code) showMeeting(tab, s.join_code);
                              onOpenSession(s.id);
                            });
                          }}
                          onEnd={() => {
                            if (window.confirm(`End "${s.title}" for everyone?`)) act(s.id, () => api.endSession(s.id));
                          }}
                          onDelete={() => {
                            if (window.confirm(`Delete "${s.title}" and its analytics? This cannot be undone.`))
                              act(s.id, () => api.deleteSession(s.id));
                          }}
                          onOpen={(tab) => onOpenSession(s.id, tab)}
                        />
                      ))}
                    </div>
                  </Card>
                )
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SessionRow({
  session: s,
  busy,
  isCurrent,
  onStart,
  onEnd,
  onDelete,
  onOpen,
}: {
  session: SessionInfo;
  busy: boolean;
  isCurrent: boolean;
  onStart: () => void;
  onEnd: () => void;
  onDelete: () => void;
  onOpen: (tab?: 'Dashboard' | 'Reports') => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = s.join_code ? meetingLink(s.join_code) : null;
  const timing =
    s.status === 'LIVE'
      ? `Started ${when(s.started_at)}`
      : s.status === 'ENDED'
      ? `Ended ${when(s.ended_at)}`
      : s.scheduled_for
      ? `Scheduled for ${when(s.scheduled_for)}`
      : 'Not scheduled - start it when you are ready';

  return (
    <div role="group" aria-label={s.title} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <span className="truncate">{s.title}</span>
          {s.status === 'LIVE' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
            </span>
          )}
          {isCurrent && <span className="text-[10px] font-semibold text-blue-600">on dashboard</span>}
        </p>
        <p className="text-[11px] text-slate-500 truncate">
          {s.course?.code} · {s.course?.title} ·{' '}
          {s.sections && s.sections.length ? `Section ${s.sections.map((x) => x.name).join(', ')}` : 'Whole class'} ·{' '}
          {s.attendee_count ?? 0} student{s.attendee_count === 1 ? '' : 's'}
        </p>
        <p className="text-[11px] text-slate-400">{timing}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 shrink-0">
        {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400 self-center" />}
        {s.status !== 'ENDED' && link && (
          <>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className={s.status === 'LIVE' ? `${secondary} !bg-blue-600 !border-blue-600 !text-white hover:!bg-blue-700` : secondary}
            >
              <Video className="w-3.5 h-3.5" /> {s.status === 'LIVE' ? 'Join meeting' : 'Open meeting'}
            </a>
            <button
              onClick={async () => {
                if (await copyText(link)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } else window.prompt('Meeting link', link);
              }}
              className={secondary}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </>
        )}
        {s.status === 'SCHEDULED' && (
          <button onClick={onStart} disabled={busy} className={`${secondary} !bg-emerald-600 !border-emerald-600 !text-white hover:!bg-emerald-700`}>
            <Play className="w-3.5 h-3.5" /> Start class
          </button>
        )}
        {s.status === 'LIVE' && (
          <>
            <button onClick={() => onOpen('Dashboard')} className={secondary}>
              <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
            </button>
            <button onClick={onEnd} disabled={busy} className={`${secondary} text-rose-600`}>
              <Square className="w-3.5 h-3.5" /> End
            </button>
          </>
        )}
        {s.status === 'ENDED' && (
          <button onClick={() => onOpen('Reports')} className={secondary}>
            <BarChart3 className="w-3.5 h-3.5" /> Report
          </button>
        )}
        {s.status !== 'LIVE' && (
          <button onClick={onDelete} disabled={busy} className={`${secondary} text-slate-500`} aria-label={`Delete ${s.title}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ScheduleForm({
  courses,
  onCreated,
}: {
  courses: CourseInfo[];
  onCreated: (session: SessionInfo, startNow: boolean) => Promise<void>;
}) {
  const [courseId, setCourseId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [sectionIds, setSectionIds] = useState<number[]>([]);
  const [at, setAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const course = courses.find((c) => c.id === courseId) ?? courses[0] ?? null;
  const sections = course?.sections ?? [];

  const submit = async (startNow: boolean) => {
    if (!course || !title.trim()) return;
    // "Start now" opens the class meeting in a new tab; it must be opened inside the click
    const tab = startNow ? openPendingTab() : null;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const session = await api.scheduleSession({
        course_id: course.id,
        title: title.trim(),
        section_ids: sectionIds.filter((id) => sections.some((s) => s.id === id)),
        scheduled_for: at ? new Date(at).toISOString() : null,
      });
      if (startNow) {
        await api.startSession(session.id);
        if (session.join_code) showMeeting(tab, session.join_code);
      }
      await onCreated(session, startNow);
      setTitle('');
      setAt('');
      setDone(
        startNow
          ? `"${session.title}" is live - the class opened in a new tab.`
          : `"${session.title}" scheduled. Copy its meeting link from the list.`
      );
    } catch (e) {
      closePendingTab(tab);
      setError(message(e, 'Could not create the session.'));
    }
    setBusy(false);
  };

  if (!courses.length) {
    return (
      <Card title="Schedule a session">
        <p className="text-xs text-slate-500">Create a class first (Classes page).</p>
      </Card>
    );
  }

  return (
    <Card title="Schedule a session" subtitle="Students of the chosen sections get in with the meeting link">
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Class</span>
          <select
            value={course?.id ?? ''}
            onChange={(e) => {
              setCourseId(Number(e.target.value));
              setSectionIds([]);
            }}
            className={`${input} mt-1 w-full`}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lecture 5 - Trees"
            maxLength={200}
            className={`${input} mt-1 w-full`}
          />
        </label>
        <fieldset>
          <legend className="text-xs font-semibold text-slate-700">Sections</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sections.map((s) => {
              const on = sectionIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSectionIds((ids) => (on ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {s.name} <span className="font-normal opacity-75">({s.total_students})</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {sectionIds.length ? 'Only these sections can join.' : 'None selected: the whole class can join.'}
          </p>
        </fieldset>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Date &amp; time (optional)</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={`${input} mt-1 w-full`} />
        </label>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {done && <p className="text-xs text-emerald-700">{done}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => submit(false)} disabled={busy || !title.trim()} className={`${primary} !bg-white !text-blue-700 border border-blue-200 hover:!bg-blue-50`}>
            <CalendarPlus className="w-3.5 h-3.5" /> Schedule
          </button>
          <button onClick={() => submit(true)} disabled={busy || !title.trim()} className={primary}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Start class now
          </button>
        </div>
      </div>
    </Card>
  );
}
