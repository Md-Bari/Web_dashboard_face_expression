import type { AuthUser } from './types';

/** Where each role lands after signing in: students join the class, instructors get the dashboard, admins the admin portal. */
export function homeFor(role: AuthUser['role']) {
  if (role === 'student') return '/student';
  return role === 'admin' ? '/admin-portal' : '/';
}

/** A same-site path from a `?next=` parameter, or null (never an absolute URL - avoids open redirects). */
export function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}
