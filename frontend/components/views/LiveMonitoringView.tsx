'use client';

import React from 'react';
import { Radio } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { useSectionView } from '@/lib/sections';
import { StudentGrid } from '@/components/dashboard/StudentGrid';
import { SectionSelect } from '@/components/dashboard/SectionSelect';
import { PageTitle } from './ui';

/** Live monitoring of the students' expressions, section by section. */
export function LiveMonitoringView() {
  const modelStatus = useDashboardStore((s) => s.modelStatus);
  const { students, active, label } = useSectionView();
  const enrolled = students.filter((s) => s.source !== 'screen');
  const online = enrolled.filter((s) => s.online).length;
  const screenFaces = students.length - enrolled.length;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Live Monitoring"
        subtitle={`${online} of ${enrolled.length} students streaming${active ? ` · ${label}` : ''}${
          screenFaces ? ` · ${screenFaces} faces from screen capture` : ''
        }`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <SectionSelect />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              {modelStatus.custom_model
                ? `AI model active${modelStatus.latency_ms ? ` · ${modelStatus.latency_ms} ms` : ''}`
                : 'No AI model loaded'}
            </span>
          </div>
        }
      />
      <StudentGrid />
    </div>
  );
}
