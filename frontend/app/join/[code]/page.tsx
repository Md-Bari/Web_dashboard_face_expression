'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, GraduationCap, Loader2, Radio } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { AuthUser, JoinInfo } from '@/lib/types';

type Mode = 'signin' | 'register';

/**
 * Student join link shared by the instructor (/join/<course join code>).
 * Signed-in students are enrolled straight away; everyone else signs in or creates a
 * student account here, which also enrolls them, and then lands on the student portal.
 */
export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<AuthUser | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [mode, setMode] = useState<Mode>('register');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', email: '', password: '' });

  const goToPortal = (sessionId?: number) => router.replace(sessionId ? `/student?session=${sessionId}` : '/student');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const joinInfo = await api.joinInfo(code);
        if (cancelled) return;
        setInfo(joinInfo);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError && e.status === 404 ? 'This join link is not valid. Ask your instructor for a new one.' : 'Cannot reach the class server.');
        setCheckingUser(false);
        return;
      }
      try {
        const me = await api.me();
        if (cancelled) return;
        if (me.role !== 'student') {
          setStaff(me);
        } else {
          const joined = await api.joinEnroll(code);
          if (!cancelled) goToPortal(joined.live_session?.id);
          return;
        }
      } catch {
        // Not signed in: show the forms
      }
      if (!cancelled) setCheckingUser(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (mode === 'register') {
        const result = await api.joinRegister(code, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
        });
        goToPortal(result.live_session?.id);
      } else {
        const { user } = await api.login(form.username.trim(), form.password);
        if (user.role !== 'student') {
          setStaff(user);
          setBusy(false);
          return;
        }
        const joined = await api.joinEnroll(code);
        goToPortal(joined.live_session?.id);
      }
    } catch (err) {
      if (err instanceof ApiError && mode === 'signin' && (err.status === 400 || err.status === 401)) {
        setFormError('Incorrect username or password.');
      } else if (err instanceof ApiError && err.status === 429) {
        setFormError('Too many sign-ups from this network. Try again later.');
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Cannot reach the class server.');
      }
      setBusy(false);
    }
  };

  const input =
    'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:border-blue-500';

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0B1528] p-4 sm:p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 text-lg leading-tight truncate">
              {info ? `Join ${info.course.title}` : 'Join a class'}
            </h1>
            {info && (
              <p className="text-[11px] text-slate-500 truncate">
                {info.course.code} · {info.instructor}
              </p>
            )}
          </div>
        </div>

        {info && (
          <p
            className={`mb-5 flex items-center gap-2 text-xs font-medium rounded-xl px-3 py-2 border ${
              info.live_session
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 shrink-0 ${info.live_session ? 'animate-pulse' : ''}`} />
            {info.live_session ? `Live now: ${info.live_session.title}` : 'The class has not started yet - you can join and wait.'}
          </p>
        )}

        {error ? (
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            {error}
          </p>
        ) : checkingUser ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
        ) : staff ? (
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              You are signed in as <b>{staff.name}</b> ({staff.role}). This is the link students use to join the class;
              share it with them.
            </p>
            <Link
              href="/"
              className="block text-center w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl"
            >
              Go to the dashboard
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 p-1 mb-4 bg-slate-100 rounded-xl text-xs font-semibold">
              {(
                [
                  ['register', 'Create account'],
                  ['signin', 'I have an account'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setFormError(null);
                  }}
                  className={`py-2 rounded-lg transition-colors ${mode === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">First name</span>
                    <input value={form.first_name} onChange={set('first_name')} required autoComplete="given-name" className={input} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Last name</span>
                    <input value={form.last_name} onChange={set('last_name')} autoComplete="family-name" className={input} />
                  </label>
                </div>
              )}
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Username</span>
                <input
                  value={form.username}
                  onChange={set('username')}
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  className={input}
                />
              </label>
              {mode === 'register' && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Email (optional)</span>
                  <input type="email" value={form.email} onChange={set('email')} autoComplete="email" className={input} />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className={input}
                />
                {mode === 'register' && (
                  <span className="block mt-1 text-[11px] text-slate-400">At least 8 characters, not only numbers.</span>
                )}
              </label>

              {formError && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">{formError}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'register' ? 'Create account & join' : 'Sign in & join'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
