'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Video } from 'lucide-react';
import { Sidebar, type TabName } from '@/components/dashboard/Sidebar';
import { Header } from '@/components/dashboard/Header';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { StudentGrid } from '@/components/dashboard/StudentGrid';
import { SentimentDonut } from '@/components/dashboard/SentimentDonut';
import { ConcentrationOverview } from '@/components/dashboard/ConcentrationOverview';
import { TeachingSuggestions } from '@/components/dashboard/TeachingSuggestions';
import { LiveMonitoringView } from '@/components/views/LiveMonitoringView';
import { StudentsView } from '@/components/views/StudentsView';
import { PhotosView } from '@/components/views/PhotosView';
import { SentimentView } from '@/components/views/SentimentView';
import { EyeTrackingView } from '@/components/views/EyeTrackingView';
import { InsightsView } from '@/components/views/InsightsView';
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
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-slate-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading dashboard…
      </div>
    );
  }

  if (boot.state === 'setup') {
    return <SessionSetup onCreated={() => window.location.reload()} />;
  }

  if (boot.state === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] p-6 text-center">
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
    <div className="flex min-h-screen bg-[#F8FAFC] font-sans antialiased text-slate-800">
      <Sidebar
        currentTab={tab}
        onTabChange={setTab}
        onSessionEnded={() => setTab('Reports')}
        mobileOpen={menuOpen}
        onMobileClose={() => setMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setMenuOpen(true)} />

        <main className="p-3 sm:p-5 space-y-4 max-w-[1600px] w-full mx-auto">
          {/* Status ribbon: pipeline state, student portal */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50/70 border border-blue-100 rounded-xl px-4 py-2 text-xs">
            <div className="flex items-center gap-2 text-blue-900 font-medium">
              <span
                className={`w-2 h-2 rounded-full ${
                  ended ? 'bg-slate-400' : connection === 'open' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                }`}
              ></span>
              <span>
                {ended
                  ? 'Session ended. Telemetry is paused - see Reports for the summary.'
                  : connection === 'open'
                  ? 'Real-time telemetry pipeline active.'
                  : 'Reconnecting to the telemetry server…'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {session?.status === 'LIVE' && session.join_code && (
                <a
                  href={`/meet/${session.join_code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  <Video className="w-3.5 h-3.5" /> Join class meeting
                </a>
              )}
              {!['Classes', 'Sessions', 'Students', 'Settings'].includes(tab) && <SectionSelect />}
              {!ended && session && <ScreenShareButton compact />}
              <InviteStudentsButton />
            </div>
          </div>

          {!session && tab !== 'Classes' && tab !== 'Sessions' && (
            <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded-xl p-3">
              No session yet. Schedule or start one on the <b>Sessions</b> page.
            </p>
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
          {tab === 'AI Insights' && <InsightsView />}
          {tab === 'Teaching Suggestions' && <SuggestionsView />}
          {tab === 'Reports' && <ReportsView />}
          {tab === 'Settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
