'use client';

import React, { useEffect, useState } from 'react';
import { LayoutGrid, List, ChevronDown, ChevronLeft, ChevronRight, Check, X, ShieldCheck, MonitorUp, Tag } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { StudentCard } from './StudentCard';
import { Avatar } from './Avatar';
import { NameFaceDialog } from './NameFaceDialog';
import { StudentData } from '@/lib/types';
import { EMOTIONS, EMOTION_META, emotionMeta } from '@/lib/emotions';
import { EmotionPill } from '@/components/views/ui';
import { matchesSection } from '@/lib/sections';

export function StudentGrid() {
  const { students, filter, setFilter, viewMode, setViewMode, session, sectionFilter } = useDashboardStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Resolve from the store so an open modal keeps updating live
  const selectedStudent: StudentData | null = students.find((s) => s.id === selectedId) ?? null;
  const [naming, setNaming] = useState(false);
  const setSelectedStudent = (s: StudentData | null) => {
    setSelectedId(s ? s.id : null);
    setNaming(false);
  };
  // A face can be (re)named while it is on the shared screen
  const nameable = !!selectedStudent?.screen_id && selectedStudent.via === 'screen' && selectedStudent.online;

  // Esc closes the student detail popup
  useEffect(() => {
    if (selectedId === null || naming) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedId(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, naming]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1]);

  const filteredStudents = students.filter((s) => {
    if (!matchesSection(s.section, sectionFilter, s.source === 'screen')) return false;
    if (filter === 'all') return true;
    return s.has_data !== false && s.emotion === filter;
  });

  // A filter that shrinks the list keeps the page in range
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const pageStudents = filteredStudents.slice(offset, offset + pageSize);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
      {/* Grid Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Live Student Expressions
            </h2>
            {session?.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                LIVE
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-600">
                {session?.status ?? '...'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time facial expression analysis
          </p>
        </div>

        {/* Filter Dropdown & View Mode Toggles */}
        <div className="flex items-center gap-2">
          {/* Dropdown Filter */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span>
                {filter === 'all' ? 'All Students' : EMOTION_META[filter].label}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {filterOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
                {(['all', ...EMOTIONS] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setFilter(opt);
                      setFilterOpen(false);
                      setPage(1);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-slate-50 transition-colors ${
                      filter === opt ? 'font-bold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>
                      {opt === 'all' ? 'All Students' : EMOTION_META[opt].label}
                    </span>
                    {filter === opt && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50/50">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white shadow-2xs text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-white shadow-2xs text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Student Cards (7 columns on large screens) */}
      <div className="mt-3.5">
        {filteredStudents.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">
            {students.length === 0 ? 'Waiting for the class roster...' : 'No students match this filter.'}
          </p>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
            {pageStudents.map((student, idx) => (
              <StudentCard
                key={student.id}
                student={student}
                index={offset + idx + 1}
                onClick={(s) => setSelectedStudent(s)}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pageStudents.map((student, idx) => (
              <div
                key={student.id}
                onClick={() => setSelectedStudent(student)}
                className="flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 w-7">#{offset + idx + 1}</span>
                  <Avatar name={student.name} src={student.live_thumb || student.avatar_url} className="w-9 h-9 rounded-full text-xs" imgClassName="object-cover" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">{student.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {student.has_data === false
                        ? 'No data'
                        : `Attention: ${Math.round(student.attention * 100)}%`}
                    </p>
                  </div>
                </div>
                {student.has_data === false ? (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">—</span>
                ) : (
                  <EmotionPill emotion={student.smoothed_emotion || student.emotion} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {filteredStudents.length > 0 && (
        <Pagination
          page={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={filteredStudents.length}
          offset={offset}
          shown={pageStudents.length}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      {/* Legend Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-600">
        {EMOTIONS.map((emotion) => (
          <div key={emotion} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: EMOTION_META[emotion].color }}></span>
            <span className="font-medium">{EMOTION_META[emotion].label}</span>
          </div>
        ))}
      </div>

      {naming && selectedStudent?.screen_id && (
        <NameFaceDialog
          screenId={selectedStudent.screen_id}
          currentName={selectedStudent.name}
          currentStudentId={selectedStudent.id > 0 ? selectedStudent.id : null}
          named={!!selectedStudent.match}
          thumb={selectedStudent.live_thumb}
          // If the face moves to the student's own tile, the popup closes as its tile disappears
          onClose={() => setNaming(false)}
        />
      )}

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedStudent(null)}
        >
          <div
            role="dialog"
            aria-label={`${selectedStudent.name} details`}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 shadow-2xl border border-slate-100 relative"
          >
            {/* Above the live preview, which would otherwise cover it */}
            <button
              onClick={() => setSelectedStudent(null)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-slate-600 hover:text-slate-900 hover:bg-white shadow-md border border-slate-200"
            >
              <X className="w-4 h-4" />
            </button>

            {selectedStudent.live_thumb && (
              <div className="relative mb-4 w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedStudent.live_thumb} alt={`${selectedStudent.name} live camera`} className="w-full h-full object-cover" />
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
                </span>
              </div>
            )}

            <div className="flex items-center gap-3.5 mb-4">
              <Avatar
                name={selectedStudent.name}
                src={selectedStudent.avatar_url}
                className="w-14 h-14 rounded-xl ring-2 ring-blue-500/20"
                imgClassName="object-cover"
              />
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedStudent.name}</h3>
                <span className="inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  {selectedStudent.id > 0 ? `Student #${selectedStudent.id}` : 'Not linked to a student'}
                </span>
                {selectedStudent.via === 'screen' && selectedStudent.match && (
                  <span className="block mt-1 text-[11px] text-slate-500">
                    {selectedStudent.match === 'auto' ? 'Recognised on the shared screen' : 'Named by you on the shared screen'}
                  </span>
                )}
              </div>
            </div>

            {nameable && (
              <button
                onClick={() => setNaming(true)}
                className="mb-4 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                <Tag className="w-3.5 h-3.5" />
                {selectedStudent.match ? 'Change name' : 'Name this face'}
              </button>
            )}

            {selectedStudent.has_data === false ? (
              <p className="text-xs text-slate-500 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                No emotion or attention data has been recorded for this student yet.
              </p>
            ) : (
            <div className="space-y-2.5 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Data source</span>
                <span className="font-bold text-slate-900 inline-flex items-center gap-1">
                  {selectedStudent.via === 'screen' && <MonitorUp className="w-3.5 h-3.5 text-slate-500" />}
                  {selectedStudent.via === 'screen' ? 'Shared screen + AI model' : 'Webcam + AI model'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Emotion</span>
                <span className="font-bold text-slate-900">{emotionMeta(selectedStudent.emotion).label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Smoothed Emotion (10s)</span>
                <span className="font-bold text-slate-900">
                  {emotionMeta(selectedStudent.smoothed_emotion || selectedStudent.emotion).label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Attention Score</span>
                <span className="font-bold text-slate-900">
                  {Math.round(selectedStudent.attention * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Inference Confidence</span>
                <span className="font-bold text-slate-900">
                  {Math.round(selectedStudent.confidence * 100)}%
                </span>
              </div>
            </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>
                {selectedStudent.via === 'screen'
                  ? 'Seen on your shared screen. The image is analysed in memory only; stored: expression label and attention score - zero video recorded.'
                  : 'Consent verified. The live preview is shown in memory only. Stored: expression label, attention score and one face photo per expression - zero video recorded.'}
              </span>
            </div>

            <button
              onClick={() => setSelectedStudent(null)}
              className="mt-4 w-full py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Whole rows of the 7-column grid
const PAGE_SIZES = [7, 14, 28] as const;

/** Page numbers to show: first, last, and the pages around the current one, with gaps as null. */
function pageNumbers(page: number, count: number): (number | null)[] {
  const wanted = new Set([1, count, page - 1, page, page + 1].filter((n) => n >= 1 && n <= count));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  offset,
  shown,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  offset: number;
  shown: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const button =
    'min-w-8 h-8 px-2 inline-flex items-center justify-center rounded-lg border text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <nav
      aria-label="Student pages"
      className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500"
    >
      <div className="flex items-center gap-3">
        <span>
          Showing <b className="text-slate-800">{offset + 1}</b>–<b className="text-slate-800">{offset + shown}</b> of{' '}
          <b className="text-slate-800">{total}</b>
        </span>
        <label className="inline-flex items-center gap-1.5">
          Per page
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-blue-500"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={`${button} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pageNumbers(page, pageCount).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={n}
              onClick={() => onPage(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`${button} ${
                n === page
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={`${button} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}
