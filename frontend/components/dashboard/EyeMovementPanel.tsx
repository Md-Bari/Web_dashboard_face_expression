'use client';

import React, { useState } from 'react';
import type { EyeMovement, StudentData } from '@/lib/types';
import { Avatar } from '@/components/dashboard/Avatar';
import { Card, Stat } from '@/components/views/ui';

// Gaze map: normalised gaze (-1.5..1.5 on both axes) drawn in a 3:2 box; the screen is |x|, |y| <= 0.5
const MAP_W = 360;
const MAP_H = 240;
const RANGE = 1.5;
const SCREEN = 0.5;
const px = (x: number) => ((x + RANGE) / (2 * RANGE)) * MAP_W;
const py = (y: number) => ((y + RANGE) / (2 * RANGE)) * MAP_H;

type Tracked = StudentData & { eye: EyeMovement };

function eyeStatus(eye: EyeMovement): { label: string; className: string } {
  if (eye.drowsy) return { label: 'Eyes closing', className: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (!eye.on_screen) return { label: 'Looking away', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (eye.fixation_pct >= 50) return { label: 'Focused', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return { label: 'Scanning', className: 'bg-slate-50 text-slate-600 border-slate-200' };
}

function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const fmt = (v: number | null, digits = 0, suffix = '') => (v === null ? '—' : `${v.toFixed(digits)}${suffix}`);

export function EyeMovementPanel({ students }: { students: StudentData[] }) {
  const tracked = students.filter((s): s is Tracked => s.online && !!s.eye);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = tracked.find((s) => s.id === selectedId) ?? null;

  const onScreen = mean(tracked.map((s) => s.eye.on_screen_pct));
  const fixation = mean(tracked.map((s) => s.eye.fixation_pct));
  const shifts = mean(tracked.map((s) => s.eye.gaze_shifts_per_min));
  const closures = mean(tracked.map((s) => s.eye.closures_per_min));
  const drowsy = tracked.filter((s) => s.eye.drowsy).length;
  const rows = [...tracked].sort((a, b) => a.eye.on_screen_pct - b.eye.on_screen_pct);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Looking at screen" value={fmt(onScreen, 0, '%')} hint="share of the last minute" tone="blue" />
        <Stat label="Fixation stability" value={fmt(fixation, 0, '%')} hint="time with a steady gaze" tone="green" />
        <Stat label="Gaze shifts / min" value={fmt(shifts, 1)} hint="jumps between screen regions" />
        <Stat
          label="Eye closures / min"
          value={fmt(closures, 1)}
          hint={drowsy ? `${drowsy} with eyes closing ≥ 1 s` : 'blinks caught by a frame'}
          tone={drowsy ? 'rose' : 'slate'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Card
          title="Gaze Map"
          subtitle={selected ? `${selected.name}: scanpath of the last ${selected.eye.trail.length} readings` : 'Where each student is looking now; select a student to see their scanpath'}
          className="xl:col-span-5"
        >
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-auto" role="img" aria-label="Gaze positions relative to the screen">
            <rect x={0} y={0} width={MAP_W} height={MAP_H} rx={10} className="fill-slate-50" />
            <rect
              x={px(-SCREEN)}
              y={py(-SCREEN)}
              width={px(SCREEN) - px(-SCREEN)}
              height={py(SCREEN) - py(-SCREEN)}
              rx={6}
              className="fill-blue-50 stroke-blue-300"
              strokeWidth={1.5}
            />
            <text x={px(-SCREEN) + 6} y={py(-SCREEN) + 14} className="fill-blue-400" fontSize={10}>
              screen
            </text>
            {selected && selected.eye.trail.length > 1 && (
              <polyline
                points={selected.eye.trail.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}
                fill="none"
                className="stroke-violet-400"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            )}
            {selected?.eye.trail.map(([x, y], i) => (
              <circle key={i} cx={px(x)} cy={py(y)} r={2.5} className="fill-violet-400" opacity={0.3 + (0.7 * i) / selected.eye.trail.length} />
            ))}
            {tracked.map((s) => {
              if (!s.eye.gaze) return null;
              const [x, y] = s.eye.gaze;
              const active = s.id === selectedId;
              return (
                <g key={s.id} className="cursor-pointer" onClick={() => setSelectedId(active ? null : s.id)}>
                  <title>{`${s.name}: ${s.eye.on_screen ? 'on screen' : 'looking away'}`}</title>
                  <circle
                    cx={px(x)}
                    cy={py(y)}
                    r={active ? 7 : 5}
                    className={s.eye.on_screen ? 'fill-emerald-500' : 'fill-amber-500'}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                </g>
              );
            })}
          </svg>
          {tracked.length === 0 && <p className="text-xs text-slate-400 mt-2">Waiting for webcam readings…</p>}
        </Card>

        <Card title="Eye Movement per Student" subtitle="Last minute of webcam frames · lowest screen time first" className="xl:col-span-7">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-2 py-2 font-semibold">Student</th>
                  <th className="px-2 py-2 font-semibold text-right">On screen</th>
                  <th className="px-2 py-2 font-semibold text-right">Fixation</th>
                  <th className="px-2 py-2 font-semibold text-right">Avg. fixation</th>
                  <th className="px-2 py-2 font-semibold text-right">Shifts/min</th>
                  <th className="px-2 py-2 font-semibold text-right">Closures/min</th>
                  <th className="px-2 py-2 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const status = eyeStatus(s.eye);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                      className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 ${s.id === selectedId ? 'bg-violet-50/60' : ''}`}
                    >
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <Avatar name={s.name} src={s.avatar_url} className="w-6 h-6 rounded-full text-[9px]" imgClassName="object-cover" />
                          <span className="truncate font-medium text-slate-700">{s.name}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{s.eye.on_screen_pct}%</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{s.eye.fixation_pct}%</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{s.eye.mean_fixation_s.toFixed(1)} s</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{fmt(s.eye.gaze_shifts_per_min, 1)}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{fmt(s.eye.closures_per_min, 1)}</td>
                      <td className="px-2 py-2">
                        <span className={`inline-block whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full border ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-slate-400">
                      No eye movement data yet. It appears once students have their camera on.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="text-[11px] text-slate-400">
        Gaze combines head direction with the iris position in each eye. Fixations are periods of steady gaze
        (dispersion-threshold method), gaze shifts are jumps between screen regions. Webcams send about 3 frames
        per second, so these are coarse measures: short saccades and pupil size need a dedicated eye tracker.
      </p>
    </div>
  );
}
