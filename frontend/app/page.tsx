'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Video } from 'lucide-react';
import { Sidebar, type TabName } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { StudentGrid } from '@/components/dashboard/StudentGrid';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/dashboard/ChartSkeleton';
import { TeachingSuggestions } from '@/components/dashboard/TeachingSuggestions';
import { LiveMonitoringView } from '@/components/views/LiveMonitoringView';
import { StudentsView } from '@/components/views/StudentsView';
import { PhotosView } from '@/components/views/PhotosView';

import { SuggestionsView } from '@/components/views/SuggestionsView';
import { ReportsView } from '@/components/views/ReportsView';
import { SettingsView } from '@/components/views/SettingsView';
import { ClassesView } from '@/components/views/ClassesView';
import { SessionsView } from '@/components/views/SessionsView';
import { api, ApiError } from '@/lib/api';
import { useInstructorSocket } from '@/lib/websocket';
import { useDashboardStore } from '@/lib/store';
import { EMPTY_EMOTIONS } from '@/lib/emotions';
import { SessionSetup } from '@/components/dashboard/SessionSetup';
import { ScreenShareButton } from '@/components/views/ScreenMonitor';
import { InviteStudentsButton } from '@/components/dashboard/InviteStudents';
import { SectionSelect } from '@/components/dashboard/SectionSelect';

// Charts (recharts) are split out of the first page load
const SentimentDonut = dynamic(() => import('@/components/dashboard/SentimentDonut').then((m) => m.SentimentDonut), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const ConcentrationOverview = dynamic(
  () => import('@/components/dashboard/ConcentrationOverview').then((m) => m.ConcentrationOverview),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const SentimentView = dynamic(() => import('@/components/views/SentimentView').then((m) => m.SentimentView), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const EyeTrackingView = dynamic(() => import('@/components/views/EyeTrackingView').then((m) => m.EyeTrackingView), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

type Boot = { state: 'loading' } | { state: 'ready' } | { state: 'setup' } | { state: 'error'; message: string };

// The session the dashboard showed last (per browser); the server's current session otherwise
const SESSION_KEY = 'emp-edu:dashboard-session';

function rememberedSession(): number | null {
  try {
    return Number(window.localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function rememberSession(id: number) {
  try {
    window.localStorage.setItem(SESSION_KEY, String(id));
  } catch {
    // storage unavailable (private mode): the dashboard falls back to the current session
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabName>('Dashboard');
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [menuOpen, setMenuOpen] = useState(false);

  const { session, connection, setUser, setSession, seedTrend } = useDashboardStore();

  /** Show one session on the dashboard (its live data, trend and reports). */
  const showSession = useCallback(
    async (id: number) => {
      const next = await api.session(id);
      const store = useDashboardStore.getState();
      if (store.session?.id !== next.id) store.reset();
      setSession({ ...next });
      rememberSession(next.id);
      const history = await api.history(next.id).catch(() => []);
      if (useDashboardStore.getState().session?.id !== next.id) return; // switched again meanwhile
      seedTrend(
        history
          .filter((h) => h.total_students > 0)
          .map((h) => ({
            timestamp: h.timestamp as string,
            ...EMPTY_EMOTIONS,
            ...h.emotion_pcts,
            concentration: h.avg_concentration,
          }))
      );
    },
    [setSession, seedTrend]
  );

  const openSession = useCallback(
    (id: number, nextTab?: TabName) => {
      showSession(id)
        .then(() => nextTab && setTab(nextTab))
        .catch(() => undefined);
    },
    [showSession]
  );

  // Authenticate, then show the last viewed (or the current) session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (cancelled) return;
        setUser(me);
        if (me.role === 'student') {
          router.replace('/student');
          return;
        }
        const remembered = rememberedSession();
        try {
          if (!remembered) throw new Error('no remembered session');
          await showSession(remembered);
        } catch {
          try {
            const current = await api.currentSession();
            await showSession(current.id);
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 404)) throw e;
            // No session yet: a first-time instructor creates a class; others pick or schedule one
            const courses = await api.courses();
            if (cancelled) return;
            if (!courses.length) {
              setBoot({ state: 'setup' });
              return;
            }
            setTab('Sessions');
          }
        }
        if (!cancelled) setBoot({ state: 'ready' });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) router.replace('/login');
        else setBoot({ state: 'error', message: 'Cannot reach the backend. Is the server running?' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A student who has not reported for a while is shown as offline (mirrors the 15 s aggregation window)
  useEffect(() => {
    const timer = setInterval(() => useDashboardStore.getState().markStaleOffline(25_000), 5_000);
    return () => clearInterval(timer);
  }, []);

  useInstructorSocket(boot.state === 'ready' && session ? session.id : null, () => router.replace('/login'));

  if (boot.state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-slate-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading dashboard…
      </div>
    );
  }

  if (boot.state === 'setup') {
    return <SessionSetup onCreated={() => window.location.reload()} />;
  }

  if (boot.state === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
        <p className="text-sm text-slate-700 max-w-md">{boot.message}</p>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold">
            Retry
          </button>
          <Link href="/student" className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
            Student Portal
          </Link>
        </div>
      </div>
    );
  }

  const ended = session?.status === 'ENDED';

  return (
    <div className="flex min-h-screen bg-canvas text-slate-800">
      <Sidebar
        currentTab={tab}
        onTabChange={setTab}
        onSessionEnded={() => setTab('Reports')}
        mobileOpen={menuOpen}
        onMobileClose={() => setMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header title={tab} onMenuClick={() => setMenuOpen(true)} />

        <main className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-[1600px] w-full mx-auto">
          {/* Status ribbon: pipeline state, student portal */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-slate-200 bg-white text-xs text-slate-600">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  ended ? 'bg-slate-400' : connection === 'open' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`}
              ></span>
              <span>
                {ended
                  ? 'Session ended · see Reports for the summary'
                  : connection === 'open'
                  ? 'Live analytics running'
                  : 'Reconnecting…'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!['Classes', 'Sessions', 'Students', 'Settings', 'Live Monitoring'].includes(tab) && <SectionSelect />}
              {!ended && session && <ScreenShareButton compact />}
              <InviteStudentsButton />
              {session?.status === 'LIVE' && session.join_code && (
                <a
                  href={`/meet/${session.join_code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap h-8 px-3.5 rounded-lg bg-blue-600 text-white text-[13px] font-medium shadow-sm hover:bg-blue-700 transition-colors"
                >
                  <Video className="w-4 h-4" /> Join class
                </a>
              )}
            </div>
          </div>

          {!session && tab !== 'Classes' && tab !== 'Sessions' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-5">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">No class session yet</p>
                <p className="text-[13px] text-slate-500 mt-0.5">Schedule a session or start one now; its live data appears here.</p>
              </div>
              <button
                onClick={() => setTab('Sessions')}
                className="inline-flex items-center justify-center h-8 px-3.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800"
              >
                Go to Sessions
              </button>
            </div>
          )}

          {tab === 'Dashboard' && (
            <>
              <MetricCards />
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-8">
                  <StudentGrid />
                </div>
                <div className="xl:col-span-4 space-y-4">
                  <SentimentDonut />
                  <ConcentrationOverview />
                </div>
              </div>
              <TeachingSuggestions onViewAll={() => setTab('Teaching Suggestions')} />
            </>
          )}
          {tab === 'Classes' && <ClassesView onOpenSession={(id) => openSession(id)} />}
          {tab === 'Sessions' && <SessionsView onOpenSession={(id, next) => openSession(id, next)} />}
          {tab === 'Live Monitoring' && <LiveMonitoringView />}
          {tab === 'Students' && <StudentsView />}
          {tab === 'Expression Photos' && <PhotosView />}
          {tab === 'Sentiment Analysis' && <SentimentView />}
          {tab === 'Eye Tracking' && <EyeTrackingView />}
          {tab === 'Teaching Suggestions' && <SuggestionsView />}
          {tab === 'Reports' && <ReportsView />}
          {tab === 'Settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
