'use client';

import React from 'react';
import { Users, Target, ArrowUp, ArrowDown } from 'lucide-react';
import { useSectionView } from '@/lib/sections';
import { concentrationLabel } from '@/lib/format';
import { EMOTIONS, EMOTION_META } from '@/lib/emotions';

/** One KPI: label with a colour key, a big number, and a quiet hint line */
function Kpi({
  label,
  value,
  hint,
  hintClass = 'text-slate-400',
  dot,
  icon: Icon,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  hintClass?: string;
  dot?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="bg-white px-4 py-3.5 min-w-0">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 truncate">
        {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[24px] font-semibold tracking-tight text-slate-900 tabular-nums leading-none">{value}</span>
        {trend === 'up' && <ArrowUp className="w-3.5 h-3.5 text-slate-400" aria-label="up since last update" />}
        {trend === 'down' && <ArrowDown className="w-3.5 h-3.5 text-slate-400" aria-label="down since last update" />}
      </div>
      <p className={`mt-1 text-[12px] truncate ${hintClass}`}>{hint}</p>
    </div>
  );
}

export function MetricCards() {
  const { snapshot, previousSnapshot, students } = useSectionView();
  const onlineCount = students.filter((s) => s.online).length;
  const quality = concentrationLabel(snapshot.avg_concentration);

  return (
    // Hairline grid: the 1px gaps show the border colour between tiles
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-px bg-slate-200/80 rounded-xl border border-slate-200/80 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <Kpi
        label="Students"
        icon={Users}
        value={students.length || snapshot.total_students}
        hint={`${onlineCount} online`}
        hintClass="text-emerald-600 font-medium"
      />

      {/* One tile per expression; arrows compare with the previous aggregation */}
      {EMOTIONS.map((emotion) => {
        const meta = EMOTION_META[emotion];
        const pct = snapshot.emotion_pcts[emotion] ?? 0;
        const prev = previousSnapshot?.emotion_pcts?.[emotion];
        const n = snapshot.emotion_counts[emotion] ?? 0;
        return (
          <Kpi
            key={emotion}
            label={meta.label}
            dot={meta.color}
            value={`${pct}%`}
            trend={prev === undefined || pct === prev ? undefined : pct > prev ? 'up' : 'down'}
            hint={`${n} student${n === 1 ? '' : 's'}`}
          />
        );
      })}

      <Kpi
        label="Concentration"
        icon={Target}
        value={`${snapshot.avg_concentration}%`}
        hint={snapshot.total_students ? quality.text : 'No data yet'}
        hintClass={snapshot.total_students ? `font-medium ${quality.className}` : 'text-slate-400'}
      />
    </div>
  );
}
