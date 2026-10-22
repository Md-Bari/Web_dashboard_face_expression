'use client';

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Video,
  Users,
  Images,
  Smile,
  Eye,
  Lightbulb,
  BarChart3,
  Settings,
  Cpu,
  LogOut,
  Play,
  Square,
  GraduationCap,
  Loader2,
  X, School, CalendarDays } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import { useLogout } from '@/lib/useLogout';

export const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Classes', icon: School },
  { name: 'Sessions', icon: CalendarDays },
  { name: 'Live Monitoring', icon: Video },
  { name: 'Students', icon: Users },
  { name: 'Expression Photos', icon: Images },
  { name: 'Sentiment Analysis', icon: Smile },
  { name: 'Eye Tracking', icon: Eye },
  { name: 'Teaching Suggestions', icon: Lightbulb },
  { name: 'Reports', icon: BarChart3 },
  { name: 'Settings', icon: Settings },
] as const;

export type TabName = (typeof NAV_ITEMS)[number]['name'];

/** Sidebar sections: run the class, read the analytics, manage the setup */
export const NAV_GROUPS: { label: string; items: TabName[] }[] = [
  { label: 'Teach', items: ['Dashboard', 'Live Monitoring', 'Classes', 'Sessions'] },
  { label: 'Analyse', items: ['Sentiment Analysis', 'Eye Tracking', 'Expression Photos', 'Teaching Suggestions', 'Reports'] },
  { label: 'Manage', items: ['Students', 'Settings'] },
];

interface SidebarProps {
  currentTab: TabName;
  onTabChange: (tab: TabName) => void;
  /** Called after the session status was changed so the page can show the report. */
  onSessionEnded?: () => void;
  /** Below the lg breakpoint the sidebar is a slide-in drawer */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ currentTab, onTabChange, onSessionEnded, mobileOpen = false, onMobileClose }: SidebarProps) {
  const { modelStatus, session, setSession } = useDashboardStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { logout, loggingOut } = useLogout();

  const isLive = session?.status === 'LIVE';
  const modelActive = modelStatus.status === 'Active';

  const changeSession = async (action: 'end' | 'start') => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'end') {
        await api.endSession(session.id);
        setSession({ ...session, status: 'ENDED', ended_at: new Date().toISOString() });
        onSessionEnded?.();
      } else {
        await api.startSession(session.id);
        setSession({ ...session, status: 'LIVE', ended_at: null, started_at: new Date().toISOString() });
      }
      setConfirmOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    {/* Phone/tablet: dim the page behind the open drawer; tapping it closes the drawer */}
    {mobileOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-40 lg:hidden" onClick={onMobileClose} aria-hidden="true" />}
    <aside
      className={`w-60 bg-[#0B1528] text-slate-300 flex flex-col h-dvh overflow-y-auto border-r border-[#1B294B] shrink-0 select-none
        fixed inset-y-0 left-0 z-50 transition-transform duration-200 ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        lg:sticky lg:top-0 lg:self-start lg:translate-x-0 lg:z-auto lg:h-screen`}
    >
      {/* Brand */}
      <div className="h-14 px-4 flex items-center gap-3 border-b border-[#1B294B]/60 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
          <GraduationCap className="w-4 h-4" />
        </div>
        <div className="leading-tight">
          <h1 className="text-[16px] font-semibold text-white tracking-tight">EMP-EDU</h1>
          <p className="text-[12px] text-blue-400">Classroom analytics</p>
        </div>
        <button
          onClick={onMobileClose}
          aria-label="Close menu"
          className="ml-auto p-1.5 -mr-1 rounded-md text-slate-400 hover:text-white hover:bg-[#152342] lg:hidden"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation, grouped */}
      <nav className="flex-1 px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="px-3 mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((name) => {
                const item = NAV_ITEMS.find((i) => i.name === name)!;
                const Icon = item.icon;
                const isActive = currentTab === item.name;
                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      onTabChange(item.name);
                      onMobileClose?.();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full h-10 flex items-center gap-3 px-3 rounded-lg text-[15px] font-medium transition-colors ${
                      isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-400 hover:text-white hover:bg-[#152342]'
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.name}</span>
                    {item.name === 'Dashboard' && isLive && (
                      <span className={`ml-auto inline-flex items-center gap-1 text-[11px] font-semibold ${isActive ? 'text-white' : 'text-emerald-400'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: model status, session control, log out */}
      <div className="p-3 border-t border-[#1B294B] space-y-2 shrink-0">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]" title={modelStatus.status === 'No model' ? 'Add a .onnx model to backend/inference/models/' : 'Facial expression analysis'}>
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-300">AI model</span>
          <span className={`ml-auto inline-flex items-center gap-1.5 font-medium ${modelActive ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${modelActive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {modelStatus.status}
            {modelActive && modelStatus.latency_ms ? (
              <span className="text-slate-500 font-normal tabular-nums">· {modelStatus.latency_ms} ms</span>
            ) : null}
          </span>
        </div>

        {isLive ? (
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full h-9 flex items-center justify-center gap-2 rounded-lg text-[14px] font-medium text-rose-400 border border-rose-500/30 hover:text-white hover:bg-rose-500/20 transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
            End session
          </button>
        ) : (
          <button
            onClick={() => changeSession('start')}
            disabled={busy || !session}
            className="w-full h-9 flex items-center justify-center gap-2 rounded-lg text-[14px] font-medium text-emerald-400 border border-emerald-500/30 hover:text-white hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Start session
          </button>
        )}
        {error && !confirmOpen && <p className="text-[11px] text-rose-400 px-1">{error}</p>}

        <button
          onClick={logout}
          disabled={loggingOut}
          className="w-full h-9 flex items-center gap-3 px-3 rounded-lg text-[14px] font-medium text-slate-400 hover:text-white hover:bg-[#152342] transition-colors disabled:opacity-60"
        >
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>

    </aside>
    {/* End Session confirmation */}
    {confirmOpen && (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 text-slate-800">
        <div role="dialog" aria-modal="true" aria-label="End this class session?" className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
          <h3 className="font-bold text-slate-900 text-base mb-1">End this class session?</h3>
          <p className="text-xs text-slate-600 mb-4">
            Live telemetry stops and the analytics report for “{session?.title}” becomes final. You can start the
            session again later.
          </p>
          {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => changeSession('end')}
              disabled={busy}
              className="flex-1 py-2 bg-rose-600 text-white font-semibold text-xs rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-60"
            >
              {busy ? 'Ending…' : 'End Session'}
            </button>
            <button
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
