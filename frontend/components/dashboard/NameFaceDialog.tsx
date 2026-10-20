'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, UserX, X } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { labelScreenFace } from '@/lib/screenCapture';
import { Avatar } from './Avatar';

interface NameFaceDialogProps {
  /** The face on the shared screen (negative id) */
  screenId: number;
  /** Current name shown for the face and, when it is a student, their id */
  currentName: string;
  currentStudentId?: number | null;
  named: boolean;
  thumb?: string;
  onClose: () => void;
}

/**
 * "Who is this?" for a face found in the shared screen: pick an enrolled student, type
 * another name, or remove the name. Naming a consenting student also remembers their face,
 * so they are recognised automatically from then on.
 */
export function NameFaceDialog({ screenId, currentName, currentStudentId, named, thumb, onClose }: NameFaceDialogProps) {
  const students = useDashboardStore((s) => s.students);
  const labelResult = useDashboardStore((s) => s.screen.labelResult);
  const [query, setQuery] = useState('');
  const [otherName, setOtherName] = useState('');
  // The last reply already there when a request was sent (undefined: nothing sent yet)
  const [sentAfter, setSentAfter] = useState<typeof labelResult | undefined>(undefined);
  const [localError, setLocalError] = useState<string | null>(null);

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter((s) => s.id > 0 && (!q || s.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, query]);

  // The server answers with a screen.label message: close on success, show the reason otherwise
  const answer = sentAfter !== undefined && labelResult && labelResult !== sentAfter ? labelResult : null;
  useEffect(() => {
    if (answer?.ok) onClose();
  }, [answer, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = (label: { student_id?: number; name?: string }) => {
    setLocalError(null);
    if (!labelScreenFace(screenId, label)) {
      setLocalError('The dashboard is not connected. Try again in a moment.');
      return;
    }
    setSentAfter(labelResult);
  };

  const pending = sentAfter !== undefined && !answer;
  const error = localError || (answer && !answer.ok ? answer.message : null);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Name this face"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm max-h-[calc(100dvh-2rem)] flex flex-col shadow-2xl border border-slate-100 text-slate-800"
      >
        <div className="flex items-center gap-3 p-4 pb-3 border-b border-slate-100">
          <Avatar name={currentName} src={thumb} className="w-11 h-11 rounded-xl text-sm" imgClassName="object-cover" />
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 text-sm">Who is this?</h3>
            <p className="text-[11px] text-slate-500 truncate">Now shown as {currentName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 pb-2">
          <label className="relative block">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search enrolled students"
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-blue-500"
            />
          </label>
        </div>

        <ul className="px-2 overflow-y-auto min-h-0 flex-1">
          {roster.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-slate-400">
              {students.some((s) => s.id > 0) ? 'No student matches.' : 'No students are enrolled in this course yet.'}
            </li>
          )}
          {roster.map((s) => {
            const current = s.id === currentStudentId;
            return (
              <li key={s.id}>
                <button
                  disabled={pending || current}
                  onClick={() => send({ student_id: s.id })}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left hover:bg-slate-50 disabled:hover:bg-transparent disabled:opacity-70"
                >
                  <Avatar name={s.name} src={s.avatar_url} className="w-7 h-7 rounded-full text-[10px]" imgClassName="object-cover" />
                  <span className="flex-1 truncate text-xs font-semibold text-slate-800">{s.name}</span>
                  {current && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="p-4 pt-3 border-t border-slate-100 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (otherName.trim()) send({ name: otherName.trim() });
            }}
            className="flex gap-2"
          >
            <input
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              maxLength={40}
              placeholder="Someone else (type a name)"
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={pending || !otherName.trim()}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              Save
            </button>
          </form>

          {named && (
            <button
              onClick={() => send({})}
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <UserX className="w-3.5 h-3.5" /> {currentStudentId ? `Not ${currentName}` : 'Remove name'}
            </button>
          )}

          {pending && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </p>
          )}
          {error && <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2">{error}</p>}
          <p className="text-[10px] text-slate-400">
            Naming a student who gave camera consent also remembers their face (as numbers, not a photo), so they are
            recognised automatically next time.
          </p>
        </div>
      </div>
    </div>
  );
}
