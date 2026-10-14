import type { AuthUser } from './types';

/** Where each role lands after signing in: students join the class, instructors and admins get the dashboard. */
export function homeFor(role: AuthUser['role']) {
  return role === 'student' ? '/student' : '/';
}

/** A same-site path from a `?next=` parameter, or null (never an absolute URL - avoids open redirects). */
export function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}
