'use client';

import React from 'react';
import { ExternalLink, FolderOpen, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useDashboardStore } from '@/lib/store';
import { sendInstructorAction } from '@/lib/websocket';
import { useLogout } from '@/lib/useLogout';
import { wsBase } from '@/lib/config';
import { Avatar } from '@/components/dashboard/Avatar';
import { Card, PageTitle } from './ui';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

export function SettingsView() {
  const { user, session, modelStatus, demoEnabled, connection } = useDashboardStore();
  const { logout, loggingOut } = useLogout();

  return (
    <div className="space-y-4 max-w-3xl">
      <PageTitle title="Settings" subtitle="Account, telemetry and AI model configuration" />

      <Card title="Account">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={user?.name || 'Instructor'} src={user?.avatar_url} className="w-12 h-12 rounded-full" imgClassName="object-cover" />
            <div>
              <p className="text-sm font-bold text-slate-900">{user?.display_title || user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email || user?.username} · <span className="capitalize">{user?.role}</span></p>
            </div>
          </div>
          <button onClick={logout} disabled={loggingOut} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 disabled:opacity-60">
            <LogOut className="w-3.5 h-3.5" /> {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </Card>

      <Card title="Demo telemetry" subtitle="Simulate enrolled students who are not streaming a webcam">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-600 max-w-md">
            When on, students without a live camera produce realistic simulated telemetry so the dashboard stays
            populated. Students who join through the Student Portal always use their real webcam instead. Turn this
            off to see only real data.
          </p>
          <Toggle checked={demoEnabled} disabled={connection !== 'open'} onChange={(v) => sendInstructorAction('set_simulation', { enabled: v })} />
        </div>
      </Card>

      <Card title="AI model">
        <dl className="grid grid-cols-2 gap-4 text-xs">
          <div><dt className="text-slate-500">Model</dt><dd className="font-semibold text-slate-800 mt-0.5 break-words">{modelStatus.model_name}</dd></div>
          <div><dt className="text-slate-500">Type</dt><dd className="font-semibold text-slate-800 mt-0.5">{modelStatus.custom_model ? 'Custom ONNX' : 'None - no predictions are made'}</dd></div>
          <div><dt className="text-slate-500">Latency</dt><dd className="font-semibold text-slate-800 mt-0.5">{modelStatus.custom_model && modelStatus.latency_ms ? `${modelStatus.latency_ms} ms / frame` : '—'}</dd></div>
          <div><dt className="text-slate-500">Status</dt><dd className="font-semibold text-slate-800 mt-0.5">{modelStatus.status}</dd></div>
        </dl>
        <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-600 bg-blue-50 border border-blue-100 rounded-xl p-3">
          <FolderOpen className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span>
            To use your trained model, place the <code className="font-mono">.onnx</code> file in{' '}
            <code className="font-mono">backend/inference/models/</code>. It is detected automatically (no restart) and
            this card switches to &ldquo;Custom ONNX&rdquo;. Expected input <code className="font-mono">[1,3,224,224]</code>,
            output 3 logits (positive, neutral, negative).
          </span>
        </div>
      </Card>

      <Card title="Connection & session">
        <dl className="grid grid-cols-2 gap-4 text-xs">
          <div><dt className="text-slate-500">Instructor socket</dt><dd className="font-semibold text-slate-800 mt-0.5 capitalize">{connection}</dd></div>
          <div><dt className="text-slate-500">Endpoint</dt><dd className="font-mono text-slate-800 mt-0.5 break-all">{wsBase()}/ws/instructor/{session?.id ?? '…'}/</dd></div>
        </dl>
        <Link
          href="/student"
          target="_blank"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
        >
          Open the Student Webcam Portal <ExternalLink className="w-3 h-3" />
        </Link>
      </Card>
    </div>
  );
}
