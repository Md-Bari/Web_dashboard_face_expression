'use client';

import React, { useState } from 'react';
import { Check, Copy, UserPlus, X } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';

function joinLink(joinCode: string) {
  return `${window.location.origin}/join/${joinCode}`;
}

/** "Invite students": shows the course join link to paste into the Meet/Zoom chat or a message. */
export function InviteStudentsButton({ compact = false }: { compact?: boolean }) {
  const course = useDashboardStore((s) => s.session?.course);
  const [open, setOpen] = useState(false);

  if (!course?.join_code) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50"
      >
        <UserPlus className="w-3.5 h-3.5" /> {compact ? 'Invite' : 'Invite students'}
      </button>
      {open && <InviteDialog joinCode={course.join_code} courseTitle={course.title} onClose={() => setOpen(false)} />}
    </>
  );
}

function InviteDialog({ joinCode, courseTitle, onClose }: { joinCode: string; courseTitle: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = joinLink(joinCode);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API unavailable (non-HTTPS): select the text so the user can copy it
      (document.getElementById('join-link') as HTMLInputElement | null)?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Invite students"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl border border-slate-100 text-slate-800"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Invite students</h3>
            <p className="text-xs text-slate-500">{courseTitle}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 mb-3">
          Share this link in the Meet / Zoom chat or by message. Students sign in or create a student account, are
          enrolled in this course automatically, and stream their webcam once you start the session.
        </p>

        <div className="flex gap-2">
          <input
            id="join-link"
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

        <p className="mt-3 text-[11px] text-slate-500">
          Join code: <span className="font-mono font-semibold text-slate-700">{joinCode}</span>. Anyone with the link can
          join this course, so share it only with your class.
        </p>
      </div>
    </div>
  );
}
