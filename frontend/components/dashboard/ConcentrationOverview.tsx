'use client';

import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useDashboardStore } from '@/lib/store';
import { Eye, X } from 'lucide-react';
import { formatClock } from '@/lib/format';
import { Avatar } from './Avatar';

export function ConcentrationOverview() {
  const { snapshot, students } = useDashboardStore();
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Server timeline points carry ISO timestamps; label them in the local time zone
  const timelineData = (snapshot.timeline || []).map((p) => ({
    ...p,
    time: p.timestamp ? formatClock(p.timestamp) : p.time,
  }));

  // SVG circular gauge calculation
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (snapshot.avg_concentration / 100) * circumference;

  const lowConcentrationStudents = students.filter((s) => s.online && s.has_data !== false && s.attention < 0.5);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-900">
          Concentration Overview <span className="text-xs font-normal text-slate-500">(Eye Tracking)</span>
        </h3>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Line Chart */}
        <div className="w-full sm:w-[65%] h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timelineData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(val) => `${val}%`}
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, 'Attention']}
                contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #e2e8f0' }}
              />
              <Line
                type="monotone"
                dataKey="concentration"
                stroke="#3B82F6"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 4, stroke: '#3B82F6', strokeWidth: 2, fill: '#ffffff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Circular Progress Gauge & Low Attention Warning */}
        <div className="w-full sm:w-[35%] flex flex-col items-center justify-center text-center pl-2 sm:border-l border-slate-100">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
              {/* Background circle */}
              <circle
                cx="40"
                cy="40"
                r={radius}
                className="text-slate-100"
                strokeWidth="7"
                stroke="currentColor"
                fill="transparent"
              />
              {/* Progress stroke */}
              <circle
                cx="40"
                cy="40"
                r={radius}
                className="text-blue-500 transition-all duration-700 ease-out"
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-sm font-bold text-slate-900 leading-tight">
                {Math.round(snapshot.avg_concentration)}%
              </span>
              <span className="text-[9px] text-slate-400 font-medium">Average</span>
            </div>
          </div>

          <div className="mt-1.5">
            <p className="text-xs font-semibold text-rose-500">
              {snapshot.low_concentration_count} Students
            </p>
            <p className="text-[10px] text-slate-400">Low Concentration</p>
          </div>

          <button
            onClick={() => setDetailsModalOpen(true)}
            className="mt-2 px-3 py-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg hover:bg-blue-50/50 transition-colors"
          >
            View Details
          </button>
        </div>
      </div>

      {/* Details Modal */}
      {detailsModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setDetailsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Eye className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                Eye Tracking & Concentration Telemetry
              </h3>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Students identified with continuous gaze divergence or low attention scores (&lt;50% over rolling 10s window):
            </p>

            <div className="space-y-2 max-h-56 overflow-y-auto mb-4">
              {lowConcentrationStudents.length === 0 ? (
                <p className="text-xs text-emerald-600 italic">All students currently maintain strong engagement.</p>
              ) : (
                lowConcentrationStudents.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} src={s.avatar_url} className="w-7 h-7 rounded-full text-[10px]" imgClassName="object-cover" />
                      <div>
                        <p className="font-semibold text-slate-800">{s.name}</p>
                        <p className="text-[10px] text-slate-400">ID: #{s.id}</p>
                      </div>
                    </div>
                    <span className="font-bold text-rose-500 font-mono">
                      {Math.round(s.attention * 100)}%
                    </span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setDetailsModalOpen(false)}
              className="w-full py-2 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

