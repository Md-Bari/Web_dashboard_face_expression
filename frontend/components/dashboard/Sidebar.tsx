'use client';

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Video,
  Users,
  Smile,
  Eye,
  Sparkles,
  Lightbulb,
  BarChart3,
  Settings,
  Cpu,
  LogOut,
  Play,
  Square,
  GraduationCap,
  Loader2,
} from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import { useLogout } from '@/lib/useLogout';

export const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Live Monitoring', icon: Video },
  { name: 'Students', icon: Users },
  { name: 'Sentiment Analysis', icon: Smile },
  { name: 'Eye Tracking', icon: Eye },
  { name: 'AI Insights', icon: Sparkles },
  { name: 'Teaching Suggestions', icon: Lightbulb },
  { name: 'Reports', icon: BarChart3 },
  { name: 'Settings', icon: Settings },
] as const;

export type TabName = (typeof NAV_ITEMS)[number]['name'];

interface SidebarProps {
  currentTab: TabName;
  onTabChange: (tab: TabName) => void;
  /** Called after the session status was changed so the page can show the report. */
  onSessionEnded?: () => void;
}

export function Sidebar({ currentTab, onTabChange, onSessionEnded }: SidebarProps) {
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
    <aside className="w-64 bg-[#0B1528] text-slate-300 flex flex-col justify-between h-screen sticky top-0 self-start overflow-y-auto border-r border-[#1B294B] shrink-0 select-none">
      {/* Brand Header */}
      <div>
        <div className="p-5 flex items-center gap-3 border-b border-[#1B294B]/60">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-white text-lg tracking-wide flex items-center gap-1">EMP-EDU</h1>
            <p className="text-[11px] text-blue-400 font-medium">AI-Powered E-learning</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.name;
            return (
              <button
                key={item.name}
                onClick={() => onTabChange(item.name)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-[#152342]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area: AI Model Status & End Session */}
      <div className="p-4 space-y-3">
        {/* AI Model Card */}
        <div className="p-3 rounded-xl bg-[#111F3C] border border-[#1E315A] shadow-inner">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Cpu className={`w-4 h-4 ${modelActive ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">AI Model</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${modelActive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
                <span className={`text-[11px] font-medium ${modelActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                  Status: {modelStatus.status}
                </span>
              </div>
            </div>
          </div>
          {modelStatus.status === 'No model' ? (
            <p className="mt-2 text-[10px] leading-snug text-slate-400">
              No emotion data from webcams. Add a <span className="font-mono">.onnx</span> file to{' '}
              <span className="font-mono">backend/inference/models/</span>.
            </p>
          ) : (
            <p className="mt-2 text-[10px] text-slate-400 truncate" title={modelStatus.model_name}>
              {modelStatus.model_name}
            </p>
          )}
          <div className="mt-1.5 pt-1.5 border-t border-[#1E315A]/70 flex items-center justify-between text-[10px] text-slate-400">
            <span>Latency</span>
            <span className="text-blue-300 font-mono">
              {modelActive && modelStatus.latency_ms ? `${modelStatus.latency_ms} ms` : '—'}
            </span>
          </div>
        </div>

        {/* End / Start Session Button */}
        {isLive ? (
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/30 transition-all active:scale-[0.98]"
          >
            <Square className="w-4 h-4 text-rose-400" />
            <span>End Session</span>
          </button>
        ) : (
          <button
            onClick={() => changeSession('start')}
            disabled={busy || !session}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-400 hover:text-white hover:bg-emerald-500/20 border border-emerald-500/30 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Start Session</span>
          </button>
        )}
        {error && !confirmOpen && <p className="text-[11px] text-rose-400">{error}</p>}

        {/* Log out */}
        <button
          onClick={logout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-[#152342] border border-[#1E315A] transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
        </button>
      </div>

      {/* End Session confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 text-slate-800">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100">
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
    </aside>
  );
}
