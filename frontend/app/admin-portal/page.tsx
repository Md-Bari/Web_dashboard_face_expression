'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, GraduationCap, LayoutDashboard, Loader2, LogOut, ShieldCheck, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { homeFor } from '@/lib/roles';
import { useDashboardStore } from '@/lib/store';
import { useLogout } from '@/lib/useLogout';
import type { AdminAccount, AuthUser } from '@/lib/types';
import { OverviewTab } from '@/components/admin/OverviewTab';
import { InstructorsTab } from '@/components/admin/InstructorsTab';
import { StudentsTab } from '@/components/admin/StudentsTab';
import { ActivityTab, type LogFilter } from '@/components/admin/ActivityTab';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'instructors', label: 'Instructors', icon: ShieldCheck },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'activity', label: 'Activity log', icon: Activity },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Admin portal: instructor accounts, every student, and the activity log. Same login page as everyone. */
export default function AdminPage() {
  const router = useRouter();
  const setUser = useDashboardStore((s) => s.setUser);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [logFilter, setLogFilter] = useState<LogFilter>({ role: '', action: '' });
  const { logout, loggingOut } = useLogout();

  useEffect(() => {
    api
      .me()
      .then((user) => {
        setUser(user);
        if (user.role !== 'admin') router.replace(homeFor(user.role));
        else setMe(user);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/login?next=/admin-portal');
      });
  }, [router, setUser]);

  // A person's log opens on the first page: the tab remounts with the new filter
  const showLogFor = (user: AdminAccount) => {
    setLogFilter({ role: '', action: '', user: { id: user.id, name: user.name } });
    setTab('activity');
  };

  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-canvas">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shrink-0">
            <GraduationCap className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 leading-tight">EMP-EDU Admin</p>
            <p className="text-[11px] text-slate-500 truncate">Signed in as {me.username}</p>
          </div>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto" aria-label="Admin sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === id ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'overview' && <OverviewTab onShowLog={() => setTab('activity')} />}
        {tab === 'instructors' && <InstructorsTab onShowLog={showLogFor} />}
        {tab === 'students' && <StudentsTab onShowLog={showLogFor} />}
        {tab === 'activity' && <ActivityTab filter={logFilter} onFilter={setLogFilter} />}
      </main>
    </div>
  );
}
