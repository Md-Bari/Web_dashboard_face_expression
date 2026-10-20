'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ArrowUpDown, Loader2, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { Avatar } from '@/components/dashboard/Avatar';
import { AttentionBar, Card, EmotionPill, PageTitle } from './ui';
import type { EmotionType } from '@/lib/emotions';
import type { CourseInfo, EnrollmentRow, StudentData } from '@/lib/types';

type SortKey = 'name' | 'class' | 'attention' | 'emotion' | 'confidence';
// Sort from the most concerning expression to the most positive
const EMOTION_ORDER: Record<EmotionType, number> = { angry: 0, fear: 1, sad: 2, neutral: 3, surprise: 4, happy: 5 };

const select =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-hidden focus:border-blue-500';

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

interface Row {
  enrollment: EnrollmentRow;
  /** Live reading from the session open on the dashboard (only for that session's class) */
  live?: StudentData;
}

/** All students of the instructor's classes, filtered by class and section, with live readings of the open session. */
export function StudentsView() {
  const { students: live, session, catalogVersion, bumpCatalog } = useDashboardStore();
  const [enrollments, setEnrollments] = useState<EnrollmentRow[] | null>(null);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [classId, setClassId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, courseList] = await Promise.all([api.enrollments(), api.courses()]);
      setEnrollments(rows);
      setCourses(courseList);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the students.');
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load, catalogVersion]);

  const sectionsOf = (courseId: number) => courses.find((c) => c.id === courseId)?.sections ?? [];
  const filterSections = classId !== null ? sectionsOf(classId) : [];

  const rows: Row[] = useMemo(() => {
    const sessionCourse = session?.course?.id;
    const q = query.trim().toLowerCase();
    const list = (enrollments ?? [])
      .filter((e) => classId === null || e.course.id === classId)
      .filter((e) => sectionId === null || e.section?.id === sectionId)
      .filter(
        (e) =>
          !q ||
          e.student.name.toLowerCase().includes(q) ||
          e.student.username.toLowerCase().includes(q) ||
          (e.student.email || '').toLowerCase().includes(q)
      )
      .map((e) => ({
        enrollment: e,
        live: e.course.id === sessionCourse ? live.find((s) => s.id === e.student.id && s.source !== 'screen') : undefined,
      }));
    const dir = asc ? 1 : -1;
    // Students without a reading go last when sorting by a reading
    const metric = (r: Row, value: (s: StudentData) => number) =>
      r.live && r.live.has_data !== false ? value(r.live) : asc ? Infinity : -Infinity;
    return list.sort((a, b) => {
      switch (sortKey) {
        case 'class':
          return (
            (a.enrollment.course.code.localeCompare(b.enrollment.course.code) ||
              (a.enrollment.section?.name ?? '').localeCompare(b.enrollment.section?.name ?? '')) * dir
          );
        case 'attention':
          return (metric(a, (s) => s.attention) - metric(b, (s) => s.attention)) * dir || 0;
        case 'confidence':
          return (metric(a, (s) => s.confidence) - metric(b, (s) => s.confidence)) * dir || 0;
        case 'emotion':
          return (metric(a, (s) => EMOTION_ORDER[s.emotion]) - metric(b, (s) => EMOTION_ORDER[s.emotion])) * dir || 0;
        default:
          return a.enrollment.student.name.localeCompare(b.enrollment.student.name) * dir;
      }
    });
  }, [enrollments, classId, sectionId, query, sortKey, asc, live, session?.course?.id]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const act = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
      bumpCatalog();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    }
    setBusyId(null);
  };

  const online = rows.filter((r) => r.live?.online).length;
  const sectionLabel = sectionId !== null ? `Section ${filterSections.find((s) => s.id === sectionId)?.name ?? ''}` : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Students"
        subtitle={[
          `${rows.length} student${rows.length === 1 ? '' : 's'}`,
          classId !== null ? courses.find((c) => c.id === classId)?.title : 'all classes',
          sectionLabel,
          session?.status === 'LIVE' ? `${online} online now` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-2xs">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          Class
          <select
            value={classId ?? ''}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : null);
              setSectionId(null);
            }}
            className={select}
          >
            <option value="">All classes</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          Section
          <select
            value={sectionId ?? ''}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
            disabled={classId === null}
            title={classId === null ? 'Choose a class first' : undefined}
            className={`${select} disabled:opacity-50`}
          >
            <option value="">All sections</option>
            {filterSections.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name} ({s.total_students})
              </option>
            ))}
          </select>
        </label>
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, username or email"
            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-hidden focus:border-blue-400 w-56"
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold w-10">#</th>
                <SortHeader k="name" active={sortKey} onSort={sortBy}>Student</SortHeader>
                <SortHeader k="class" active={sortKey} onSort={sortBy}>Class / Section</SortHeader>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <SortHeader k="emotion" active={sortKey} onSort={sortBy}>Sentiment</SortHeader>
                <SortHeader k="attention" active={sortKey} onSort={sortBy}>Attention</SortHeader>
                <SortHeader k="confidence" active={sortKey} onSort={sortBy}>Confidence</SortHeader>
                <th className="px-3 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(({ enrollment: e, live: s }, i) => {
                const reading = s && s.has_data !== false ? s : null;
                return (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={e.student.name}
                          src={s?.live_thumb || e.student.avatar_url}
                          className="w-7 h-7 rounded-full text-[10px]"
                          imgClassName="object-cover"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 whitespace-nowrap">{e.student.name}</p>
                          <p className="text-[10px] text-slate-400 whitespace-nowrap">
                            {e.student.username}
                            {e.student.email ? ` · ${e.student.email}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-slate-600" title={e.course.title}>
                          {e.course.code}
                        </span>
                        <select
                          value={e.section?.id ?? ''}
                          disabled={busyId === e.id}
                          onChange={(ev) => {
                            if (ev.target.value) act(e.id, () => api.moveStudent(e.id, Number(ev.target.value)));
                          }}
                          aria-label={`Section of ${e.student.name}`}
                          className={`${select} ${e.section ? '' : 'border-amber-300 text-amber-700'}`}
                        >
                          {!e.section && (
                            <option value="" disabled>
                              Choose section
                            </option>
                          )}
                          {sectionsOf(e.course.id).map((sec) => (
                            <option key={sec.id} value={sec.id}>
                              Section {sec.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {s ? (
                        <span className={`inline-flex items-center gap-1.5 ${s.online ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          {s.online ? 'Online' : 'Offline'}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{reading ? <EmotionPill emotion={reading.emotion} /> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2">{reading ? <AttentionBar value={reading.attention} /> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{reading ? `${Math.round(reading.confidence * 100)}%` : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {busyId === e.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400 inline" />
                      ) : (
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove ${e.student.name} from ${e.course.title}? Their account is kept.`))
                              act(e.id, () => api.removeStudent(e.id));
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          aria-label={`Remove ${e.student.name} from ${e.course.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {enrollments === null && (
                <tr>
                  <td colSpan={8} className="py-10 text-center">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 inline" />
                  </td>
                </tr>
              )}
              {enrollments !== null && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    {enrollments.length === 0
                      ? 'No students yet. Invite them with a section invite link (Invite students) or add them on the Classes page.'
                      : 'No students match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Status, sentiment, attention and confidence are live readings from the session open on the dashboard
          {session?.course ? ` (${session.title}, ${session.course.code})` : ''}.
        </p>
      </Card>
    </div>
  );
}
