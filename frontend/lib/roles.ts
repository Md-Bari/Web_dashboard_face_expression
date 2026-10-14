import type { AuthUser } from './types';

/** Where each role lands after signing in: students join the class, instructors and admins get the dashboard. */
export function homeFor(role: AuthUser['role']) {
  return role === 'student' ? '/student' : '/';
}
