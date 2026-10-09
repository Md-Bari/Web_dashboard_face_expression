'use client';

import React from 'react';
import { Smile, Meh, Frown, Minus } from 'lucide-react';
import { StudentData } from '@/lib/types';
import { Avatar } from './Avatar';

interface StudentCardProps {
  student: StudentData;
  index: number;
  onClick?: (student: StudentData) => void;
}

export function StudentCard({ student, index, onClick }: StudentCardProps) {
  const emotion = student.smoothed_emotion || student.emotion;

  const emotionBadgeConfig = {
    positive: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: Smile,
      label: 'Positive',
      dot: 'bg-emerald-500',
    },
    neutral: {
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: Meh,
      label: 'Neutral',
      dot: 'bg-amber-500',
    },
    negative: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: Frown,
      label: 'Negative',
      dot: 'bg-rose-500',
    },
  }[emotion] || {
    bg: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: Meh,
    label: 'Neutral',
    dot: 'bg-slate-400',
  };

  // Never show an emotion/attention for a student nothing has been measured (or simulated) for
  const noData = student.has_data === false;
  const badge = noData
    ? { bg: 'bg-slate-50 text-slate-500 border-slate-200', icon: Minus, label: 'No data', dot: 'bg-slate-400' }
    : emotionBadgeConfig;
  const Icon = badge.icon;

  return (
    <div
      onClick={() => onClick?.(student)}
      className={`bg-white rounded-xl border border-slate-200/80 p-2 flex flex-col items-center shadow-2xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group select-none ${
        student.online ? '' : 'opacity-50'
      }`}
    >
      {/* Student Webcam Frame */}
      <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-100">
        <Avatar
          name={student.name}
          src={student.avatar_url}
          className="w-full h-full text-lg"
          imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Index Badge */}
        <span className="absolute top-1 left-1 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none shadow-xs">
          {index}
        </span>

        {/* Live Attention Indicator Dot */}
        {!noData && (
          <div className="absolute top-1 right-1 flex items-center gap-1 bg-black/60 backdrop-blur-xs px-1.5 py-0.5 rounded-md">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                student.attention >= 0.75
                  ? 'bg-emerald-400'
                  : student.attention >= 0.5
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            ></span>
            <span className="text-[9px] text-white font-mono leading-none">
              {Math.round(student.attention * 100)}%
            </span>
          </div>
        )}

        {/* Demo Telemetry values are generated, not measured */}
        {!noData && student.simulated && (
          <span
            className="absolute bottom-1 left-1 bg-violet-600/90 text-white text-[8px] font-bold tracking-wide px-1 py-0.5 rounded leading-none"
            title="Simulated by Demo Telemetry - not measured from a webcam"
          >
            SIM
          </span>
        )}
      </div>

      {/* Student Name */}
      <h3 className="mt-1.5 text-xs font-semibold text-slate-800 truncate max-w-full text-center">
        {student.name}
      </h3>

      {/* Sentiment Status Pill */}
      <div
        className={`mt-1 flex items-center justify-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium leading-tight w-full max-w-[90px] ${badge.bg}`}
      >
        <Icon className="w-3 h-3 shrink-0" />
        <span className="truncate">{badge.label}</span>
      </div>
    </div>
  );
}

