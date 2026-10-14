'use client';

import React from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDashboardStore } from '@/lib/store';
import { formatClock } from '@/lib/format';
import { SentimentDonut } from '@/components/dashboard/SentimentDonut';
import { Avatar } from '@/components/dashboard/Avatar';
import { EMOTIONS, EMOTION_META, type EmotionType } from '@/lib/emotions';
import { Card, PageTitle, Stat } from './ui';

const HINTS: Record<EmotionType, string> = {
  happy: 'Enjoying, engaged',
  surprise: 'Caught off guard by something new',
  neutral: 'Calm, listening',
  fear: 'Anxious, unsure',
  sad: 'Discouraged, low energy',
  angry: 'Frustrated',
};

const plural = (n: number) => `${n} student${n === 1 ? '' : 's'}`;

export function SentimentView() {
  const { snapshot, trend, students } = useDashboardStore();
  const data = trend.map((p) => ({ ...p, time: formatClock(p.timestamp) }));

  return (
    <div className="space-y-4">
      <PageTitle
        title="Expression Analysis"
        subtitle="Emotion classification smoothed over a 10-second rolling window"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {EMOTIONS.map((emotion) => {
          const meta = EMOTION_META[emotion];
          const Icon = meta.icon;
          return (
            <div key={emotion} className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-xs">
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} /> {meta.label}
              </p>
              <p className="text-2xl font-bold leading-tight mt-0.5 text-slate-900">{snapshot.emotion_pcts[emotion] ?? 0}%</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{plural(snapshot.emotion_counts[emotion] ?? 0)}</p>
            </div>
          );
        })}
        <Stat label="Reporting" value={snapshot.total_students} hint={`faces · ${students.length} listed`} tone="blue" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Card title="Expression Trend" subtitle="Share of students per expression, every aggregation cycle" className="xl:col-span-8">
          <div className="h-[280px]">
            {data.length < 2 ? (
              <p className="h-full flex items-center justify-center text-xs text-slate-400">Collecting data…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={50} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e2e8f0' }} formatter={(v) => `${v}%`} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#475569' }} />
                  {/* Stack order matches the validated palette order; white strokes keep a gap between bands */}
                  {EMOTIONS.map((emotion) => (
                    <Area
                      key={emotion}
                      type="monotone"
                      dataKey={emotion}
                      name={EMOTION_META[emotion].label}
                      stackId="1"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      fill={EMOTION_META[emotion].color}
                      fillOpacity={0.85}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <div className="xl:col-span-4">
          <SentimentDonut />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {EMOTIONS.map((emotion) => {
          const members = students.filter((s) => s.has_data !== false && s.emotion === emotion);
          return (
            <Card key={emotion} title={`${EMOTION_META[emotion].label} (${members.length})`} subtitle={HINTS[emotion]}>
              <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {members.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <Avatar name={s.name} src={s.avatar_url} className="w-6 h-6 rounded-full text-[9px]" imgClassName="object-cover" />
                      <span className="truncate font-medium text-slate-700">{s.name}</span>
                    </span>
                    <span className="font-mono text-slate-400">{Math.round(s.confidence * 100)}%</span>
                  </li>
                ))}
                {members.length === 0 && <li className="text-xs text-slate-400 py-4 text-center">Nobody right now</li>}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
