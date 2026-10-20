'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Pencil, Play, Plus, Trash2, Users, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { copyText, inviteLink } from '@/lib/clipboard';
import { closePendingTab, openPendingTab, showMeeting } from '@/lib/classTab';
import type { CourseInfo, SectionInfo } from '@/lib/types';
import { Card, PageTitle } from './ui';

const input = 'rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-hidden focus:border-blue-500';
const primary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50';

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Classes, their sections and students: create, invite, add, move, import. */
export function ClassesView({ onOpenSession }: { onOpenSession?: (id: number) => void }) {
  const bumpCatalog = useDashboardStore((s) => s.bumpCatalog);
  const [courses, setCourses] = useState<CourseInfo[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newClass, setNewClass] = useState({ code: '', title: '' });
  const [creating, setCreating] = useState(false);

  const loadCourses = useCallback(async () => {
    try {
      const list = await api.courses();
      setCourses(list);
      setSelectedId((id) => (id !== null && list.some((c) => c.id === id) ? id : list[0]?.id ?? null));
    } catch (e) {
      setError(message(e, 'Could not load your classes.'));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(loadCourses, 0);
    return () => clearTimeout(first);
  }, [loadCourses]);

  const changed = useCallback(async () => {
    await loadCourses();
    bumpCatalog();
  }, [loadCourses, bumpCatalog]);

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const course = await api.createCourse(newClass.code.trim(), newClass.title.trim());
      setNewClass({ code: '', title: '' });
      setSelectedId(course.id);
      await changed();
    } catch (err) {
      setError(message(err, 'Could not create the class.'));
    }
    setCreating(false);
  };

  const selected = courses?.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <PageTitle title="Classes" subtitle="Your classes, their sections and the students in each section" />
      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 space-y-4">
          <Card title="Your classes">
            {courses === null ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : courses.length === 0 ? (
              <p className="text-xs text-slate-500">No classes yet. Create your first one below.</p>
            ) : (
              <ul className="space-y-1.5">
                {courses.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                        c.id === selectedId ? 'border-blue-400 bg-blue-50/60' : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900 truncate">{c.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {c.code} · {c.sections?.length ?? 0} section{c.sections?.length === 1 ? '' : 's'} · {c.total_students}{' '}
                        student{c.total_students === 1 ? '' : 's'}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="New class">
            <form onSubmit={createClass} className="space-y-2">
              <input
                value={newClass.code}
                onChange={(e) => setNewClass((v) => ({ ...v, code: e.target.value }))}
                placeholder="Code, e.g. CSE-2024"
                required
                maxLength={50}
                className={`${input} w-full`}
              />
              <input
                value={newClass.title}
                onChange={(e) => setNewClass((v) => ({ ...v, title: e.target.value }))}
                placeholder="Name, e.g. Data Structures"
                required
                maxLength={200}
                className={`${input} w-full`}
              />
              <button type="submit" disabled={creating} className={`${primary} w-full`}>
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create class
              </button>
              <p className="text-[11px] text-slate-400">A new class starts with section A; add more sections any time.</p>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-8">
          {selected ? (
            <ClassDetail key={selected.id} course={selected} onChanged={changed} onOpenSession={onOpenSession} />
          ) : (
            courses && (
              <Card>
                <p className="py-10 text-center text-xs text-slate-500">Create or pick a class.</p>
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// Badge colours per section, in order (fixed, never cycled by rank)
const SECTION_TONES = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-fuchsia-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
];

function SectionCard({
  section,
  index,
  defaultTitle,
  onRename,
  onDelete,
  onStartClass,
}: {
  section: SectionInfo;
  index: number;
  defaultTitle: string;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
  /** Create a session for this section, start it and open the meeting in a new tab */
  onStartClass: (title: string) => Promise<void>;
}) {
  const link = inviteLink(section.join_code);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [starting, setStarting] = useState(false);

  const copy = async () => {
    setCopied((await copyText(link)) ? 'copied' : 'failed');
    setTimeout(() => setCopied('idle'), 2500);
  };

  return (
    <div className="group relative rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:border-blue-200">
      <div className="flex items-start gap-3">
        <span
          className={`w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br ${SECTION_TONES[index % SECTION_TONES.length]} text-white text-lg font-bold flex items-center justify-center shadow-sm`}
          aria-hidden="true"
        >
          {section.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          {renaming !== null ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (renaming.trim() && (await onRename(renaming.trim()))) setRenaming(null);
              }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                maxLength={50}
                aria-label="Section name"
                className="min-w-0 flex-1 rounded-lg border border-blue-300 px-2 py-1 text-sm font-semibold focus:outline-hidden"
              />
              <button type="submit" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" aria-label="Save name">
                <Check className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setRenaming(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <p className="text-sm font-bold text-slate-900 truncate">Section {section.name}</p>
          )}
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Users className="w-3 h-3" /> {section.total_students} student{section.total_students === 1 ? '' : 's'}
          </p>
        </div>
        {renaming === null && (
          <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setRenaming(section.name)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label={`Rename section ${section.name}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
              aria-label={`Delete section ${section.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Invite link</p>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 pl-3 pr-1 py-1">
          <Link2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          {/* The code is what differs between sections; Copy copies the full address */}
          <span title={link} className="min-w-0 flex-1 truncate text-xs font-mono text-slate-500 select-all">
            /join/<b className="text-slate-800">{section.join_code}</b>
          </span>
          <button
            onClick={copy}
            className={`inline-flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              copied === 'copied' ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {copied === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Select & copy' : 'Copy link'}
          </button>
        </div>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setStarting(true);
          await onStartClass(title.trim());
          setStarting(false);
        }}
        className="mt-4 pt-4 border-t border-slate-100"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Start a class for this section</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            aria-label="Class title"
            placeholder="Class title"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-hidden focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={starting || !title.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
          >
            {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Start class now
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">Opens the class meeting in a new tab; share its link with the students.</p>
      </form>
    </div>
  );
}

function ClassDetail({
  course,
  onChanged,
  onOpenSession,
}: {
  course: CourseInfo;
  onChanged: () => Promise<void>;
  onOpenSession?: (id: number) => void;
}) {
  const sections = course.sections ?? [];
  // A section id, 'new' (adding one) or null (nothing chosen yet)
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newSection, setNewSection] = useState('');
  const [adding, setAdding] = useState(false);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      await onChanged();
      return true;
    } catch (e) {
      setError(message(e, 'That did not work.'));
      return false;
    }
  };

  const section = sections.find((s) => s.id === selected) ?? null;
  const today = new Date().toLocaleDateString([], { day: 'numeric', month: 'short' });

  const startClass = async (sectionId: number, title: string) => {
    const tab = openPendingTab(); // inside the click, or the browser blocks it
    setError(null);
    setNotice(null);
    try {
      const session = await api.scheduleSession({ course_id: course.id, title, section_ids: [sectionId] });
      await api.startSession(session.id);
      if (session.join_code) showMeeting(tab, session.join_code);
      setNotice(`"${title}" is live - the class opened in a new tab.`);
      await onChanged();
      onOpenSession?.(session.id);
    } catch (e) {
      closePendingTab(tab);
      setError(message(e, 'Could not start the class.'));
    }
  };

  return (
    <Card title="Create Meeting Link" subtitle="Choose a section to get the link its students join with">
      <label htmlFor="section-pick" className="text-xs font-semibold text-slate-700">
        Section
      </label>
      <select
        id="section-pick"
        value={selected ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          setSelected(v === 'new' ? 'new' : v ? Number(v) : null);
          setError(null);
          setNotice(null);
        }}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-hidden focus:border-blue-500"
      >
        <option value="" disabled>
          Choose a section
        </option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            Section {s.name} ({s.total_students} student{s.total_students === 1 ? '' : 's'})
          </option>
        ))}
        <option value="new">+ New section…</option>
      </select>

      {error && <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2.5">{error}</p>}
      {notice && <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">{notice}</p>}

      <div className="mt-4">
        {section && (
          <SectionCard
            key={section.id}
            section={section}
            index={sections.indexOf(section)}
            defaultTitle={`${course.title} - Section ${section.name} - ${today}`}
            onStartClass={(title) => startClass(section.id, title)}
            onRename={(name) => run(() => api.renameSection(section.id, name), `Section renamed to ${name}.`)}
            onDelete={async () => {
              if (
                window.confirm(
                  `Delete section ${section.name}? Its ${section.total_students} student(s) stay in the class without a section.`
                ) &&
                (await run(() => api.deleteSection(section.id), `Section ${section.name} deleted.`))
              )
                setSelected(null);
            }}
          />
        )}

        {selected === 'new' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = newSection.trim();
              if (!name) return;
              setAdding(true);
              let created: SectionInfo | null = null;
              const ok = await run(async () => {
                created = await api.createSection(course.id, name);
              }, `Section ${name} added - its invite link is ready.`);
              setAdding(false);
              if (ok && created) {
                setNewSection('');
                setSelected((created as SectionInfo).id);
              }
            }}
            className="rounded-2xl border-2 border-dashed border-slate-200 p-4 space-y-3"
          >
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 shrink-0 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-700">New section</p>
                <p className="text-[11px] text-slate-500">It gets its own invite link</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                autoFocus
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                placeholder="Section name, e.g. C"
                maxLength={50}
                aria-label="New section name"
                className={`${input} flex-1 min-w-0`}
              />
              <button type="submit" className={primary} disabled={adding || !newSection.trim()}>
                {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add
              </button>
            </div>
          </form>
        )}

        {selected === null && (
          <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
            {sections.length
              ? 'Choose a section above to see its invite link.'
              : 'This class has no sections yet. Choose "+ New section" to add one.'}
          </p>
        )}
      </div>
    </Card>
  );
}
