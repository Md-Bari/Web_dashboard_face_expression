// Resolved at call time so the app also works when opened from another device on the LAN
// (the backend is assumed to run on the same host, port 8000, unless NEXT_PUBLIC_* says otherwise).
function host() {
  return typeof window !== 'undefined' ? window.location.hostname : 'localhost';
}

export function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL || `http://${host()}:8000`;
}

export function wsBase() {
  return process.env.NEXT_PUBLIC_WS_URL || `ws://${host()}:8000`;
}
