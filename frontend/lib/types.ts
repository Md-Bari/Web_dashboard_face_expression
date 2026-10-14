import type { EmotionRecord, EmotionType } from './emotions';

export type { EmotionType } from './emotions';

export interface StudentData {
  id: number;
  name: string;
  avatar_url: string;
  emotion: EmotionType;
  smoothed_emotion?: EmotionType;
  attention: number; // 0.0 - 1.0
  confidence: number; // 0.0 - 1.0
  online: boolean;
  has_data?: boolean;
  /** 'screen' = anonymous face found in the instructor's shared screen (negative id) */
  source?: 'student' | 'screen';
  /** Latest live camera preview (data URL) relayed by the server; memory only, cleared when offline */
  live_thumb?: string;
  last_update?: number; // epoch ms
}

export interface ScreenFace {
  student_id: number;
  name: string;
  box: [number, number, number, number]; // x, y, w, h as fractions of the frame
  emotion: EmotionType;
  attention: number;
}

export interface CourseInfo {
  id: number;
  title: string;
  code: string;
  /** Random code behind the student join link /join/<join_code> */
  join_code: string;
  total_students: number;
}

export interface JoinInfo {
  course: { code: string; title: string };
  instructor: string;
  live_session: { id: number; title: string } | null;
}

export interface TimelinePoint {
  timestamp?: string;
  time: string;
  concentration: number;
}

export interface SessionSnapshotData {
  total_students: number;
  emotion_counts: EmotionRecord;
  emotion_pcts: EmotionRecord;
  avg_concentration: number;
  low_concentration_count: number;
  timestamp?: string;
  timeline?: TimelinePoint[];
}

export interface TeachingSuggestionData {
  id: number | string;
  title: string;
  description: string;
  category: 'CONFUSION' | 'ENGAGEMENT' | 'FATIGUE' | 'PARTICIPATION';
  icon: 'book' | 'users' | 'clock' | 'message-square';
  created_at?: string;
}

export interface ModelStatusData {
  status: 'Active' | 'No model' | 'Connecting' | 'Offline';
  model_name: string;
  latency_ms: number;
  custom_model?: boolean;
}

export interface SessionInfo {
  id: number;
  title: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  started_at: string | null;
  ended_at: string | null;
  course?: CourseInfo;
}

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: 'instructor' | 'student' | 'admin';
  avatar_url: string;
  display_title: string;
}

/** Class share (%) of each expression plus average concentration at one snapshot */
export type TrendPoint = EmotionRecord & {
  timestamp: string;
  concentration: number;
};

export interface ActivityItem {
  id: string;
  at: number;
  kind: 'emotion' | 'presence' | 'suggestion' | 'system';
  text: string;
}

export interface ReportData {
  session: SessionInfo;
  summary: {
    snapshots: number;
    avg_concentration: number;
    peak_concentration: number;
    lowest_concentration: number;
    avg_emotion_pcts: EmotionRecord;
    suggestions_generated: number;
  };
  students: {
    student_id: number;
    name: string;
    avg_attention: number;
    dominant_emotion: EmotionType;
    avg_confidence: number;
    samples: number;
  }[];
  timeline: TimelinePoint[];
}
