'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Loader2, LogOut, Menu, Wifi, WifiOff } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { useLogout } from '@/lib/useLogout';
import { Avatar } from './Avatar';
import { NAV_GROUPS } from './Sidebar';

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

function greeting(now: Date | null) {
  if (!now) return 'Welcome';
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Header({ onMenuClick, title }: { onMenuClick?: () => void; title: string }) {
  const { session, connection, user } = useDashboardStore();
  const greetingName = user?.display_title || user?.first_name || user?.name || 'Instructor';
  const now = useNow();
  const isLive = session?.status === 'LIVE';

  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 flex items-center gap-3 px-4 md:px-6 bg-white/85 backdrop-blur-md border-b border-slate-200">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="lg:hidden p-1.5 -ml-1.5 rounded-md text-slate-500 hover:bg-slate-100"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title; the dashboard greets the instructor */}
      <div className="min-w-0 flex items-baseline gap-2.5">
        <h1 className="flex items-baseline gap-1.5 text-[14px] truncate">
          <span className="hidden sm:inline text-slate-400">{NAV_GROUPS.find((g) => g.items.some((i) => i === title))?.label}</span>
          <span className="hidden sm:inline text-slate-300">/</span>
          <span className="font-semibold text-slate-900 tracking-tight">{title}</span>
        </h1>
        {title === 'Dashboard' && (
          <p className="hidden sm:block text-[13px] text-slate-500 truncate">
            {greeting(now)}, {greetingName} 👋
          </p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-3 min-w-0">
        {/* Current session */}
        {session && (
          <div
            className="hidden sm:flex items-center gap-2 min-w-0 max-w-[300px] h-8 pl-2.5 pr-3 rounded-full border border-slate-200 bg-white text-[13px]"
            title={`Current session: ${session.title}`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isLive ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]' : 'bg-slate-300'
              }`}
            />
            <span className="font-medium text-slate-800 truncate">{session.title}</span>
            <span className={`text-[11px] font-semibold shrink-0 ${isLive ? 'text-emerald-600' : 'text-slate-400'}`}>
              {isLive ? 'LIVE' : session.status === 'ENDED' ? 'Ended' : 'Scheduled'}
            </span>
          </div>
        )}

        {/* Live connection: icon only, details on hover */}
        <span
          className={`hidden md:inline-flex items-center justify-center w-8 h-8 rounded-full ${
            connection === 'open' ? 'text-emerald-600' : 'text-amber-500'
          }`}
          title={connection === 'open' ? 'Live updates connected' : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
          aria-label={connection === 'open' ? 'Live updates connected' : 'Live updates reconnecting'}
        >
          {connection === 'open' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
        </span>

        <span className="hidden lg:inline text-[13px] text-slate-500 tabular-nums" suppressHydrationWarning>
          {now ? now.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
        </span>

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
        aria-label="Account"
        className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors"
      >
        <Avatar
          name={displayName}
          src={user?.avatar_url}
          className="w-8 h-8 rounded-full object-cover text-xs"
        />
        <ChevronDown className={`hidden md:block w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
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
