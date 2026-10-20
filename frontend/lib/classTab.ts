import { meetingLink } from './clipboard';

/**
 * Open the tab for a class meeting right away, inside the click (later, browsers block it as a
 * pop-up), showing "Starting the class…" until the session is ready.
 */
export function openPendingTab(): Window | null {
  const tab = window.open('', '_blank');
  if (tab) {
    tab.document.title = 'Starting the class…';
    tab.document.body.innerHTML =
      '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#334155">Starting the class…</p>';
  }
  return tab;
}

/** Send the pending tab to the meeting (or open one if the browser blocked it). */
export function showMeeting(tab: Window | null, joinCode: string) {
  const url = meetingLink(joinCode);
  if (tab && !tab.closed) tab.location.href = url;
  else window.open(url, '_blank');
}

/** Close the pending tab when starting the class failed. */
export function closePendingTab(tab: Window | null) {
  if (tab && !tab.closed) tab.close();
}
