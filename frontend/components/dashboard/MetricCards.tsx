'use client';

import React from 'react';
import { Users, Smile, Meh, Frown, Target, ArrowUp, ArrowDown } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { concentrationLabel } from '@/lib/format';

export function MetricCards() {
  const { snapshot, previousSnapshot, students } = useDashboardStore();
  const onlineCount = students.filter((s) => s.online).length;
  const quality = concentrationLabel(snapshot.avg_concentration);
  // Arrows compare against the previous aggregation; hidden until one exists
  const posUp = previousSnapshot ? snapshot.positive_pct >= previousSnapshot.positive_pct : null;
  const negUp = previousSnapshot ? snapshot.negative_pct > previousSnapshot.negative_pct : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
      {/* 1. Total Students */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-500/20">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Total Students</p>
          <p className="text-2xl font-bold text-slate-900 leading-tight">
            {students.length || snapshot.total_students}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-semibold text-emerald-600">{onlineCount} Online</span>
          </div>
        </div>
      </div>

      {/* 2. Positive */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-emerald-500/20">
          <Smile className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Positive</p>
          <div className="flex items-center gap-1">
            <p className="text-2xl font-bold text-slate-900 leading-tight">
              {snapshot.positive_pct}%
            </p>
            {posUp !== null &&
              (posUp ? <ArrowUp className="w-4 h-4 text-emerald-600" /> : <ArrowDown className="w-4 h-4 text-amber-500" />)}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-0.5">
            {snapshot.positive_count}
          </p>
        </div>
      </div>

      {/* 3. Neutral */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-full bg-amber-400 flex items-center justify-center text-white shrink-0 shadow-md shadow-amber-400/20">
          <Meh className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Neutral</p>
          <p className="text-2xl font-bold text-slate-900 leading-tight">
            {snapshot.neutral_pct}%
          </p>
          <p className="text-[11px] font-medium text-slate-400 mt-0.5">
            {snapshot.neutral_count}
          </p>
        </div>
      </div>

      {/* 4. Negative */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-full bg-rose-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-rose-500/20">
          <Frown className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Negative</p>
          <div className="flex items-center gap-1">
            <p className="text-2xl font-bold text-slate-900 leading-tight">
              {snapshot.negative_pct}%
            </p>
            {negUp !== null &&
              (negUp ? <ArrowUp className="w-4 h-4 text-rose-500" /> : <ArrowDown className="w-4 h-4 text-emerald-600" />)}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-0.5">
            {snapshot.negative_count}
          </p>
        </div>
      </div>

      {/* 5. Avg Concentration */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5 col-span-2 md:col-span-1">
        <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-600/20">
          <Target className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Avg. Concentration</p>
          <p className="text-2xl font-bold text-slate-900 leading-tight">
            {snapshot.avg_concentration}%
          </p>
          <span className={`inline-block mt-0.5 text-[11px] font-semibold ${quality.className}`}>
            {quality.text}
          </span>
        </div>
      </div>
    </div>
  );
}

