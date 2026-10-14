'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ImageOff, RefreshCw, Search, X } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import { EMOTIONS, EMOTION_META, type EmotionType } from '@/lib/emotions';
import type { ExpressionPhoto, ExpressionPhotoRow } from '@/lib/types';
import { Card, PageTitle } from './ui';

const REFRESH_MS = 15_000;

interface Selected {
  student: ExpressionPhotoRow;
  emotion: EmotionType;
  photo: ExpressionPhoto;
}

/** First-seen expression photos: one row per student, one slot per expression class. */
export function PhotosView() {
  const sessionId = useDashboardStore((s) => s.session?.id);
  const [rows, setRows] = useState<ExpressionPhotoRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selected | null>(null);

  const apply = (students: ExpressionPhotoRow[]) => {
    setRows(students);
    setError(null);
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the photos');

  const load = () => {
    if (sessionId === undefined) return;
    setLoading(true);
    api
      .expressionPhotos(sessionId)
      .then((d) => apply(d.students))
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // Load now and keep the gallery fresh while the tab is open (new photos appear as students show expressions)
  useEffect(() => {
    if (sessionId === undefined) return;
    let cancelled = false;
    const pull = () =>
      api
        .expressionPhotos(sessionId)
        .then((d) => {
          if (!cancelled) {
            setRows(d.students);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the photos');
        });
    pull();
    const timer = setInterval(pull, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q));
  }, [rows, query]);

  const totalPhotos = (rows ?? []).reduce((n, r) => n + Object.keys(r.photos).length, 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Expression Photos"
        subtitle={
          rows
            ? `${totalPhotos} photo${totalPhotos === 1 ? '' : 's'} · ${rows.length} student${rows.length === 1 ? '' : 's'} · first clear sighting of each expression this session`
            : 'First clear sighting of each expression this session'
        }
        action={
          <div className="flex items-center gap-2">
            <label className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search students"
                className="pl-8 pr-3 py-1.5 w-40 sm:w-52 rounded-lg border border-slate-200 bg-white text-xs focus:outline-hidden focus:border-blue-500"
              />
            </label>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        }
      />

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>}

      {rows && rows.length === 0 && (
        <Card>
          <p className="py-8 text-center text-xs text-slate-500">
            No students are enrolled in this course yet. Use <b>Invite students</b> to share the join link.
          </p>
        </Card>
      )}

      {rows && rows.length > 0 && totalPhotos === 0 && (
        <p className="text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-xl p-3">
          No photos yet. When a student streams their webcam, the first time each expression is detected with at least 50%
          confidence, that face is saved here - one photo per expression.
        </p>
      )}

      <div className="space-y-3">
        {visible.map((row) => {
          const count = Object.keys(row.photos).length;
          return (
            <Card key={row.student_id}>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <p className="text-sm font-bold text-slate-900 truncate">{row.name}</p>
                <span className="text-[11px] font-medium text-slate-500 shrink-0">
                  {count} / {EMOTIONS.length} expressions
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {EMOTIONS.map((emotion) => {
                  const meta = EMOTION_META[emotion];
                  const photo = row.photos[emotion];
                  return (
                    <figure key={emotion} className="min-w-0">
                      {photo ? (
                        <button
                          onClick={() => setSelected({ student: row, emotion, photo })}
                          className="block w-full aspect-square rounded-xl overflow-hidden bg-slate-100 ring-2 ring-transparent hover:ring-blue-400 transition"
                          style={{ boxShadow: `inset 0 -3px 0 ${meta.color}` }}
                          aria-label={`${row.name} - ${meta.label}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={api.url(photo.url)} alt={`${row.name} ${meta.label}`} loading="lazy" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-full aspect-square rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-300">
                          <ImageOff className="w-5 h-5" />
                          <span className="mt-1 text-[10px] text-slate-400">Not yet</span>
                        </div>
                      )}
                      <figcaption className="mt-1 flex items-center justify-between gap-1 text-[11px]">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                          {meta.label}
                        </span>
                        {photo && <span className="font-mono text-slate-400">{photo.confidence}%</span>}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </Card>
          );
        })}
        {rows && rows.length > 0 && visible.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-400">No students match “{query}”.</p>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-label={`${selected.student.name} - ${EMOTION_META[selected.emotion].label}`}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-2xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 shadow-2xl"
          >
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-slate-600 hover:text-slate-900 shadow-md border border-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={api.url(selected.photo.url)}
              alt={`${selected.student.name} ${EMOTION_META[selected.emotion].label}`}
              className="w-full aspect-square object-cover rounded-xl bg-slate-100"
            />
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{selected.student.name}</p>
                <p className="text-[11px] text-slate-500">
                  First seen {new Date(selected.photo.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${EMOTION_META[selected.emotion].pill}`}>
                {EMOTION_META[selected.emotion].label} · {selected.photo.confidence}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
