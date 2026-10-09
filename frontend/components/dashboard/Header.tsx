'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Clock, Loader2, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { useLogout } from '@/lib/useLogout';
import { Avatar } from './Avatar';

const TICK_MS = 15_000;

function subscribeToClock(onTick: () => void) {
  const timer = setInterval(onTick, TICK_MS);
  return () => clearInterval(timer);
}

/** Current time, bucketed to 15 s; null on the server so hydration markup matches. */
function useNow() {
  const bucket = useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / TICK_MS),
    () => 0
  );
  return bucket === 0 ? null : new Date(bucket * TICK_MS);
}

export function Header() {
  const { session, connection } = useDashboardStore();
  const now = useNow();

  const isLive = session?.status === 'LIVE';

  return (
    <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4 px-6 bg-white border-b border-slate-100">
      {/* Title & Greeting */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          Welcome, Instructor <span className="text-xl">👋</span>
        </h1>
        <p className="text-xs md:text-sm text-slate-500 font-normal mt-0.5">
          Real-time Class Analytics Dashboard
        </p>
      </div>

      {/* Right Controls: Session Info, Clock, Instructor Profile */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Connection indicator */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
            connection === 'open'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
          title="Instructor WebSocket connection"
        >
          {connection === 'open' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connection === 'open' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </div>

        {/* Current Session Card */}
        <div className="px-4 py-2 bg-slate-50/80 rounded-xl border border-slate-200/80 flex flex-col justify-center shadow-xs">
          <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
            Current Session
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-semibold text-slate-800">
              {session?.title ?? 'Loading session…'}
            </span>
            {session &&
              (isLive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  LIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-600">
                  {session.status === 'ENDED' ? 'ENDED' : 'SCHEDULED'}
                </span>
              ))}
          </div>
        </div>

        {/* Clock & Date Card */}
        <div className="px-4 py-2 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-center gap-3 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-[72px]">
            <div className="text-sm font-bold text-slate-800 leading-tight">
              {now ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </div>
            <div className="text-[11px] text-slate-500 font-medium leading-tight">
              {now ? now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ' '}
            </div>
          </div>
        </div>

        <ProfileMenu />
      </div>
    </header>
  );
}

/** Instructor name/avatar; clicking it opens a small account popup with Log out. */
function ProfileMenu() {
  const user = useDashboardStore((s) => s.user);
  const { logout, loggingOut } = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const displayName = user?.display_title || user?.name || 'Instructor';

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 pl-2 pr-2 py-1 rounded-xl hover:bg-slate-50 transition-colors"
      >
        <Avatar
          name={displayName}
          src={user?.avatar_url}
          className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-500/20"
        />
        <div className="text-left">
          <div className="text-sm font-semibold text-slate-900 leading-tight">{displayName}</div>
          <div className="text-[11px] text-slate-500 font-medium leading-tight capitalize">
            {user?.role ?? 'Instructor'}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl border border-slate-200 shadow-xl z-40 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
            <p className="text-[11px] text-slate-500 truncate">{user?.email || user?.username}</p>
          </div>
          <button
            role="menuitem"
            onClick={logout}
            disabled={loggingOut}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-60"
          >
            {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
