'use client';

import React, { useState } from 'react';
import { Check, Copy, UserPlus, Video, X } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { copyText, inviteLink, meetingLink } from '@/lib/clipboard';
import type { CourseInfo, SessionInfo } from '@/lib/types';

/** "Invite students": pick a section, then share its invite link (and the session's meeting link). */
export function InviteStudentsButton({ compact = false }: { compact?: boolean }) {
  const session = useDashboardStore((s) => s.session);
  const [open, setOpen] = useState(false);

  if (!session?.course?.join_code) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50"
      >
        <UserPlus className="w-3.5 h-3.5" /> {compact ? 'Invite' : 'Invite students'}
      </button>
      {open && <InviteDialog session={session} course={session.course} onClose={() => setOpen(false)} />}
    </>
  );
}

function LinkRow({ id, label, hint, link }: { id: string; label: string; hint?: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!(await copyText(link))) {
      // Clipboard API unavailable (non-HTTPS): select the text so the user can copy it
      (document.getElementById(id) as HTMLInputElement | null)?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <p className="text-xs font-semibold text-slate-800">{label}</p>
      {hint && <p className="text-[11px] text-slate-500 mb-1">{hint}</p>}
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700"
        />
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function InviteDialog({ session, course, onClose }: { session: SessionInfo; course: CourseInfo; onClose: () => void }) {
  const sessionSections = session.sections ?? [];
  // Only the sections this session is for (all of the class's for a whole-class session)
  const sections = (course.sections ?? []).filter(
    (s) => !sessionSections.length || sessionSections.some((x) => x.id === s.id)
  );
  // The instructor picks the section first; a single section is picked already
  const [sectionId, setSectionId] = useState<number | null>(sections.length === 1 ? sections[0].id : null);
  const section = sections.find((s) => s.id === sectionId) ?? null;
  const who = sessionSections.length ? `section ${sessionSections.map((s) => s.name).join(', ')}` : 'the whole class';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Invite students"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 shadow-2xl border border-slate-100 text-slate-800"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Invite students</h3>
            <p className="text-xs text-slate-500">
              {course.title} · {session.title}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {sections.length === 0 ? (
          <p className="text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
            This class has no sections yet. Add one on the <b>Classes</b> page, then invite students to it.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="invite-section" className="text-xs font-semibold text-slate-800">
                1. Which section are these students for?
              </label>
              <select
                id="invite-section"
                value={sectionId ?? ''}
                onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-blue-500"
              >
                <option value="" disabled>
                  Choose a section
                </option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    Section {s.name} ({s.total_students} student{s.total_students === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </div>

            {section ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-800">2. Share the link</p>
                <LinkRow
                  key={section.id}
                  id={`invite-${section.id}`}
                  label={`Section ${section.name} invite link`}
                  hint={`New students create an account and are placed in section ${section.name}.`}
                  link={inviteLink(section.join_code)}
                />
                {session.join_code && session.status !== 'ENDED' && (
                  <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 mb-2">
                      <Video className="w-3.5 h-3.5" /> Students already in the section
                    </p>
                    <LinkRow
                      id="meeting-link"
                      label="Meeting link"
                      hint={`Opens this session's video class (for ${who}).`}
                      link={meetingLink(session.join_code)}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">Choose a section to get its invite link.</p>
            )}

            <p className="text-[11px] text-slate-500">Anyone with these links can join, so share them only with your class.</p>
          </div>
        )}
      </div>
    </div>
  );
}
