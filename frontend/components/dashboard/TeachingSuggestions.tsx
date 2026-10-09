'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  Users2,
  Clock,
  MessageSquare,
  ChevronRight,
  Info,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import type { TeachingSuggestionData } from '@/lib/types';

export function suggestionIcon(iconName: string, size = 'w-5 h-5') {
  switch (iconName) {
    case 'book':
      return <BookOpen className={`${size} text-blue-600`} />;
    case 'users':
      return <Users2 className={`${size} text-emerald-600`} />;
    case 'clock':
      return <Clock className={`${size} text-amber-600`} />;
    case 'message-square':
      return <MessageSquare className={`${size} text-purple-600`} />;
    default:
      return <Sparkles className={`${size} text-blue-600`} />;
  }
}

export function suggestionIconBg(iconName: string) {
  switch (iconName) {
    case 'book':
      return 'bg-blue-50 border-blue-100';
    case 'users':
      return 'bg-emerald-50 border-emerald-100';
    case 'clock':
      return 'bg-amber-50 border-amber-100';
    case 'message-square':
      return 'bg-purple-50 border-purple-100';
    default:
      return 'bg-blue-50 border-blue-100';
  }
}

/** Shared by the dashboard card and the Teaching Suggestions view. */
export function useSuggestionActions() {
  const { session, removeSuggestion, logActivity } = useDashboardStore();

  const dismiss = async (item: TeachingSuggestionData, applied = false) => {
    removeSuggestion(item.id);
    logActivity('suggestion', `${applied ? 'Applied' : 'Dismissed'}: ${item.title}`);
    if (session) {
      try {
        await api.dismissSuggestion(session.id, item.id);
      } catch {
        // The card is already gone locally; the server copy is re-evaluated on the next cycle.
      }
    }
  };

  return { dismiss };
}

export function SuggestionDialog({
  item,
  onClose,
}: {
  item: TeachingSuggestionData;
  onClose: () => void;
}) {
  const { dismiss } = useSuggestionActions();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1">
          <X className="w-4 h-4" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <h3 className="font-bold text-slate-900 text-base mb-1">Apply Recommendation:</h3>
        <p className="text-xs font-semibold text-blue-600 mb-2">&ldquo;{item.title}&rdquo;</p>
        <p className="text-xs text-slate-600 mb-4">{item.description}</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              dismiss(item, true);
              onClose();
            }}
            className="flex-1 py-2 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 transition-colors"
          >
            Apply Intervention
          </button>
          <button
            onClick={() => {
              dismiss(item);
              onClose();
            }}
            className="px-3 py-2 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-50 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeachingSuggestions({ onViewAll }: { onViewAll?: () => void }) {
  const { suggestions } = useDashboardStore();
  const [active, setActive] = useState<TeachingSuggestionData | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <div>
          <h3 className="text-sm font-bold text-slate-900 leading-none">AI Teaching Suggestions</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Based on real-time sentiment and concentration analysis
          </p>
        </div>
      </div>

      {/* Suggestion Cards Row */}
      {suggestions.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          No suggestions right now. They appear automatically as the class telemetry changes.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {suggestions.slice(0, 4).map((item) => (
            <div
              key={item.id}
              onClick={() => setActive(item)}
              className="group flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/20 transition-all cursor-pointer relative"
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${suggestionIconBg(
                  item.icon
                )}`}
              >
                {suggestionIcon(item.icon)}
              </div>

              <div className="flex-1 min-w-0 pr-4">
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                  {item.title}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-tight">{item.description}</p>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 absolute right-2.5 top-3.5" />
            </div>
          ))}
        </div>
      )}

      {/* View All Suggestions Button */}
      <div className="mt-3.5 flex justify-center">
        <button
          onClick={onViewAll}
          className="px-4 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
        >
          View All Suggestions
        </button>
      </div>

      {/* Compliance / Explainability Note */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-slate-400">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>
          System uses deep learning for sentiment classification, PyGaze for eye tracking, and XAI for model
          interpretability.
        </span>
      </div>

      {active && <SuggestionDialog item={active} onClose={() => setActive(null)} />}
    </div>
  );
}
