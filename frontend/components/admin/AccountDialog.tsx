'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { AccountChange, AdminAccount, NewInstructor } from '@/lib/types';
import { ErrorNote, errorText } from './shared';

const input =
  'mt-1 w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-hidden focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-100"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function SubmitRow({ busy, label, onCancel }: { busy: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-3 h-9 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-60"
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {label}
      </button>
    </div>
  );
}

/** New instructor account: they sign in on the normal login page with this username and password. */
export function CreateInstructorDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (a: AdminAccount) => void }) {
  const [form, setForm] = useState<NewInstructor>({ first_name: '', last_name: '', username: '', email: '', display_title: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof NewInstructor) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.adminCreateInstructor({
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        display_title: form.display_title.trim(),
      });
      onCreated(created);
    } catch (err) {
      setError(errorText(err, 'Could not create the account.'));
      setBusy(false);
    }
  };

  return (
    <Modal title="New instructor account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input value={form.first_name} onChange={set('first_name')} required className={input} />
          </Field>
          <Field label="Last name">
            <input value={form.last_name} onChange={set('last_name')} className={input} />
          </Field>
        </div>
        <Field label="Title (optional)" hint='Shown to students, e.g. "Dr. Rahman"'>
          <input value={form.display_title} onChange={set('display_title')} maxLength={100} className={input} />
        </Field>
        <Field label="Email (optional)">
          <input type="email" value={form.email} onChange={set('email')} className={input} />
        </Field>
        <Field label="Username" hint="Used to sign in. Letters, digits and . @ + - _">
          <input value={form.username} onChange={set('username')} required autoComplete="off" className={input} />
        </Field>
        <Field label="Password" hint="Share it with the instructor; they sign in on the normal login page.">
          <input type="text" value={form.password} onChange={set('password')} required autoComplete="new-password" className={input} />
        </Field>
        <ErrorNote message={error} />
        <SubmitRow busy={busy} label="Create account" onCancel={onClose} />
      </form>
    </Modal>
  );
}

/** Edit an instructor or student: details, a new password, or turn sign-in off/on. */
export function EditAccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: AdminAccount;
  onClose: () => void;
  onSaved: (a: AdminAccount) => void;
}) {
  const [form, setForm] = useState({
    first_name: account.first_name,
    last_name: account.last_name,
    email: account.email,
    display_title: account.display_title,
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (change: AccountChange) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.adminUpdateAccount(account.id, change));
    } catch (err) {
      setError(errorText(err, 'Could not save.'));
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const change: AccountChange = {};
    (['first_name', 'last_name', 'email', 'display_title'] as const).forEach((k) => {
      if (form[k].trim() !== account[k]) change[k] = form[k].trim();
    });
    if (form.password) change.password = form.password;
    if (!Object.keys(change).length) return onClose();
    save(change);
  };

  return (
    <Modal title={`Edit ${account.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[11px] text-slate-500">
          Username <b className="text-slate-700">{account.username}</b> · {account.role}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input value={form.first_name} onChange={set('first_name')} required className={input} />
          </Field>
          <Field label="Last name">
            <input value={form.last_name} onChange={set('last_name')} className={input} />
          </Field>
        </div>
        {account.role === 'instructor' && (
          <Field label="Title">
            <input value={form.display_title} onChange={set('display_title')} maxLength={100} className={input} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" value={form.email} onChange={set('email')} className={input} />
        </Field>
        <Field label="New password" hint="Leave empty to keep the current password.">
          <input type="text" value={form.password} onChange={set('password')} autoComplete="new-password" className={input} />
        </Field>
        <ErrorNote message={error} />
        <SubmitRow busy={busy} label="Save" onCancel={onClose} />
      </form>

      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          {account.is_active
            ? 'Disabling signs them out and stops them from signing in. Nothing is deleted.'
            : 'This account cannot sign in.'}
        </p>
        <button
          onClick={() => save({ is_active: !account.is_active })}
          disabled={busy}
          className={`shrink-0 px-3 h-8 rounded-lg text-xs font-semibold border disabled:opacity-60 ${
            account.is_active
              ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          {account.is_active ? 'Disable account' : 'Enable account'}
        </button>
      </div>
    </Modal>
  );
}
