'use client';

import React from 'react';
import { Users, Target, ArrowUp, ArrowDown } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { concentrationLabel } from '@/lib/format';
import { EMOTIONS, EMOTION_META } from '@/lib/emotions';

export function MetricCards() {
  const { snapshot, previousSnapshot, students } = useDashboardStore();
  const onlineCount = students.filter((s) => s.online).length;
  const quality = concentrationLabel(snapshot.avg_concentration);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
      {/* Total Students */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Students</p>
          <p className="text-xl font-bold text-slate-900 leading-tight">{students.length || snapshot.total_students}</p>
          <p className="text-[11px] font-semibold text-emerald-600">{onlineCount} online</p>
        </div>
      </div>

      {/* One tile per expression class; arrows compare with the previous aggregation */}
      {EMOTIONS.map((emotion) => {
        const meta = EMOTION_META[emotion];
        const Icon = meta.icon;
        const pct = snapshot.emotion_pcts[emotion] ?? 0;
        const prev = previousSnapshot?.emotion_pcts?.[emotion];
        return (
          <div key={emotion} className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: meta.color }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">{meta.label}</p>
              <div className="flex items-center gap-1">
                <p className="text-xl font-bold text-slate-900 leading-tight">{pct}%</p>
                {prev !== undefined && pct !== prev &&
                  (pct > prev ? (
                    <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                  ))}
              </div>
              <p className="text-[11px] font-medium text-slate-400">{snapshot.emotion_counts[emotion] ?? 0} students</p>
            </div>
          </div>
        );
      })}

      {/* Avg Concentration */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Concentration</p>
          <p className="text-xl font-bold text-slate-900 leading-tight">{snapshot.avg_concentration}%</p>
          <span className={`text-[11px] font-semibold ${quality.className}`}>{quality.text}</span>
        </div>
      </div>
    </div>
  );
}
