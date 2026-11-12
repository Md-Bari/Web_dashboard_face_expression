import type { StudentData } from './types';

/**
 * Webcams are shown mirrored everywhere, the way each person sees themselves in the meeting,
 * so everyone sees the same picture. Faces cut from a shared screen (negative ids) are never
 * mirrored, and neither is a profile picture shown when there is no live preview.
 */
export function mirrorPreview(student: Pick<StudentData, 'id' | 'live_thumb'>): boolean {
  return student.id > 0 && !!student.live_thumb;
}
