'use client';

import { useEffect } from 'react';
import { useDashboardStore } from './store';
import { wsBase } from './config';
import { handleScreenResult } from './screenCapture';
import type {
  ModelStatusData,
  SessionInfo,
  SessionSnapshotData,
  StudentData,
  TeachingSuggestionData,
} from './types';

interface ServerMessage {
  type: string;
  data?: unknown;
  // init payload fields
  session?: SessionInfo;
  roster?: StudentData[];
  snapshot?: SessionSnapshotData | null;
  suggestions?: TeachingSuggestionData[];
  model_status?: Partial<ModelStatusData>;
}

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;

let activeSocket: WebSocket | null = null;

/** Send an action (e.g. trigger_snapshot) over the live instructor socket. */
export function sendInstructorAction(action: string, payload: Record<string, unknown> = {}) {
  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.send(JSON.stringify({ action, ...payload }));
    return true;
  }
  return false;
}

/**
 * Connects to ws/instructor/<sessionId>/ and keeps the dashboard store in sync.
 * `onAuthFailure` fires when the server rejects the handshake identity (4401/4403).
 */
export function useInstructorSocket(sessionId: number | null, onAuthFailure?: () => void) {
  useEffect(() => {
    if (sessionId === null) return;

    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const store = () => useDashboardStore.getState();

    function handle(payload: ServerMessage) {
      switch (payload.type) {
        case 'init':
          store().applyInit({
            session: payload.session,
            roster: payload.roster,
            snapshot: payload.snapshot,
            suggestions: payload.suggestions,
            model_status: payload.model_status,
          });
          break;
        case 'student.update':
          store().applyStudentUpdate(payload.data as Parameters<ReturnType<typeof store>['applyStudentUpdate']>[0]);
          break;
        case 'presence':
          store().applyPresence(payload.data as Parameters<ReturnType<typeof store>['applyPresence']>[0]);
          break;
        case 'session.snapshot':
          store().applySnapshot(payload.data as SessionSnapshotData);
          break;
        case 'suggestion.new': {
          const suggestion = payload.data as TeachingSuggestionData;
          store().addSuggestion(suggestion);
          store().logActivity('suggestion', `New suggestion: ${suggestion.title}`);
          break;
        }
        case 'screen.result':
          handleScreenResult(payload as unknown as Parameters<typeof handleScreenResult>[0]);
          break;
        case 'model.status':
          store().setModelStatus(payload.data as Partial<ModelStatusData>);
          break;
        case 'session.status': {
          const next = payload.data as SessionInfo;
          const current = store().session;
          if (current?.status !== next.status) {
            store().logActivity('system', `Session ${next.status === 'LIVE' ? 'started' : 'ended'}`);
          }
          store().setSession({ ...current, ...next });
          break;
        }
      }
    }

    function connect() {
      store().setConnection('connecting');
      const ws = new WebSocket(`${wsBase()}/ws/instructor/${sessionId}/`);
      activeSocket = ws;

      ws.onopen = () => {
        attempts = 0;
        store().setConnection('open');
      };

      ws.onmessage = (event) => {
        try {
          handle(JSON.parse(event.data));
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = (event) => {
        if (activeSocket === ws) activeSocket = null;
        if (disposed) return;
        store().setConnection('closed');
        if (event.code === CLOSE_UNAUTHORIZED || event.code === CLOSE_FORBIDDEN) {
          onAuthFailure?.();
          return;
        }
        // Exponential backoff: 1s, 2s, 4s ... capped at 10s
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (activeSocket) {
        activeSocket.close();
        activeSocket = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
