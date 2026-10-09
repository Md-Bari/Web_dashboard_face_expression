export function formatClock(iso?: string | number | null) {
  if (!iso) return '--:--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function emotionLabel(emotion: string) {
  return emotion.charAt(0).toUpperCase() + emotion.slice(1);
}

export function concentrationLabel(value: number) {
  if (value >= 70) return { text: 'Good', className: 'text-emerald-600' };
  if (value >= 50) return { text: 'Fair', className: 'text-amber-600' };
  return { text: 'Low', className: 'text-rose-600' };
}
