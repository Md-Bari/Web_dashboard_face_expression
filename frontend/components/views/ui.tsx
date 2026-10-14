'use client';

import React from 'react';
import { emotionMeta, type EmotionType } from '@/lib/emotions';

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-100 p-4 shadow-xs ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1 basis-48">
            {title && <h2 className="text-sm font-bold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'slate' }: { label: string; value: React.ReactNode; hint?: string; tone?: 'slate' | 'green' | 'amber' | 'rose' | 'blue' }) {
  const tones = {
    slate: 'text-slate-900',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    blue: 'text-blue-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-2xl font-bold leading-tight mt-0.5 ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export function EmotionPill({ emotion }: { emotion: EmotionType }) {
  const meta = emotionMeta(emotion);
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.pill}`}>
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

export function AttentionBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-slate-600 w-8 text-right">{pct}%</span>
    </div>
  );
}
