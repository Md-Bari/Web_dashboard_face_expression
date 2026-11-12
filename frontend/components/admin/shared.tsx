'use client';

import React from 'react';
import { Search } from 'lucide-react';

/** "5 min ago", "yesterday 14:02", or a date */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const then = new Date(iso);
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.round(seconds / 86_400)} d ago`;
  return then.toLocaleDateString([], { dateStyle: 'medium' });
}

export function fullTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : '';
}

const ROLE_PILL: Record<string, string> = {
  admin: 'bg-violet-50 text-violet-700 border-violet-200',
  instructor: 'bg-blue-50 text-blue-700 border-blue-200',
  student: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function RolePill({ role }: { role: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${ROLE_PILL[role] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
      {role || 'unknown'}
    </span>
  );
}

const DANGER = new Set(['login_failed', 'account_disabled', 'course_deleted', 'session_deleted', 'student_removed', 'consent_revoked']);
const GOOD = new Set(['login', 'instructor_created', 'account_enabled', 'register', 'session_started']);

export function ActionText({ action, label }: { action: string; label: string }) {
  const tone = DANGER.has(action) ? 'text-rose-600' : GOOD.has(action) ? 'text-emerald-700' : 'text-slate-800';
  return <span className={`font-semibold ${tone}`}>{label}</span>;
}

export function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Disabled
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative">
      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-3 py-1.5 w-44 sm:w-60 rounded-lg border border-slate-200 bg-white text-xs focus:outline-hidden focus:border-blue-500"
      />
    </label>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">{message}</p> : null;
}

export function errorText(e: unknown, fallback = 'Something went wrong.') {
  return e instanceof Error ? e.message : fallback;
}

/** Re-run `fn` whenever `deps` change, debounced (for search boxes) */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const th = 'px-3 py-2 text-left text-[11px] font-semibold text-slate-500 whitespace-nowrap';
export const td = 'px-3 py-2.5 text-xs text-slate-700 align-top';
