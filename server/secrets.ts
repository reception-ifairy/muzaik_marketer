import crypto from 'crypto';
import { APP } from '../src/config';

// API keys are stored encrypted (AES-256-GCM). The key comes from SETTINGS_SECRET (64 hex chars);
// local installs without it derive one from SESSION_SECRET, which start.ps1 always generates.

function encryptionKey(): Buffer | null {
  const explicit = process.env.SETTINGS_SECRET?.trim();
  if (explicit && /^[0-9a-f]{64}$/i.test(explicit)) return Buffer.from(explicit, 'hex');
  const fallback = process.env.SETTINGS_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!fallback) return null;
  return crypto.createHash('sha256').update(`${APP.id}-settings:${fallback}`).digest();
}

export class SecretsUnavailableError extends Error {
  constructor() {
    super('Serwer nie ma klucza szyfrowania (SETTINGS_SECRET lub SESSION_SECRET w .env), więc nie może bezpiecznie zapisać klucza API.');
  }
}

export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  if (!key) throw new SecretsUnavailableError();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Returns null when the value can't be decrypted (e.g. the secret changed). */
export function decryptSecret(stored: string): string | null {
  const key = encryptionKey();
  const [version, iv, tag, data] = stored.split(':');
  if (!key || version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** "sk-ant-api03-…" -> "sk-…a1b2": enough to recognise a key without revealing it. */
export function keyHint(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '…';
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}
