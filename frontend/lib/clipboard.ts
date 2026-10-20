/** Copy text; false when the Clipboard API is unavailable (plain http) so the caller can show the text instead. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const inviteLink = (code: string) => `${window.location.origin}/join/${code}`;
export const meetingLink = (code: string) => `${window.location.origin}/meet/${code}`;
