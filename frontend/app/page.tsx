'use client';

import React, { useEffect, useState } from 'react';
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
import { SentimentView } from '@/components/views/SentimentView';
import { EyeTrackingView } from '@/components/views/EyeTrackingView';
import { InsightsView } from '@/components/views/InsightsView';
import { SuggestionsView } from '@/components/views/SuggestionsView';
import { ReportsView } from '@/components/views/ReportsView';
import { SettingsView } from '@/components/views/SettingsView';
import { api, ApiError } from '@/lib/api';
import { useInstructorSocket } from '@/lib/websocket';
import { useDashboardStore } from '@/lib/store';
import { SessionSetup } from '@/components/dashboard/SessionSetup';
import { ScreenShareButton } from '@/components/views/ScreenMonitor';

type Boot = { state: 'loading' } | { state: 'ready' } | { state: 'setup' } | { state: 'error'; message: string };

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabName>('Dashboard');
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const { session, connection, setUser, setSession, seedTrend } = useDashboardStore();

  // Authenticate, then load the instructor's current session
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
        const current = await api.currentSession();
        if (cancelled) return;
        setSession({ ...current });
        setBoot({ state: 'ready' });

        const history = await api.history(current.id).catch(() => []);
        if (!cancelled) {
          seedTrend(
            history
              .filter((h) => h.total_students > 0)
              .map((h) => ({
                timestamp: h.timestamp as string,
                positive: h.positive_pct,
                neutral: h.neutral_pct,
                negative: h.negative_pct,
                concentration: h.avg_concentration,
              }))
          );
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) router.replace('/login');
        else if (e instanceof ApiError && e.status === 404) setBoot({ state: 'setup' });
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
      <Sidebar currentTab={tab} onTabChange={setTab} onSessionEnded={() => setTab('Reports')} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header />

        <main className="p-5 space-y-4 max-w-[1600px] w-full mx-auto">
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

            <div className="flex items-center gap-2">
              {!ended && <ScreenShareButton compact />}
              <Link
                href="/student"
                target="_blank"
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 font-semibold hover:bg-blue-600 hover:text-white transition-colors"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Open Student Webcam Portal</span>
              </Link>
            </div>
          </div>

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
          {tab === 'Live Monitoring' && <LiveMonitoringView />}
          {tab === 'Students' && <StudentsView />}
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
