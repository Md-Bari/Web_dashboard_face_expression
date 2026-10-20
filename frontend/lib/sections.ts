import { useMemo } from 'react';
import { useDashboardStore, type SectionFilter } from './store';
import { EMOTIONS, EMPTY_EMOTIONS, type EmotionRecord } from './emotions';
import type { SectionRef, SessionInfo, SessionSnapshotData, StudentData } from './types';

/** Whether a student (or screen face, which has no section) passes the dashboard's section filter. */
export function matchesSection(section: SectionRef | null | undefined, filter: SectionFilter, isScreenFace = false) {
  if (filter === 'all') return true;
  if (isScreenFace) return false;
  if (filter === 'none') return !section;
  return section?.id === filter;
}

/** The sections a session's students can be filtered by: its own sections, or all of the class's. */
export function sectionOptions(session: SessionInfo | null): SectionRef[] {
  if (!session) return [];
  if (session.sections && session.sections.length) return session.sections;
  return (session.course?.sections ?? []).map(({ id, name }) => ({ id, name }));
}

/** Live class figures computed from the students' latest readings (used for one section). */
function snapshotOf(students: StudentData[], base: SessionSnapshotData): SessionSnapshotData {
  const live = students.filter((s) => s.online && s.has_data !== false);
  const counts: EmotionRecord = { ...EMPTY_EMOTIONS };
  for (const s of live) counts[s.smoothed_emotion || s.emotion] += 1;
  const pcts = { ...EMPTY_EMOTIONS };
  for (const e of EMOTIONS) pcts[e] = live.length ? Math.round((counts[e] / live.length) * 100) : 0;
  const attention = live.map((s) => s.attention);
  return {
    ...base, // the timeline over time stays class-wide (history is stored for the whole session)
    total_students: live.length,
    emotion_counts: counts,
    emotion_pcts: pcts,
    avg_concentration: attention.length ? Math.round((attention.reduce((a, b) => a + b, 0) / attention.length) * 100) : 0,
    low_concentration_count: attention.filter((a) => a < 0.5).length,
  };
}

/**
 * What the monitoring pages show for the chosen section: its students and, when a section is
 * picked, live figures computed from them. With "All sections" this is the server's class data.
 */
export function useSectionView() {
  const { students, snapshot, previousSnapshot, sectionFilter, session } = useDashboardStore();
  return useMemo(() => {
    const active = sectionFilter !== 'all';
    const shown = students.filter((s) => matchesSection(s.section, sectionFilter, s.source === 'screen'));
    const name =
      sectionFilter === 'none'
        ? 'No section'
        : typeof sectionFilter === 'number'
        ? `Section ${sectionOptions(session).find((s) => s.id === sectionFilter)?.name ?? ''}`
        : 'All sections';
    return {
      active,
      label: name,
      students: shown,
      snapshot: active ? snapshotOf(shown, snapshot) : snapshot,
      // Change arrows compare class-wide readings, so they are hidden for one section
      previousSnapshot: active ? null : previousSnapshot,
    };
  }, [students, snapshot, previousSnapshot, sectionFilter, session]);
}
