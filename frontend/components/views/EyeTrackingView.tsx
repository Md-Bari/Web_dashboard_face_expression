'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDashboardStore } from '@/lib/store';
import { formatClock } from '@/lib/format';
import { Avatar } from '@/components/dashboard/Avatar';
import { AttentionBar, Card, PageTitle, Stat } from './ui';

const BINS = [
  { label: '0-20%', min: 0, max: 0.2, color: '#EF4444' },
  { label: '20-40%', min: 0.2, max: 0.4, color: '#F97316' },
  { label: '40-60%', min: 0.4, max: 0.6, color: '#F59E0B' },
  { label: '60-80%', min: 0.6, max: 0.8, color: '#84CC16' },
  { label: '80-100%', min: 0.8, max: 1.01, color: '#10B981' },
];

export function EyeTrackingView() {
  const { snapshot, students } = useDashboardStore();
  const reporting = students.filter((s) => s.online && s.has_data !== false);

  const histogram = BINS.map((b) => ({
    ...b,
    count: reporting.filter((s) => s.attention >= b.min && s.attention < b.max).length,
  }));

  const timeline = (snapshot.timeline || []).map((p) => ({
    ...p,
    time: p.timestamp ? formatClock(p.timestamp) : p.time,
  }));

  const ranked = [...reporting].sort((a, b) => a.attention - b.attention);
  const lowest = ranked.slice(0, 8);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Eye Tracking"
        subtitle="Gaze-based attention score per student (0-100%), estimated from the face crop"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Avg. concentration" value={`${Math.round(snapshot.avg_concentration)}%`} tone="blue" />
        <Stat label="Low concentration" value={snapshot.low_concentration_count} hint="below 50% attention" tone="rose" />
        <Stat
          label="Most attentive"
          value={ranked.length ? ranked[ranked.length - 1].name : '—'}
          hint={ranked.length ? `${Math.round(ranked[ranked.length - 1].attention * 100)}%` : undefined}
          tone="green"
        />
        <Stat label="Tracked students" value={reporting.length} hint={`of ${students.length} enrolled`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Card title="Concentration Over Time" subtitle="Class average per aggregation cycle" className="xl:col-span-8">
          <div className="h-[240px]">
            {timeline.length < 2 ? (
              <p className="h-full flex items-center justify-center text-xs text-slate-400">Collecting data…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={50} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e2e8f0' }} formatter={(v) => [`${v}%`, 'Attention']} />
                  <ReferenceLine y={50} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'low', fontSize: 10, fill: '#EF4444', position: 'insideTopRight' }} />
                  <Line type="monotone" dataKey="concentration" stroke="#3B82F6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Attention Distribution" subtitle="Number of students per attention band" className="xl:col-span-4">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {histogram.map((b) => (
                    <Cell key={b.label} fill={b.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Needs Attention" subtitle="Students with the lowest gaze attention right now">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          {lowest.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 min-w-0">
                <Avatar name={s.name} src={s.avatar_url} className="w-6 h-6 rounded-full text-[9px]" imgClassName="object-cover" />
                <span className="truncate font-medium text-slate-700">{s.name}</span>
              </span>
              <AttentionBar value={s.attention} />
            </li>
          ))}
          {lowest.length === 0 && <li className="text-xs text-slate-400 py-4">No tracked students yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
