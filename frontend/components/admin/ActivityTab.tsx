'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ActivityPage } from '@/lib/types';
import { Card, PageTitle } from '@/components/views/ui';
import { ActionText, ago, ErrorNote, errorText, fullTime, RolePill, SearchBox, td, th, useDebounced } from './shared';

const REFRESH_MS = 15_000;

export interface LogFilter {
  role: string;
  action: string;
  user?: { id: number; name: string };
}

const select = 'h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-hidden focus:border-blue-500';

export function ActivityTab({ filter, onFilter: setFilter }: { filter: LogFilter; onFilter: (f: LogFilter) => void }) {
  const [data, setData] = useState<ActivityPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQueryText] = useState('');
  const q = useDebounced(query);
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);

  // A new filter or search starts at the first page
  const onFilter = (f: LogFilter) => {
    setPage(1);
    setFilter(f);
  };
  const setQuery = (v: string) => {
    setPage(1);
    setQueryText(v);
  };

  // Loading while the newest request has not answered yet
  const requestKey = JSON.stringify([filter.role, filter.action, filter.user?.id, q, page, tick]);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  const loading = answeredKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    api
      .adminLogs({ role: filter.role, action: filter.action, user: filter.user?.id, q, page })
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(errorText(e, 'Could not load the log')))
      .finally(() => !cancelled && setAnsweredKey(requestKey));
    return () => {
      cancelled = true;
    };
  }, [filter.role, filter.action, filter.user?.id, q, page, tick, requestKey]);

  // New entries appear on their own while the first page is open
  useEffect(() => {
    if (page !== 1) return;
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Activity log"
        subtitle={data ? `${data.total.toLocaleString()} entr${data.total === 1 ? 'y' : 'ies'} · newest first` : 'Everything instructors and students do'}
        action={
          <button
            onClick={() => setTick((t) => t + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <select value={filter.role} onChange={(e) => onFilter({ ...filter, role: e.target.value })} className={select} aria-label="Role">
          <option value="">Everyone</option>
          <option value="instructor">Instructors</option>
          <option value="student">Students</option>
          <option value="admin">Admins</option>
          <option value="unknown">Unknown (failed sign-ins)</option>
        </select>
        <select value={filter.action} onChange={(e) => onFilter({ ...filter, action: e.target.value })} className={select} aria-label="Action">
          <option value="">All actions</option>
          {data &&
            Object.entries(data.actions).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </select>
        <SearchBox value={query} onChange={setQuery} placeholder="Search name, detail or IP" />
        {filter.user && (
          <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-semibold text-blue-700">
            Only {filter.user.name}
            <button onClick={() => onFilter({ ...filter, user: undefined })} aria-label="Show everyone" className="p-0.5 rounded-full hover:bg-blue-100">
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
      </div>

      <ErrorNote message={error} />

      <Card className="p-0! overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className={th}>When</th>
                <th className={th}>Who</th>
                <th className={th}>Role</th>
                <th className={th}>Action</th>
                <th className={th}>Detail</th>
                <th className={th}>IP address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.results.map((e) => (
                <tr key={e.id}>
                  <td className={`${td} whitespace-nowrap`} title={fullTime(e.created_at)}>
                    <p>{ago(e.created_at)}</p>
                    <p className="text-[10px] text-slate-400">{new Date(e.created_at).toLocaleTimeString()}</p>
                  </td>
                  <td className={td}>
                    {e.user_id ? (
                      <button
                        onClick={() => onFilter({ ...filter, user: { id: e.user_id!, name: e.name } })}
                        className="font-semibold text-slate-900 hover:text-blue-600 text-left"
                        title="Show only this person"
                      >
                        {e.name}
                      </button>
                    ) : (
                      <span className="font-semibold text-slate-500">{e.username || '(empty)'}</span>
                    )}
                    {e.name !== e.username && e.username && <p className="text-[10px] font-mono text-slate-400">{e.username}</p>}
                  </td>
                  <td className={td}>
                    <RolePill role={e.role} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <ActionText action={e.action} label={e.label} />
                  </td>
                  <td className={`${td} max-w-[320px] break-words`}>{e.detail || <span className="text-slate-300">–</span>}</td>
                  <td className={`${td} font-mono text-[11px]`} title={e.user_agent}>
                    {e.ip_address || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.results.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No activity matches.</p>}
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
            aria-label="Newer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          Page {page} of {pages}
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
            aria-label="Older"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
