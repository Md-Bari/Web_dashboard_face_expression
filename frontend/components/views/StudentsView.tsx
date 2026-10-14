'use client';

import React, { useMemo, useState } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { Avatar } from '@/components/dashboard/Avatar';
import { AttentionBar, Card, EmotionPill, PageTitle } from './ui';
import type { EmotionType } from '@/lib/emotions';

type SortKey = 'name' | 'attention' | 'emotion' | 'confidence';
// Sort from the most concerning expression to the most positive
const EMOTION_ORDER: Record<EmotionType, number> = { angry: 0, fear: 1, sad: 2, neutral: 3, surprise: 4, happy: 5 };

function SortHeader({
  k,
  active,
  onSort,
  children,
}: {
  k: SortKey;
  active: SortKey;
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <th className="px-3 py-2 text-left font-semibold">
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-blue-600">
        {children}
        <ArrowUpDown className={`w-3 h-3 ${active === k ? 'text-blue-600' : 'text-slate-300'}`} />
      </button>
    </th>
  );
}

export function StudentsView() {
  const students = useDashboardStore((s) => s.students);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = students.filter((s) => s.name.toLowerCase().includes(q));
    const dir = asc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'attention':
          return (a.attention - b.attention) * dir;
        case 'confidence':
          return (a.confidence - b.confidence) * dir;
        case 'emotion':
          return (EMOTION_ORDER[a.emotion] - EMOTION_ORDER[b.emotion]) * dir;
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });
  }, [students, query, sortKey, asc]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Students"
        subtitle={`${students.length} enrolled · ${students.filter((s) => s.online).length} online`}
        action={
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students"
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-hidden focus:border-blue-400 w-56"
            />
          </div>
        }
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold w-10">#</th>
                <SortHeader k="name" active={sortKey} onSort={sortBy}>Student</SortHeader>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <SortHeader k="emotion" active={sortKey} onSort={sortBy}>Sentiment</SortHeader>
                <SortHeader k="attention" active={sortKey} onSort={sortBy}>Attention</SortHeader>
                <SortHeader k="confidence" active={sortKey} onSort={sortBy}>Confidence</SortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((s, i) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} src={s.avatar_url} className="w-7 h-7 rounded-full text-[10px]" imgClassName="object-cover" />
                      <span className="font-semibold text-slate-800">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1.5 ${s.online ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {s.online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-3 py-2">{s.has_data === false ? <span className="text-slate-300">—</span> : <EmotionPill emotion={s.emotion} />}</td>
                  <td className="px-3 py-2">{s.has_data === false ? <span className="text-slate-300">—</span> : <AttentionBar value={s.attention} />}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">
                    {s.has_data === false ? '—' : `${Math.round(s.confidence * 100)}%`}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
