'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Trophy, Cpu, ShieldCheck, Lightbulb } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { Card, PageTitle } from './ui';

interface Insight {
  tone: 'good' | 'warn' | 'info';
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

const TONE = {
  good: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  warn: 'bg-amber-50 border-amber-100 text-amber-700',
  info: 'bg-blue-50 border-blue-100 text-blue-700',
};

/** Plain-language findings derived from the live telemetry (explainability for the instructor). */
export function InsightsView() {
  const { snapshot, trend, students, modelStatus } = useDashboardStore();

  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const reporting = students.filter((s) => s.online && s.has_data !== false);

    if (trend.length >= 4) {
      const recent = trend.slice(-3).reduce((a, p) => a + p.concentration, 0) / 3;
      const earlier = trend.slice(0, Math.max(1, trend.length - 3));
      const base = earlier.reduce((a, p) => a + p.concentration, 0) / earlier.length;
      const delta = Math.round(recent - base);
      if (delta <= -5) {
        out.push({ tone: 'warn', icon: TrendingDown, title: `Concentration is falling (${delta} pts)`, body: 'Recent attention is below the session average. A short break or an interactive activity may recover focus.' });
      } else if (delta >= 5) {
        out.push({ tone: 'good', icon: TrendingUp, title: `Concentration is rising (+${delta} pts)`, body: 'Recent attention is above the session average - whatever you just changed is working.' });
      }
    }

    const p = snapshot.emotion_pcts;
    const worried = p.sad + p.fear;
    if (p.angry >= 15) {
      out.push({ tone: 'warn', icon: AlertTriangle, title: `${p.angry}% of the class looks angry`, body: 'Frustration is building. Slow down, check understanding and invite questions.' });
    }
    if (worried >= 20) {
      out.push({ tone: 'warn', icon: AlertTriangle, title: `${worried}% of the class looks sad or fearful`, body: 'Students may be lost or anxious. Re-explain the last concept with a worked example.' });
    }
    if (p.surprise >= 25) {
      out.push({ tone: 'info', icon: Lightbulb, title: `${p.surprise}% of the class looks surprised`, body: 'Something just caught them off guard. A short recap helps it sink in.' });
    }
    if (p.happy >= 50) {
      out.push({ tone: 'good', icon: Trophy, title: `${p.happy}% of the class looks happy`, body: 'Engagement is high. Good moment to introduce a harder topic.' });
    }

    if (snapshot.low_concentration_count > 0) {
      const names = reporting
        .filter((s) => s.attention < 0.5)
        .slice(0, 4)
        .map((s) => s.name)
        .join(', ');
      out.push({ tone: 'warn', icon: AlertTriangle, title: `${snapshot.low_concentration_count} student(s) with low gaze attention`, body: names ? `Currently: ${names}. A direct question can re-engage them.` : 'Open the Eye Tracking tab for details.' });
    }

    if (reporting.length > 0) {
      const top = [...reporting].sort((a, b) => b.attention - a.attention)[0];
      out.push({ tone: 'info', icon: Trophy, title: `${top.name} is the most attentive student`, body: `Attention score ${Math.round(top.attention * 100)}% with ${Math.round(top.confidence * 100)}% model confidence.` });
    }

    out.push({
      tone: 'info',
      icon: Cpu,
      title: modelStatus.custom_model ? 'Custom ONNX model active' : 'No AI model loaded',
      body: modelStatus.custom_model
        ? `Predictions come from ${modelStatus.model_name} (${modelStatus.latency_ms} ms per frame).`
        : 'Webcam frames produce no emotion or attention data until the model files (expression .onnx, YuNet face detector and deployment_metadata.json) are in backend/inference/models. They are picked up automatically within seconds.',
    });
    return out;
  }, [snapshot, trend, students, modelStatus]);

  return (
    <div className="space-y-4">
      <PageTitle title="AI Insights" subtitle="Findings derived from real-time sentiment and gaze telemetry" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {insights.map((item, i) => (
          <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border ${TONE[item.tone]}`}>
            <item.icon className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold">{item.title}</h3>
              <p className="text-xs mt-1 text-slate-600 leading-relaxed">{item.body}</p>
            </div>
          </div>
        ))}
      </div>

      <Card title="How these insights are produced" subtitle="Explainability">
        <ul className="space-y-2.5 text-xs text-slate-600">
          <li className="flex gap-2.5"><ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> Each face is reduced to one of six expressions (happy, surprise, neutral, fear, sad, angry) and an attention score (0-1). No image is stored.</li>
          <li className="flex gap-2.5"><ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> Per-student values are smoothed over a 10-second window: majority vote for sentiment, mean for attention.</li>
          <li className="flex gap-2.5"><Lightbulb className="w-4 h-4 text-amber-500 shrink-0" /> Class metrics are aggregated every 3 seconds. Suggestions are rule-based: sad + fear &ge; 20%, angry &ge; 15%, surprise &ge; 25%, neutral &ge; 50%, or low attention triggers an intervention.</li>
        </ul>
      </Card>
    </div>
  );
}
