'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ReportData } from '@/lib/types';
import { AttentionBar, Card, EmotionPill, PageTitle, Stat } from './ui';

export function ReportsView() {
  const session = useDashboardStore((s) => s.session);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sessionId = session?.id;
  const sessionStatus = session?.status;

  const load = useCallback(async () => {
    if (sessionId === undefined) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await api.report(sessionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the report');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Load when the tab opens and whenever the session is started/ended
  useEffect(() => {
    if (sessionId === undefined) return;
    let cancelled = false;
    api
      .report(sessionId)
      .then((data) => {
        if (!cancelled) {
          setReport(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the report');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionStatus]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Reports"
        subtitle={report ? `${report.session.title} · ${report.session.status}` : 'Session analytics report'}
        action={
          <div className="flex gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {session && (
              <a
                href={api.reportCsvUrl(session.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                <Download className="w-3.5 h-3.5" /> Download CSV
              </a>
            )}
          </div>
        }
      />

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Stat label="Avg. concentration" value={`${report.summary.avg_concentration}%`} tone="blue" />
            <Stat label="Peak / lowest" value={`${report.summary.peak_concentration}% / ${report.summary.lowest_concentration}%`} />
            <Stat
              label="Avg. sentiment mix"
              value={`${report.summary.avg_positive_pct} / ${report.summary.avg_neutral_pct} / ${report.summary.avg_negative_pct}`}
              hint="positive / neutral / negative %"
            />
            <Stat label="Suggestions generated" value={report.summary.suggestions_generated} hint={`${report.summary.snapshots} snapshots`} />
          </div>

          <Card title="Session" subtitle="Timing">
            <dl className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-slate-500">Started</dt>
                <dd className="font-semibold text-slate-800 mt-0.5">{formatDateTime(report.session.started_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Ended</dt>
                <dd className="font-semibold text-slate-800 mt-0.5">{report.session.ended_at ? formatDateTime(report.session.ended_at) : 'Still live'}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Per-student summary" subtitle="Lowest attention first - candidates for follow-up">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Student</th>
                    <th className="px-3 py-2 text-left font-semibold">Avg. attention</th>
                    <th className="px-3 py-2 text-left font-semibold">Dominant sentiment</th>
                    <th className="px-3 py-2 text-left font-semibold">Confidence</th>
                    <th className="px-3 py-2 text-left font-semibold">Samples</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {report.students.map((s) => (
                    <tr key={s.student_id}>
                      <td className="px-3 py-2 font-semibold text-slate-800">{s.name}</td>
                      <td className="px-3 py-2"><AttentionBar value={s.avg_attention / 100} /></td>
                      <td className="px-3 py-2"><EmotionPill emotion={s.dominant_emotion} /></td>
                      <td className="px-3 py-2 font-mono text-slate-600">{s.avg_confidence}%</td>
                      <td className="px-3 py-2 font-mono text-slate-400">{s.samples}</td>
                    </tr>
                  ))}
                  {report.students.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">No telemetry recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
