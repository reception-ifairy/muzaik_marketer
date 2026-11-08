import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { APP } from '../config';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Only allow http(s) links from model output to be rendered as anchors. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(APP.locale, {
    timeZone: APP.timezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SESSION_EXPIRED_EVENT = 'app-session-expired';

// Signals the App shell that the owner session is gone (API returned 401)
export function notifySessionExpired() {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}
