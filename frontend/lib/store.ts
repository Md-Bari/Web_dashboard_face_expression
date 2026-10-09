import { create } from 'zustand';
import type {
  ActivityItem,
  AuthUser,
  EmotionType,
  ModelStatusData,
  SessionInfo,
  SessionSnapshotData,
  StudentData,
  TeachingSuggestionData,
  TrendPoint,
} from './types';

export const EMPTY_SNAPSHOT: SessionSnapshotData = {
  total_students: 0,
  positive_pct: 0,
  positive_count: 0,
  neutral_pct: 0,
  neutral_count: 0,
  negative_pct: 0,
  negative_count: 0,
  avg_concentration: 0,
  low_concentration_count: 0,
  timeline: [],
};

const MAX_ACTIVITY = 40;
const MAX_TREND = 120;
const MAX_SUGGESTIONS = 30;

type Connection = 'connecting' | 'open' | 'closed';

interface DashboardStore {
  user: AuthUser | null;
  session: SessionInfo | null;
  students: StudentData[];
  snapshot: SessionSnapshotData;
  previousSnapshot: SessionSnapshotData | null;
  trend: TrendPoint[];
  suggestions: TeachingSuggestionData[];
  modelStatus: ModelStatusData;
  activity: ActivityItem[];
  connection: Connection;
  demoEnabled: boolean;
  filter: 'all' | EmotionType;
  viewMode: 'grid' | 'list';

  setUser: (user: AuthUser | null) => void;
  setSession: (session: SessionInfo | null) => void;
  setFilter: (filter: 'all' | EmotionType) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setConnection: (connection: Connection) => void;
  setDemoEnabled: (enabled: boolean) => void;
  applyInit: (init: {
    session?: SessionInfo;
    roster?: StudentData[];
    snapshot?: SessionSnapshotData | null;
    suggestions?: TeachingSuggestionData[];
    model_status?: Partial<ModelStatusData>;
    demo?: { enabled: boolean };
  }) => void;
  applyStudentUpdate: (update: Partial<StudentData> & { student_id: number }) => void;
  applyPresence: (presence: { student_id: number; student_name?: string; online: boolean }) => void;
  applySnapshot: (snapshot: SessionSnapshotData) => void;
  addSuggestion: (suggestion: TeachingSuggestionData) => void;
  removeSuggestion: (id: number | string) => void;
  setModelStatus: (status: Partial<ModelStatusData>) => void;
  seedTrend: (points: TrendPoint[]) => void;
  logActivity: (kind: ActivityItem['kind'], text: string) => void;
  markStaleOffline: (maxAgeMs: number) => void;
  reset: () => void;
}

function trendPoint(snapshot: SessionSnapshotData): TrendPoint {
  return {
    timestamp: snapshot.timestamp || new Date().toISOString(),
    positive: snapshot.positive_pct,
    neutral: snapshot.neutral_pct,
    negative: snapshot.negative_pct,
    concentration: snapshot.avg_concentration,
  };
}

let activitySeq = 0;

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  user: null,
  session: null,
  students: [],
  snapshot: EMPTY_SNAPSHOT,
  previousSnapshot: null,
  trend: [],
  suggestions: [],
  modelStatus: { status: 'Connecting', model_name: '—', latency_ms: 0 },
  activity: [],
  connection: 'connecting',
  demoEnabled: false,
  filter: 'all',
  viewMode: 'grid',

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setFilter: (filter) => set({ filter }),
  setViewMode: (viewMode) => set({ viewMode }),
  setDemoEnabled: (demoEnabled) => set({ demoEnabled }),

  // Once the socket is open the server's init / model.status messages report the real model state
  setConnection: (connection) =>
    set((state) =>
      connection === 'open'
        ? { connection }
        : {
            connection,
            modelStatus: { ...state.modelStatus, status: connection === 'connecting' ? 'Connecting' : 'Offline' },
          }
    ),

  applyInit: (init) =>
    set((state) => {
      const snapshot = init.snapshot || state.snapshot;
      return {
        session: init.session || state.session,
        students: init.roster
          ? init.roster.map((s) => (s.online ? { ...s, last_update: Date.now() } : s))
          : state.students,
        snapshot,
        suggestions: init.suggestions || state.suggestions,
        modelStatus: { ...state.modelStatus, ...(init.model_status || {}) },
        demoEnabled: init.demo ? init.demo.enabled : state.demoEnabled,
      };
    }),

  applyStudentUpdate: (update) => {
    const { students, logActivity } = get();
    const existing = students.find((s) => s.id === update.student_id);
    const { student_id, name, ...rest } = update;
    const patch: Partial<StudentData> = {
      ...rest,
      simulated: !!update.simulated, // a real webcam frame replaces earlier demo values
      smoothed_emotion: update.emotion,
      online: true,
      has_data: true,
      last_update: Date.now(),
    };

    if (!existing) {
      set({
        students: [
          ...students,
          {
            id: student_id,
            name: name || `Student ${student_id}`,
            avatar_url: '',
            emotion: 'neutral',
            attention: 0,
            confidence: 0,
            online: true,
            ...patch,
          } as StudentData,
        ],
      });
      return;
    }

    // Only log changes the instructor cares about (a student switching sentiment)
    if (update.emotion && update.emotion !== existing.emotion && !update.simulated) {
      logActivity('emotion', `${existing.name} is now ${update.emotion} (${Math.round((update.attention ?? 0) * 100)}% attention)`);
    }
    set({ students: students.map((s) => (s.id === student_id ? { ...s, ...patch } : s)) });
  },

  applyPresence: ({ student_id, online }) => {
    const student = get().students.find((s) => s.id === student_id);
    if (!student || student.online === online) return;
    set({ students: get().students.map((s) => (s.id === student_id ? { ...s, online } : s)) });
    get().logActivity('presence', `${student.name} ${online ? 'joined' : 'left'} the session`);
  },

  applySnapshot: (snapshot) =>
    set((state) => ({
      previousSnapshot: state.snapshot,
      snapshot,
      trend: [...state.trend, trendPoint(snapshot)].slice(-MAX_TREND),
    })),

  addSuggestion: (suggestion) =>
    set((state) => {
      const rest = state.suggestions.filter((s) => s.id !== suggestion.id && s.title !== suggestion.title);
      return { suggestions: [suggestion, ...rest].slice(0, MAX_SUGGESTIONS) };
    }),

  removeSuggestion: (id) => set((state) => ({ suggestions: state.suggestions.filter((s) => s.id !== id) })),

  setModelStatus: (status) => set((state) => ({ modelStatus: { ...state.modelStatus, ...status } })),

  seedTrend: (points) =>
    set((state) => {
      // History loads asynchronously; keep any live points that arrived after it.
      const lastSeeded = points.length ? points[points.length - 1].timestamp : '';
      const live = state.trend.filter((p) => p.timestamp > lastSeeded);
      return { trend: [...points, ...live].slice(-MAX_TREND) };
    }),

  logActivity: (kind, text) =>
    set((state) => ({
      activity: [{ id: `a${++activitySeq}`, at: Date.now(), kind, text }, ...state.activity].slice(0, MAX_ACTIVITY),
    })),

  markStaleOffline: (maxAgeMs) => {
    const cutoff = Date.now() - maxAgeMs;
    const students = get().students;
    if (!students.some((s) => s.online && (s.last_update ?? 0) < cutoff)) return;
    set({ students: students.map((s) => (s.online && (s.last_update ?? 0) < cutoff ? { ...s, online: false } : s)) });
  },

  reset: () =>
    set({
      session: null,
      students: [],
      snapshot: EMPTY_SNAPSHOT,
      previousSnapshot: null,
      trend: [],
      suggestions: [],
      activity: [],
    }),
}));
