'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Loader2, Video } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { homeFor } from '@/lib/roles';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useDashboardStore((s) => s.setUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in: go straight to the page for this role
  useEffect(() => {
    api
      .me()
      .then((me) => router.replace(homeFor(me.role)))
      .catch(() => undefined);
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(username.trim(), password);
      setUser(user);
      router.replace(homeFor(user.role));
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
    <main className="min-h-screen flex items-center justify-center bg-[#0B1528] p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight">EMP-EDU</h1>
            <p className="text-[11px] text-blue-600 font-medium">Sign in - instructors, students and admins</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:border-blue-500"
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
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:border-blue-500"
            />
          </label>

          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <Link
          href="/student"
          className="mt-5 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600"
        >
          <Video className="w-3.5 h-3.5" /> Join as a guest student (no account)
        </Link>
      </div>
    </main>
  );
}
