'use client';

import React, { useState } from 'react';
import { Check, FolderOpen, Loader2, LogOut } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { useLogout } from '@/lib/useLogout';
import { Avatar } from '@/components/dashboard/Avatar';
import { BLOOD_GROUPS, type AuthUser, type BloodGroup } from '@/lib/types';
import { Card, PageTitle } from './ui';

const input =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-blue-500';
const label = 'text-xs font-semibold text-slate-700';

export function SettingsView() {
  const { user, modelStatus } = useDashboardStore();
  const { logout, loggingOut } = useLogout();

  return (
    <div className="space-y-4 max-w-3xl">
      <PageTitle title="Settings" subtitle="Your profile and the AI model" />

      <Card title="Profile">
        <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              name={user?.display_title || user?.name || 'Instructor'}
              src={user?.avatar_url}
              className="w-12 h-12 rounded-full"
              imgClassName="object-cover"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{user?.display_title || user?.name}</p>
              <p className="text-xs text-slate-500 truncate">
                {user?.email || user?.username} · <span className="capitalize">{user?.role}</span>
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 disabled:opacity-60"
          >
            <LogOut className="w-3.5 h-3.5" /> {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
        {user && <ProfileForm key={user.id} user={user} />}
      </Card>

      <Card title="AI model">
        <dl className="grid grid-cols-2 gap-4 text-xs">
          <div><dt className="text-slate-500">Model</dt><dd className="font-semibold text-slate-800 mt-0.5 break-words">{modelStatus.custom_model ? 'Facial expression AI (6 expressions)' : 'None'}</dd></div>
          <div><dt className="text-slate-500">Type</dt><dd className="font-semibold text-slate-800 mt-0.5">{modelStatus.custom_model ? 'Custom ONNX' : 'None - no predictions are made'}</dd></div>
          <div><dt className="text-slate-500">Latency</dt><dd className="font-semibold text-slate-800 mt-0.5">{modelStatus.custom_model && modelStatus.latency_ms ? `${modelStatus.latency_ms} ms / frame` : '—'}</dd></div>
          <div><dt className="text-slate-500">Status</dt><dd className="font-semibold text-slate-800 mt-0.5">{modelStatus.status}</dd></div>
        </dl>
        <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-600 bg-blue-50 border border-blue-100 rounded-xl p-3">
          <FolderOpen className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span>
            Models are loaded from <code className="font-mono">backend/inference/models/</code> as described by{' '}
            <code className="font-mono">deployment_metadata.json</code>: YuNet finds the face, the expression ensemble
            classifies it into six expressions (happy, surprise, neutral, fear, sad, angry). Attention is measured
            from head pose.
            Replaced files are picked up automatically (no restart).
          </span>
        </div>
      </Card>
    </div>
  );
}

/** Edit your own name, title, e-mail and personal details (visible only to you). */
function ProfileForm({ user }: { user: AuthUser }) {
  const setUser = useDashboardStore((s) => s.setUser);
  const [form, setForm] = useState({
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    display_title: user.display_title ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    date_of_birth: user.date_of_birth ?? '',
    blood_group: (user.blood_group ?? '') as BloodGroup | '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setSaved(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        display_title: form.display_title.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        date_of_birth: form.date_of_birth || null,
        blood_group: form.blood_group,
      });
      setUser(updated); // the header shows the new name right away
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className={label}>First name *</span>
          <input value={form.first_name} onChange={set('first_name')} required maxLength={150} autoComplete="given-name" className={input} />
        </label>
        <label className="block">
          <span className={label}>Last name</span>
          <input value={form.last_name} onChange={set('last_name')} maxLength={150} autoComplete="family-name" className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Title shown on the dashboard</span>
          <input
            value={form.display_title}
            onChange={set('display_title')}
            maxLength={100}
            placeholder="e.g. Dr. Rahman (leave empty to show your full name)"
            className={input}
          />
        </label>
        <label className="block">
          <span className={label}>Email</span>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" className={input} />
        </label>
        <label className="block">
          <span className={label}>Phone number</span>
          <input
            type="tel"
            value={form.phone}
            onChange={set('phone')}
            maxLength={20}
            placeholder="+8801712345678"
            autoComplete="tel"
            className={input}
          />
        </label>
        <label className="block">
          <span className={label}>Date of birth</span>
          <input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} max={today} min="1900-01-01" className={input} />
        </label>
        <label className="block">
          <span className={label}>Blood group</span>
          <select value={form.blood_group} onChange={set('blood_group')} className={input}>
            <option value="">Not set</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[11px] text-slate-400">
        Your phone number, date of birth and blood group are visible only to you (and system admins); students never see them.
      </p>
      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2.5">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save profile
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <Check className="w-4 h-4" /> Profile saved
          </span>
        )}
      </div>
    </form>
  );
}
