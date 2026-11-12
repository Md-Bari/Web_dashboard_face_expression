'use client';

import React, { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { api } from '@/lib/api';
import type { AdminOverview } from '@/lib/types';
import { Card, PageTitle, Stat } from '@/components/views/ui';
import { ActionText, ago, ErrorNote, errorText, fullTime, RolePill } from './shared';

const REFRESH_MS = 15_000;

export function OverviewTab({ onShowLog }: { onShowLog: () => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pull = () =>
      api
        .adminOverview()
        .then((d) => !cancelled && (setData(d), setError(null)))
        .catch((e) => !cancelled && setError(errorText(e, 'Could not load the overview')));
    pull();
    const timer = setInterval(pull, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const c = data?.counts;
  return (
    <div className="space-y-4">
      <PageTitle title="Overview" subtitle="Everyone on EMP-EDU right now · refreshes every 15 seconds" />
      <ErrorNote message={error} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Instructors" value={c ? c.instructors : '–'} hint={c ? `${c.active_instructors} active` : undefined} tone="blue" />
        <Stat label="Students" value={c ? c.students : '–'} tone="green" />
        <Stat label="Classes · sessions" value={c ? `${c.courses} · ${c.sessions}` : '–'} />
        <Stat label="Live now" value={c ? c.live_sessions : '–'} tone={c?.live_sessions ? 'rose' : 'slate'} />
        <Stat label="Sign-ins (24 h)" value={c ? c.logins_24h : '–'} />
        <Stat
          label="Failed sign-ins (24 h)"
          value={c ? c.failed_logins_24h : '–'}
          tone={c?.failed_logins_24h ? 'amber' : 'slate'}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Live classes" subtitle="Sessions running right now, across all instructors">
          {data && data.live_sessions.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No class is live.</p>}
          <ul className="divide-y divide-slate-100">
            {data?.live_sessions.map((s) => (
              <li key={s.id} className="py-2.5 flex items-start gap-3">
                <Radio className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{s.title}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {s.course} · {s.instructor}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-slate-700">{s.attendees} students</p>
                  <p className="text-[11px] text-slate-400" title={fullTime(s.started_at)}>
                    started {ago(s.started_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Latest activity"
          action={
            <button onClick={onShowLog} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              Full log →
            </button>
          }
        >
          {data && data.recent_activity.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Nothing yet.</p>}
          <ul className="divide-y divide-slate-100">
            {data?.recent_activity.map((e) => (
              <li key={e.id} className="py-2 flex items-start gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-semibold text-slate-900">{e.name || '(unknown)'}</span> <RolePill role={e.role} />{' '}
                    <ActionText action={e.action} label={e.label} />
                  </p>
                  {e.detail && <p className="text-[11px] text-slate-500 truncate">{e.detail}</p>}
                </div>
                <span className="text-[11px] text-slate-400 shrink-0" title={fullTime(e.created_at)}>
                  {ago(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
