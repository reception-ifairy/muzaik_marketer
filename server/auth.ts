import crypto from 'crypto';
import type { Request, Response, NextFunction, Router } from 'express';
import express from 'express';
import { APP } from '../src/config';

// Single-owner authentication (one login for the whole app).
// Credentials come from env: OWNER_LOGIN, OWNER_PASSWORD, SESSION_SECRET.
// Session is a stateless HMAC-signed, httpOnly cookie — no database needed.

const COOKIE_NAME = `${APP.id}_session`;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dni
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const OWNER_LOGIN = (process.env.OWNER_LOGIN || 'admin').trim().toLowerCase();
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  console.warn('[Auth] SESSION_SECRET nie ustawiony — sesje wygasną po restarcie serwera.');
}
if (!OWNER_PASSWORD) {
  console.warn('[Auth] OWNER_PASSWORD nie ustawione — logowanie właścicielki jest zablokowane.');
}

interface SessionPayload {
  sub: string;
  exp: number;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  // Hash both sides so lengths match and comparison is constant-time
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createToken(sub: string): string {
  const payload: SessionPayload = { sub, exp: Date.now() + SESSION_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

function verifyToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig || !safeEqual(sig, sign(data))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.sub !== OWNER_LOGIN || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: IS_PROD,
  path: '/',
};

// Simple in-memory brute-force protection per IP
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

function isLocked(ip: string): number {
  const entry = failedAttempts.get(ip);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
  if (entry.lockedUntil) failedAttempts.delete(ip);
  return 0;
}

function registerFailure(ip: string) {
  const entry = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  failedAttempts.set(ip, entry);
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (verifyToken(readCookie(req, COOKIE_NAME))) return next();
  res.status(401).json({ error: 'Sesja wygasła lub brak dostępu. Zaloguj się ponownie.' });
}

export function createAuthRouter(): Router {
  const router = express.Router();

  router.get('/me', (req, res) => {
    const session = verifyToken(readCookie(req, COOKIE_NAME));
    if (!session) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, user: { login: session.sub, role: 'owner' } });
  });

  router.post('/login', (req, res) => {
    const ip = req.ip || 'unknown';
    const lockedFor = isLocked(ip);
    if (lockedFor) {
      return res.status(429).json({
        error: `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${Math.ceil(lockedFor / 60000)} min.`,
      });
    }

    if (!OWNER_PASSWORD) {
      return res.status(503).json({
        error: 'Logowanie nie jest skonfigurowane. Ustaw OWNER_PASSWORD w zmiennych środowiskowych serwera.',
      });
    }

    const login = String(req.body?.login || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const loginOk = safeEqual(login, OWNER_LOGIN);
    const passwordOk = safeEqual(password, OWNER_PASSWORD);

    if (!loginOk || !passwordOk) {
      registerFailure(ip);
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
    }

    failedAttempts.delete(ip);
    res.cookie(COOKIE_NAME, createToken(OWNER_LOGIN), { ...cookieOptions, maxAge: SESSION_TTL_MS });
    res.json({ authenticated: true, user: { login: OWNER_LOGIN, role: 'owner' } });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ authenticated: false });
  });

  return router;
}
