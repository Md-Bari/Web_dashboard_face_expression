'use client';

import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { formatClock } from '@/lib/format';
import { suggestionIcon, suggestionIconBg, useSuggestionActions } from '@/components/dashboard/TeachingSuggestions';
import { Card, PageTitle } from './ui';

const CATEGORY_STYLE: Record<string, string> = {
  CONFUSION: 'bg-rose-100 text-rose-700',
  ENGAGEMENT: 'bg-emerald-100 text-emerald-700',
  FATIGUE: 'bg-amber-100 text-amber-700',
  PARTICIPATION: 'bg-purple-100 text-purple-700',
};

export function SuggestionsView() {
  const suggestions = useDashboardStore((s) => s.suggestions);
  const { dismiss } = useSuggestionActions();
  const [category, setCategory] = useState<string>('ALL');

  const shown = suggestions.filter((s) => category === 'ALL' || s.category === category);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Teaching Suggestions"
        subtitle="Rule-based interventions generated from live sentiment and concentration"
        action={
          <div className="flex flex-wrap gap-1.5">
            {['ALL', 'CONFUSION', 'ENGAGEMENT', 'FATIGUE', 'PARTICIPATION'].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  category === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {c === 'ALL' ? 'All' : c.charAt(0) + c.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {shown.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${suggestionIconBg(item.icon)}`}>
                {suggestionIcon(item.icon)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_STYLE[item.category] ?? 'bg-slate-100 text-slate-600'}`}>
                    {item.category}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{item.description}</p>
                {item.created_at && <p className="text-[10px] text-slate-400 mt-1">{formatClock(item.created_at)}</p>}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => dismiss(item, true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Apply
                  </button>
                  <button
                    onClick={() => dismiss(item)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 text-slate-600 font-semibold text-xs rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Dismiss
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-12 text-center text-xs text-slate-400">
          No active suggestions. New ones appear automatically as telemetry changes.
        </p>
      )}
    </div>
  );
}
