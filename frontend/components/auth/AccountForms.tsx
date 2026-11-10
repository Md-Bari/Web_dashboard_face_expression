'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api';

type Mode = 'signin' | 'register';

export interface RegisterData {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  password: string;
}

interface AccountFormsProps {
  /** Create a student account (and join); resolve when signed in */
  onRegister: (data: RegisterData) => Promise<void>;
  /** Sign in with an existing account; resolve when signed in */
  onSignIn: (username: string, password: string) => Promise<void>;
  /** When set, new accounts cannot be created here and this explains why */
  registerDisabledReason?: string | null;
  submitLabels?: { register: string; signin: string };
}

/** "Create account" / "I have an account" card used by invite links and meeting links. */
export function AccountForms({
  onRegister,
  onSignIn,
  registerDisabledReason = null,
  submitLabels = { register: 'Create account & join', signin: 'Sign in & join' },
}: AccountFormsProps) {
  const [mode, setMode] = useState<Mode>(registerDisabledReason ? 'signin' : 'register');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<RegisterData>({ first_name: '', last_name: '', username: '', email: '', password: '' });

  const set = (field: keyof RegisterData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await onRegister({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
        });
      } else {
        await onSignIn(form.username.trim(), form.password);
      }
    } catch (err) {
      if (err instanceof ApiError && mode === 'signin' && (err.status === 400 || err.status === 401)) {
        setError('Incorrect username or password.');
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many sign-ups from this network. Try again later.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Cannot reach the class server.');
      }
    }
    setBusy(false);
  };

  const input = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:border-blue-500';

  return (
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
              setError(null);
            }}
            className={`py-2 rounded-lg transition-colors ${mode === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'register' && registerDisabledReason ? (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">{registerDisabledReason}</p>
      ) : (
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
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              className={input}
            />
          </label>

          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'register' ? submitLabels.register : submitLabels.signin}
          </button>
        </form>
      )}
    </>
  );
}
