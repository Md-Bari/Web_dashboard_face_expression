'use client';

import React, { useSyncExternalStore } from 'react';
import { Clock, Wifi, WifiOff } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
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
  const { session, user, connection } = useDashboardStore();
  const now = useNow();

  const isLive = session?.status === 'LIVE';
  const displayName = user?.display_title || user?.name || 'Instructor';

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

        {/* Instructor Profile Card */}
        <div className="flex items-center gap-3 pl-2 py-1">
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
        </div>
      </div>
    </header>
  );
}
