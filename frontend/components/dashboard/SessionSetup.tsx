'use client';

import React, { useEffect, useState } from 'react';
import { GraduationCap, Loader2, LogOut } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLogout } from '@/lib/useLogout';
import type { CourseInfo } from '@/lib/types';

const NEW_COURSE = -1;

/** First-run screen for an instructor without any class session: create (or pick) a course and start a session. */
export function SessionSetup({ onCreated }: { onCreated: () => void }) {
  const { logout, loggingOut } = useLogout();
  const [courses, setCourses] = useState<CourseInfo[] | null>(null);
  const [courseId, setCourseId] = useState<number>(NEW_COURSE);
  const [code, setCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .courses()
      .then((list) => {
        setCourses(list);
        if (list.length) setCourseId(list[0].id);
      })
      .catch(() => setCourses([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = courseId === NEW_COURSE ? (await api.createCourse(code.trim(), courseTitle.trim())).id : courseId;
      const session = await api.createSession(id, title.trim());
      await api.startSession(session.id);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the session.');
      setBusy(false);
    }
  };

  const input =
    'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:border-blue-500';

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-lg leading-tight">Start your first class</h1>
              <p className="text-[11px] text-slate-500">No class session exists yet</p>
            </div>
          </div>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600"
          >
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>

        {courses === null ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Course</span>
              <select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))} className={input}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.title} ({c.total_students} students)
                  </option>
                ))}
                <option value={NEW_COURSE}>+ New course</option>
              </select>
            </label>

            {courseId === NEW_COURSE && (
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Code</span>
                  <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="CS201" className={input} />
                </label>
                <label className="block col-span-2">
                  <span className="text-xs font-semibold text-slate-700">Course title</span>
                  <input
                    value={courseTitle}
                    onChange={(e) => setCourseTitle(e.target.value)}
                    required
                    placeholder="Data Structures"
                    className={input}
                  />
                </label>
              </div>
            )}

            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Session title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Lecture 1" className={input} />
            </label>

            {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Create & start live session
            </button>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Students with accounts join through the sign-in page once they are enrolled in the course (Django admin).
              For an online class you can also monitor a Google Meet / Zoom window from <b>Live Monitoring</b> - no
              enrollment needed.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
