// Resolved at call time so the app works both behind the single-origin reverse
// proxy / Cloudflare tunnel (default) and against a separately hosted backend.
//
// By default API and websocket URLs are same-origin: nginx (fronted by
// cloudflared) routes /api, /admin, /static and /ws to Django and everything
// else to Next.js. Set NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL only when the
// backend lives on a different origin (e.g. plain local dev on :8000).
function explicit(value: string | undefined) {
  return value && value.trim() ? value.replace(/\/+$/, '') : '';
}

function currentHost() {
  return typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
}

export function apiBase() {
  return explicit(process.env.NEXT_PUBLIC_API_URL);
}

export function wsBase() {
  const configured = explicit(process.env.NEXT_PUBLIC_WS_URL);
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${currentHost()}`;
  }
  return '';
}
