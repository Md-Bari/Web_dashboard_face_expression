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
  /** Set when the latest reading came from the shared screen */
  via?: 'screen';
  /** The face on the shared screen behind this tile (negative id), used to (re)name it */
  screen_id?: number;
  /** How the face got its name: recognised automatically, or named by the instructor */
  match?: ScreenMatch;
  section?: SectionRef | null;
}

export interface SectionRef {
  id: number;
  name: string;
}

export type ScreenMatch = 'auto' | 'manual' | null;

export interface ScreenFace {
  /** The student's user id when recognised, otherwise the screen face id (negative) */
  student_id: number;
  screen_id: number;
  name: string;
  match: ScreenMatch;
  box: [number, number, number, number]; // x, y, w, h as fractions of the frame
  emotion: EmotionType;
  attention: number;
  /** Face cut from the analysed frame by the server (memory only) */
  thumb?: string | null;
}

export interface SectionInfo extends SectionRef {
  /** Invite code: /join/<join_code> puts new students straight into this section */
  join_code: string;
  total_students: number;
}

export interface CourseInfo {
  id: number;
  title: string;
  code: string;
  /** Random code behind the class-wide join link /join/<join_code> (students land without a section) */
  join_code: string;
  total_students: number;
  unassigned_students?: number;
  sections?: SectionInfo[];
}

export interface EnrollmentRow {
  id: number;
  student: AuthUser;
  course: { id: number; code: string; title: string };
  section: SectionRef | null;
  enrolled_at: string;
}

export interface ImportResult {
  added: string[];
  moved: string[];
  already: string[];
  not_found: string[];
  not_student: string[];
}

export interface MeetInfo {
  session: {
    id: number;
    title: string;
    status: SessionInfo['status'];
    scheduled_for: string | null;
    started_at: string | null;
    sections: string[];
  };
  course: { code: string; title: string };
  instructor: string;
  meetings_enabled: boolean;
  /** New students can create their account from this link (it decides their section) */
  can_register: boolean;
  viewer: {
    signed_in: boolean;
    name?: string;
    role?: AuthUser['role'];
    host?: boolean;
    enrolled?: boolean;
    allowed?: boolean;
    consent_given?: boolean;
  };
}

/** Pass for the LiveKit meeting room of a session */
export interface MeetingPass {
  url: string;
  token: string;
  room: string;
  identity: string;
  host: boolean;
}

export interface ExpressionPhoto {
  id: number;
  confidence: number; // percent
  created_at: string;
  url: string; // API path; fetch with the session cookie
}

export interface ExpressionPhotoRow {
  student_id: number;
  name: string;
  username: string;
  section?: SectionRef | null;
  photos: Partial<Record<EmotionType, ExpressionPhoto>>;
}

export interface JoinInfo {
  course: { code: string; title: string };
  /** Set when the link is a section invite */
  section?: string | null;
  instructor: string;
  live_session: { id: number; title: string; join_code?: string } | null;
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
  /** Meeting link /meet/<join_code> */
  join_code?: string;
  session_code?: string;
  /** Sections this session is for; empty = the whole class */
  sections?: SectionRef[];
  scheduled_for?: string | null;
  attendee_count?: number;
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
    section?: SectionRef | null;
    avg_attention: number;
    dominant_emotion: EmotionType;
    emotion_pcts?: EmotionRecord;
    avg_confidence: number;
    samples: number;
  }[];
  timeline: TimelinePoint[];
}
