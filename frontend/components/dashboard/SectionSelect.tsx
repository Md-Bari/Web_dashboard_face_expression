'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { useDashboardStore, type SectionFilter } from '@/lib/store';
import { sectionOptions } from '@/lib/sections';

/** Section filter for every monitoring and insights page (the open session's sections). */
export function SectionSelect() {
  const { session, sectionFilter, setSectionFilter } = useDashboardStore();
  const options = sectionOptions(session);
  if (!session) return null;

  return (
    <label className="inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-semibold">
      <Layers className="w-3.5 h-3.5" />
      <span className="sr-only sm:not-sr-only">Section</span>
      <select
        value={String(sectionFilter)}
        onChange={(e) => {
          const v = e.target.value;
          setSectionFilter((v === 'all' || v === 'none' ? v : Number(v)) as SectionFilter);
        }}
        className="bg-transparent py-0.5 text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
      >
        <option value="all">All sections</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            Section {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
