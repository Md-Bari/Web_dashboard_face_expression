'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useDashboardStore } from '@/lib/store';
import { EMOTIONS, EMOTION_META } from '@/lib/emotions';

export function SentimentDonut() {
  const { snapshot } = useDashboardStore();

  const data = EMOTIONS.map((emotion) => ({
    name: EMOTION_META[emotion].label,
    value: snapshot.emotion_counts[emotion] ?? 0,
    pct: snapshot.emotion_pcts[emotion] ?? 0,
    color: EMOTION_META[emotion].color,
  }));
  const slices = data.filter((d) => d.value > 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
      <h3 className="text-sm font-bold text-slate-900 mb-2">Expression Distribution</h3>

      <div className="flex items-center justify-between gap-3">
        <div className="relative w-[140px] h-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices.length ? slices : [{ name: 'No data', value: 1, pct: 0, color: '#E2E8F0' }]}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                paddingAngle={slices.length > 1 ? 2 : 0}
                dataKey="value"
                isAnimationActive={false}
              >
                {(slices.length ? slices : [{ color: '#E2E8F0' }]).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                ))}
              </Pie>
              {slices.length > 0 && (
                <Tooltip
                  formatter={(value, name, item) => [`${item.payload.pct}% (${value})`, name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E2E8F0' }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-slate-900 leading-none">{snapshot.total_students}</span>
            <span className="text-[10px] text-slate-500">faces</span>
          </div>
        </div>

        {/* Legend carries identity and values, so colour is never the only cue */}
        <ul className="flex-1 space-y-1.5 text-xs">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs shrink-0" style={{ backgroundColor: d.color }}></span>
              <span className="font-semibold text-slate-700">{d.name}</span>
              <span className="text-slate-500 font-medium ml-auto tabular-nums">
                {d.pct}% ({d.value})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
