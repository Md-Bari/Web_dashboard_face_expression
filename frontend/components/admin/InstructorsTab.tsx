'use client';

import React, { useEffect, useState } from 'react';
import { History, Pencil, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import type { AdminAccount, AdminInstructor } from '@/lib/types';
import { Card, PageTitle } from '@/components/views/ui';
import { CreateInstructorDialog, EditAccountDialog } from './AccountDialog';
import { ago, ErrorNote, errorText, fullTime, SearchBox, StatusPill, td, th, useDebounced } from './shared';

export function InstructorsTab({ onShowLog }: { onShowLog: (user: AdminAccount) => void }) {
  const [rows, setRows] = useState<AdminInstructor[] | null>(null);
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .adminInstructors(q)
      .then((d) => !cancelled && (setRows(d), setError(null)))
      .catch((e) => !cancelled && setError(errorText(e, 'Could not load the instructors')));
    return () => {
      cancelled = true;
    };
  }, [q, reload]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Instructors"
        subtitle={rows ? `${rows.length} instructor account${rows.length === 1 ? '' : 's'}` : 'Instructor accounts'}
        action={
          <div className="flex items-center gap-2">
            <SearchBox value={query} onChange={setQuery} placeholder="Search instructors" />
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              <UserPlus className="w-3.5 h-3.5" /> New instructor
            </button>
          </div>
        }
      />
      <ErrorNote message={error} />
      {notice && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">{notice}</p>}

      <Card className="p-0! overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className={th}>Instructor</th>
                <th className={th}>Username</th>
                <th className={th}>Classes</th>
                <th className={th}>Sessions</th>
                <th className={th}>Students</th>
                <th className={th}>Last sign-in</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows?.map((r) => (
                <tr key={r.id} className={r.is_active ? '' : 'bg-slate-50/60'}>
                  <td className={td}>
                    <p className="font-semibold text-slate-900">{r.display_title || r.name}</p>
                    {r.email && <p className="text-[11px] text-slate-400">{r.email}</p>}
                  </td>
                  <td className={`${td} font-mono`}>{r.username}</td>
                  <td className={td}>{r.courses}</td>
                  <td className={td}>
                    {r.sessions}
                    {r.live_sessions > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-bold">LIVE</span>
                    )}
                  </td>
                  <td className={td}>{r.students}</td>
                  <td className={td} title={fullTime(r.last_login)}>
                    {ago(r.last_login)}
                  </td>
                  <td className={td}>
                    <StatusPill active={r.is_active} />
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <button onClick={() => onShowLog(r)} title="Activity" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                      <History className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditing(r)} title="Edit" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows && rows.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400">{q ? `No instructor matches “${q}”.` : 'No instructors yet.'}</p>
        )}
      </Card>

      {creating && (
        <CreateInstructorDialog
          onClose={() => setCreating(false)}
          onCreated={(a) => {
            setCreating(false);
            setNotice(`Created ${a.name}. They can sign in as “${a.username}” on the login page.`);
            setReload((n) => n + 1);
          }}
        />
      )}
      {editing && (
        <EditAccountDialog
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={(a) => {
            setEditing(null);
            setNotice(`Saved ${a.name}.`);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
