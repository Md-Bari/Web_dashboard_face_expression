import { apiBase } from './config';
import type { AuthUser, CourseInfo, ReportData, SessionInfo, SessionSnapshotData, TeachingSuggestionData } from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

  // Access cookie expired: try the refresh cookie once, then repeat the request.
  if (res.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    const refreshed = await fetch(`${apiBase()}/api/auth/refresh/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (refreshed.ok) return request<T>(path, init, true);
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.detail || body.error || message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: AuthUser }>('/api/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<unknown>('/api/auth/logout/', { method: 'POST', body: '{}' }),
  me: () => request<AuthUser>('/api/auth/me/'),

  currentSession: () =>
    request<SessionInfo & { session_code: string; course: CourseInfo }>('/api/sessions/current/'),
  courses: () => request<CourseInfo[]>('/api/courses/'),
  createCourse: (code: string, title: string) =>
    request<CourseInfo>('/api/courses/', { method: 'POST', body: JSON.stringify({ code, title }) }),
  createSession: (courseId: number, title: string) =>
    request<SessionInfo>('/api/sessions/', { method: 'POST', body: JSON.stringify({ course_id: courseId, title }) }),
  endSession: (id: number) => request<{ status: string }>(`/api/sessions/${id}/end/`, { method: 'POST', body: '{}' }),
  startSession: (id: number) => request<{ status: string }>(`/api/sessions/${id}/start/`, { method: 'POST', body: '{}' }),

  history: (id: number) => request<(SessionSnapshotData & { id: number })[]>(`/api/analytics/sessions/${id}/history/`),
  suggestions: (id: number, all = false) =>
    request<TeachingSuggestionData[]>(`/api/analytics/sessions/${id}/suggestions/${all ? '?all=1' : ''}`),
  dismissSuggestion: (id: number, suggestionId: number | string) =>
    request<unknown>(`/api/analytics/sessions/${id}/suggestions/`, {
      method: 'POST',
      body: JSON.stringify({ suggestion_id: suggestionId }),
    }),
  report: (id: number) => request<ReportData>(`/api/analytics/sessions/${id}/report/`),
  reportCsvUrl: (id: number) => `${apiBase()}/api/analytics/sessions/${id}/report.csv`,

  publicLiveSession: () =>
    request<{ id: number; title: string; course: string; students: { id: number; name: string; avatar_url: string }[] }>(
      '/api/public/live-session/'
    ),
};
