'use client';

import React, { useEffect, useState } from 'react';
import { History, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import type { AdminAccount, AdminStudent } from '@/lib/types';
import { Card, PageTitle } from '@/components/views/ui';
import { EditAccountDialog } from './AccountDialog';
import { ago, ErrorNote, errorText, fullTime, SearchBox, StatusPill, td, th, useDebounced } from './shared';

export function StudentsTab({ onShowLog }: { onShowLog: (user: AdminAccount) => void }) {
  const [rows, setRows] = useState<AdminStudent[] | null>(null);
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .adminStudents(q)
      .then((d) => !cancelled && (setRows(d), setError(null)))
      .catch((e) => !cancelled && setError(errorText(e, 'Could not load the students')));
    return () => {
      cancelled = true;
    };
  }, [q, reload]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Students"
        subtitle={rows ? `${rows.length} student account${rows.length === 1 ? '' : 's'}${rows.length === 500 ? ' (first 500, search to narrow)' : ''}` : 'Student accounts'}
        action={<SearchBox value={query} onChange={setQuery} placeholder="Search students" />}
      />
      <ErrorNote message={error} />

      <Card className="p-0! overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className={th}>Student</th>
                <th className={th}>Username</th>
                <th className={th}>Classes</th>
                <th className={th}>Camera consent</th>
                <th className={th}>Last sign-in</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows?.map((r) => (
                <tr key={r.id} className={r.is_active ? '' : 'bg-slate-50/60'}>
                  <td className={td}>
                    <p className="font-semibold text-slate-900">{r.name}</p>
                    {r.email && <p className="text-[11px] text-slate-400">{r.email}</p>}
                  </td>
                  <td className={`${td} font-mono`}>{r.username}</td>
                  <td className={td}>
                    {r.classes.length === 0 ? (
                      <span className="text-slate-400">None</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.classes.map((c) => (
                          <li key={c.course} title={`${c.title} · ${c.instructor}`}>
                            <span className="font-semibold">{c.course}</span>
                            {c.section && <span className="text-slate-400"> · {c.section}</span>}
                            <span className="text-slate-400"> · {c.instructor}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={td}>{r.consent_given ? 'Given' : <span className="text-slate-400">Not given</span>}</td>
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
          <p className="py-8 text-center text-xs text-slate-400">{q ? `No student matches “${q}”.` : 'No students yet.'}</p>
        )}
      </Card>

      {editing && (
        <EditAccountDialog
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
