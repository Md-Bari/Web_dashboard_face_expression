'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { homeFor, safeNext } from '@/lib/roles';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useDashboardStore((s) => s.setUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where to go after signing in: a ?next= link (e.g. a class join link) or the role's home
  const destination = (role: Parameters<typeof homeFor>[0]) =>
    safeNext(new URLSearchParams(window.location.search).get('next')) ?? homeFor(role);

  // Already signed in: go straight on
  useEffect(() => {
    api
      .me()
      .then((me) => router.replace(destination(me.role)))
      .catch(() => undefined);
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(username.trim(), password);
      setUser(user);
      router.replace(destination(user.role));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        setError('Incorrect username or password.');
      } else {
        setError('Cannot reach the server. Is the backend running?');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center bg-canvas p-6 overflow-hidden">
      {/* Soft brand glow behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-gradient-to-b from-blue-200/50 via-indigo-100/40 to-transparent blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/25">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900 tracking-tight">Sign in to EMP-EDU</h1>
          <p className="mt-1 text-[13px] text-slate-500">Instructors, students and admins</p>
        </div>
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1.5 w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:outline-hidden focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1.5 w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:outline-hidden focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
          </label>

          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 h-10 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
      </div>
    </main>
  );
}
