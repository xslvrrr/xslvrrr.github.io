import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StartSessionData {
  loggedIn: boolean;
  username?: string;
  school?: string;
  userId?: string;
  portalUid?: string;
  portalCookies?: string[];
  portalUrl?: string;
  timestamp?: string;
}

const cookieName = 'millennium_session';
const sessionTtlSeconds = 7 * 24 * 60 * 60;
const devSessionSecret = 'this-is-a-development-secret-change-in-production-minimum-32-chars';
const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV !== 'production' ? devSessionSecret : undefined);

if (!sessionSecret) {
  throw new Error('SESSION_SECRET is required in production');
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret!).update(payload).digest('base64url');
}

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};

  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator === -1) return [part, ''];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

export function readStartSession(request: Request): StartSessionData {
  const cookie = parseCookieHeader(request.headers.get('cookie'))[cookieName];
  if (!cookie) return { loggedIn: false };

  const [payload, signature] = cookie.split('.');
  if (!payload || !signature) return { loggedIn: false };

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { loggedIn: false };
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as StartSessionData;
    const issuedAt = new Date(session.timestamp || '').getTime();
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > sessionTtlSeconds * 1000) {
      return { loggedIn: false };
    }
    return session.loggedIn ? session : { loggedIn: false };
  } catch {
    return { loggedIn: false };
  }
}

export function createStartSessionCookie(session: StartSessionData): string {
  const payload = base64UrlEncode(JSON.stringify({
    ...session,
    timestamp: new Date().toISOString(),
  }));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${cookieName}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionTtlSeconds}${secure}`;
}

export function destroyStartSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
