'use client';

import { useCallback, useState } from 'react';
import { api } from './api';
import { useDashboardStore } from './store';

/**
 * Clears the auth cookies on the backend, then does a full navigation to /login so the
 * instructor socket, store and client router cache are all discarded.
 */
export function useLogout() {
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await api.logout();
    } catch {
      // Still leave the dashboard; the cookies expire on their own if the server was unreachable
    }
    useDashboardStore.getState().setUser(null);
    useDashboardStore.getState().reset();
    try {
      // Nothing of this account stays in the browser for the next person who signs in here
      window.localStorage.removeItem('emp-edu:dashboard-session');
    } catch {
      // storage unavailable
    }
    window.location.replace('/login');
  }, []);

  return { logout, loggingOut };
}
