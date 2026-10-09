'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, type PieLabelRenderProps } from 'recharts';
import { useDashboardStore } from '@/lib/store';

export function SentimentDonut() {
  const { snapshot } = useDashboardStore();

  const data = [
    { name: 'Positive', value: snapshot.positive_count, pct: snapshot.positive_pct, color: '#10B981' },
    { name: 'Neutral', value: snapshot.neutral_count, pct: snapshot.neutral_pct, color: '#F59E0B' },
    { name: 'Negative', value: snapshot.negative_count, pct: snapshot.negative_pct, color: '#EF4444' },
  ];

  const renderCustomLabel = (props: PieLabelRenderProps) => {
    const cx = Number(props.cx);
    const cy = Number(props.cy);
    const midAngle = Number(props.midAngle);
    const innerRadius = Number(props.innerRadius);
    const outerRadius = Number(props.outerRadius);
    const pct = (props.percent ?? 0) * 100;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-[11px] font-bold"
      >
        {`${Math.round(pct)}%`}
      </text>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
      <h3 className="text-sm font-bold text-slate-900 mb-2">Sentiment Distribution</h3>

      <div className="flex items-center justify-between">
        {/* Donut Chart */}
        <div className="w-[140px] h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={65}
                paddingAngle={2}
                dataKey="value"
                labelLine={false}
                isAnimationActive={false}
                label={renderCustomLabel}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend with Counts */}
        <div className="space-y-2 pr-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-emerald-500 shrink-0"></span>
            <span className="font-semibold text-slate-700">Positive</span>
            <span className="text-slate-500 font-medium ml-auto">
              {snapshot.positive_pct}% ({snapshot.positive_count})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-amber-400 shrink-0"></span>
            <span className="font-semibold text-slate-700">Neutral</span>
            <span className="text-slate-500 font-medium ml-auto">
              {snapshot.neutral_pct}% ({snapshot.neutral_count})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-rose-500 shrink-0"></span>
            <span className="font-semibold text-slate-700">Negative</span>
            <span className="text-slate-500 font-medium ml-auto">
              {snapshot.negative_pct}% ({snapshot.negative_count})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

