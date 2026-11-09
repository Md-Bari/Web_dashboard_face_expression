'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  GraduationCap,
  Layers3,
  Link2,
  Loader2,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { copyText, inviteLink } from '@/lib/clipboard';
import { closePendingTab, openPendingTab, showMeeting } from '@/lib/classTab';
import type { CourseInfo, SectionInfo } from '@/lib/types';
import { Card } from './ui';

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
  const sectionCount = courses?.reduce((total, course) => total + (course.sections?.length ?? 0), 0) ?? 0;
  const studentCount = courses?.reduce((total, course) => total + course.total_students, 0) ?? 0;

  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div className="pt-0.5">
              <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
                <Sparkles className="h-3 w-3" /> Teaching workspace
              </p>
              <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Your classes</h1>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                Organize your courses, manage sections, and get your next class ready to go.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[330px]">
            {[
              { label: 'Courses', value: courses === null ? '—' : courses.length, icon: BookOpen },
              { label: 'Sections', value: courses === null ? '—' : sectionCount, icon: Layers3 },
              { label: 'Students', value: courses === null ? '—' : studentCount, icon: Users },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-white/90 bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 sm:text-[11px]">
                  <Icon className="h-3.5 w-3.5 text-blue-600" />
                  {label}
                </div>
                <p className="mt-1 text-lg font-bold leading-none tabular-nums text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 space-y-4">
          <Card
            title="Course library"
            subtitle="Choose a course to manage its sections"
            action={
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                {courses === null ? 'Loading…' : `${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`}
              </span>
            }
            className="h-full"
          >
            {courses === null ? (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> Loading your courses…
              </div>
            ) : courses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-500 shadow-sm">
                  <BookOpen className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-800">Your course list is empty</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Create your first class below to get started.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {courses.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      aria-pressed={c.id === selectedId}
                      className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                        c.id === selectedId
                          ? 'border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50/70 shadow-sm shadow-blue-900/5'
                          : 'border-slate-100 bg-white hover:border-blue-100 hover:bg-slate-50/70'
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                          c.id === selectedId ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700'
                        }`}
                        aria-hidden="true"
                      >
                        {c.title.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-900">{c.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                          <span className="font-medium text-slate-600">{c.code}</span>
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <span>{c.sections?.length ?? 0} sections</span>
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <span>{c.total_students} students</span>
                        </span>
                      </span>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-transform ${
                          c.id === selectedId ? 'translate-x-0.5 text-blue-600' : 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-slate-500'
                        }`}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Create a class"
            subtitle="Add a course to your teaching space"
            action={
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Plus className="h-4 w-4" />
              </span>
            }
          >
            <form onSubmit={createClass} className="space-y-2">
              <label htmlFor="new-class-code" className="block text-[11px] font-semibold text-slate-700">
                Course code
              </label>
              <input
                id="new-class-code"
                value={newClass.code}
                onChange={(e) => setNewClass((v) => ({ ...v, code: e.target.value }))}
                placeholder="e.g. CSE-2024"
                required
                maxLength={50}
                className={`${input} w-full bg-slate-50/70 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10`}
              />
              <label htmlFor="new-class-title" className="block pt-1 text-[11px] font-semibold text-slate-700">
                Course name
              </label>
              <input
                id="new-class-title"
                value={newClass.title}
                onChange={(e) => setNewClass((v) => ({ ...v, title: e.target.value }))}
                placeholder="e.g. Data Structures"
                required
                maxLength={200}
                className={`${input} w-full bg-slate-50/70 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10`}
              />
              <button
                type="submit"
                disabled={creating}
                className={`${primary} mt-1 w-full rounded-xl py-2.5 shadow-sm shadow-blue-600/15 transition-all hover:-translate-y-px hover:shadow-md`}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {creating ? 'Creating class…' : 'Create class'}
              </button>
              <p className="flex items-start gap-1.5 pt-1 text-[10px] leading-relaxed text-slate-500">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                We’ll create your first section automatically. You can add more whenever you need them.
              </p>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-8">
          {selected ? (
            <ClassDetail key={selected.id} course={selected} onChanged={changed} onOpenSession={onOpenSession} />
          ) : (
            courses && (
              <Card className="flex min-h-[300px] items-center justify-center bg-gradient-to-br from-white to-slate-50/70">
                <div className="max-w-sm text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-8 ring-blue-50/50">
                    <GraduationCap className="h-7 w-7" />
                  </span>
                  <h2 className="mt-5 text-base font-semibold text-slate-900">
                    {courses.length ? 'Choose a course to get started' : 'Your next class starts here'}
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    {courses.length
                      ? 'Select a course from your library to manage sections, invite students, and start a session.'
                      : 'Create your first course and we’ll help you set up its sections and student invite links.'}
                  </p>
                </div>
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
    <Card
      title="Meeting & invite link"
      subtitle={`Choose a section in ${course.title} to share access or start a class`}
      action={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Link2 className="h-4 w-4" />
        </span>
      }
      className="h-full"
    >
      <label htmlFor="section-pick" className="block text-[11px] font-semibold text-slate-700">
        Choose a section
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
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-800 transition focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
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
      <p className="mt-1.5 text-[10px] text-slate-500">
        Each section has its own student invite link and class roster.
      </p>

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
          <div className="rounded-2xl border border-dashed border-slate-200 bg-gradient-to-br from-slate-50/80 to-white px-5 py-8 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-blue-500 shadow-sm ring-1 ring-slate-100">
              <Link2 className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-800">
              {sections.length ? 'Your section link is one step away' : 'Set up your first section'}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              {sections.length
                ? 'Select a section above to copy its invite link, manage students, or start a class meeting.'
                : 'Choose “+ New section” above to create a section and generate a dedicated student invite link.'}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
