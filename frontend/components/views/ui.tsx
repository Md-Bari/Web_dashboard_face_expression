'use client';

import React from 'react';

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
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
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

export const EMOTION_STYLES = {
  positive: { pill: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', color: '#10B981' },
  neutral: { pill: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400', color: '#F59E0B' },
  negative: { pill: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500', color: '#EF4444' },
} as const;

export function EmotionPill({ emotion }: { emotion: keyof typeof EMOTION_STYLES }) {
  const style = EMOTION_STYLES[emotion] ?? EMOTION_STYLES.neutral;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${style.pill}`}>{emotion}</span>
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
