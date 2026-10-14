/**
 * Camera / screen access with errors a person can act on. Browsers only expose
 * getUserMedia/getDisplayMedia on secure origins (https:// or localhost), and the
 * raw DOMException messages ("Could not start video source") explain nothing.
 */

export type MediaKind = 'camera' | 'screen';

export class MediaAccessError extends Error {}

function insecureMessage() {
  return 'Camera and screen access only work over HTTPS or on localhost. Open the app through its https:// link (the Cloudflare tunnel) or http://localhost.';
}

export function describeMediaError(err: unknown, kind: MediaKind): string {
  if (err instanceof MediaAccessError) return err.message;
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  const what = kind === 'camera' ? 'camera' : 'screen sharing';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return kind === 'camera'
        ? 'Camera permission was blocked. Click the camera icon in the address bar, allow access, then try again.'
        : 'Screen sharing was cancelled or blocked.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is being used by another app (Zoom, Teams, Meet or another browser tab). Close it there and try again.';
    case 'NotSupportedError':
      return `This browser does not support ${what}.`;
    default:
      return `Could not start ${what}${err instanceof Error && err.message ? `: ${err.message}` : '.'}`;
  }
}

function mediaDevices(kind: MediaKind) {
  if (typeof window !== 'undefined' && !window.isSecureContext) throw new MediaAccessError(insecureMessage());
  const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!devices || (kind === 'camera' ? !devices.getUserMedia : !devices.getDisplayMedia)) {
    throw new MediaAccessError(
      kind === 'screen'
        ? 'This browser cannot share the screen. Use Chrome, Edge or Firefox on a computer (phones cannot share their screen to a web page).'
        : 'This browser cannot access the camera.'
    );
  }
  return devices;
}

/** Open a camera, falling back to any camera when the preferred size/facing is unavailable. */
export async function openCamera(preferred: MediaTrackConstraints): Promise<MediaStream> {
  const devices = mediaDevices('camera');
  try {
    return await devices.getUserMedia({ video: preferred, audio: false });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'OverconstrainedError' || name === 'NotReadableError') {
      return devices.getUserMedia({ video: true, audio: false });
    }
    throw err;
  }
}

export async function openScreen(): Promise<MediaStream> {
  return mediaDevices('screen').getDisplayMedia({ video: { frameRate: 5 }, audio: false });
}
