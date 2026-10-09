'use client';

import React from 'react';
import { Activity, UserCheck, Sparkles, Info, Radio } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { formatClock } from '@/lib/format';
import { StudentGrid } from '@/components/dashboard/StudentGrid';
import { Card, PageTitle } from './ui';

const KIND_ICON = {
  emotion: Activity,
  presence: UserCheck,
  suggestion: Sparkles,
  system: Info,
} as const;

export function LiveMonitoringView() {
  const { activity, students, modelStatus } = useDashboardStore();
  const online = students.filter((s) => s.online).length;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Live Monitoring"
        subtitle={`${online} of ${students.length} students streaming telemetry`}
        action={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            {modelStatus.model_name} · {modelStatus.latency_ms} ms
          </span>
        }
      />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8">
          <StudentGrid />
        </div>
        <div className="xl:col-span-4">
          <Card title="Live Activity" subtitle="Sentiment changes, joins and suggestions as they happen">
            {activity.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">Waiting for activity…</p>
            ) : (
              <ul className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
                {activity.map((item) => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <li key={item.id} className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50/70 text-xs">
                      <Icon className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
                      <span className="flex-1 text-slate-700">{item.text}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{formatClock(item.at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
