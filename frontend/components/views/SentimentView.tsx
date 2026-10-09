'use client';

import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDashboardStore } from '@/lib/store';
import { formatClock } from '@/lib/format';
import { SentimentDonut } from '@/components/dashboard/SentimentDonut';
import { Avatar } from '@/components/dashboard/Avatar';
import type { EmotionType } from '@/lib/types';
import { Card, EMOTION_STYLES, PageTitle, Stat } from './ui';

const COLUMNS: { emotion: EmotionType; title: string; hint: string }[] = [
  { emotion: 'positive', title: 'Positive', hint: 'Happy, engaged' },
  { emotion: 'neutral', title: 'Neutral', hint: 'Calm, indifferent' },
  { emotion: 'negative', title: 'Negative', hint: 'Confused, bored, frustrated' },
];

const plural = (n: number) => `${n} student${n === 1 ? '' : 's'}`;

export function SentimentView() {
  const { snapshot, trend, students } = useDashboardStore();
  const data = trend.map((p) => ({ ...p, time: formatClock(p.timestamp) }));

  return (
    <div className="space-y-4">
      <PageTitle
        title="Sentiment Analysis"
        subtitle="Emotion classification smoothed over a 10-second rolling window"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Positive" value={`${snapshot.positive_pct}%`} hint={plural(snapshot.positive_count)} tone="green" />
        <Stat label="Neutral" value={`${snapshot.neutral_pct}%`} hint={plural(snapshot.neutral_count)} tone="amber" />
        <Stat label="Negative" value={`${snapshot.negative_pct}%`} hint={plural(snapshot.negative_count)} tone="rose" />
        <Stat label="Reporting students" value={snapshot.total_students} hint={`of ${students.length} enrolled`} tone="blue" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Card title="Sentiment Trend" subtitle="Share of students per sentiment, every aggregation cycle" className="xl:col-span-8">
          <div className="h-[260px]">
            {data.length < 2 ? (
              <p className="h-full flex items-center justify-center text-xs text-slate-400">Collecting data…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={50} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e2e8f0' }} formatter={(v) => `${v}%`} />
                  <Area type="monotone" dataKey="positive" stackId="1" stroke={EMOTION_STYLES.positive.color} fill={EMOTION_STYLES.positive.color} fillOpacity={0.7} isAnimationActive={false} />
                  <Area type="monotone" dataKey="neutral" stackId="1" stroke={EMOTION_STYLES.neutral.color} fill={EMOTION_STYLES.neutral.color} fillOpacity={0.7} isAnimationActive={false} />
                  <Area type="monotone" dataKey="negative" stackId="1" stroke={EMOTION_STYLES.negative.color} fill={EMOTION_STYLES.negative.color} fillOpacity={0.7} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <div className="xl:col-span-4">
          <SentimentDonut />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const members = students.filter((s) => s.has_data !== false && s.emotion === col.emotion);
          return (
            <Card key={col.emotion} title={`${col.title} (${members.length})`} subtitle={col.hint}>
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
