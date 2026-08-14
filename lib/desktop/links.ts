const DEFAULT_APP_ORIGIN = 'http://millennium-five.vercel.app';
const PACKAGED_WEB_ORIGIN = 'http://millennium-five.vercel.app';
const DEVELOPMENT_WEB_ORIGIN = 'http://localhost:14201';

export const DESKTOP_SCHEME = 'millennium';
export const DESKTOP_LOGIN_HOST = 'login';

const DESKTOP_LOGIN_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DESKTOP_LOGIN_STATE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export interface DesktopLoginPayload {
  token: string;
  state: string;
}

export function isValidDesktopLoginPayload(token: string, state: string): boolean {
  return DESKTOP_LOGIN_TOKEN_PATTERN.test(token) && DESKTOP_LOGIN_STATE_PATTERN.test(state);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getLoopbackOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLoopbackHost = url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]';
    if (url.protocol !== 'http:' || !isLoopbackHost || url.username || url.password) return null;
    return trimTrailingSlash(url.origin);
  } catch {
    return null;
  }
}

function getTrustedWebOrigin(value: string | null | undefined): string | null {
  const loopbackOrigin = getLoopbackOrigin(value);
  if (loopbackOrigin) return loopbackOrigin;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === PACKAGED_WEB_ORIGIN && !url.username && !url.password
      ? PACKAGED_WEB_ORIGIN
      : null;
  } catch {
    return null;
  }
}

export function getAppOrigin(explicitOrigin?: string | null): string {
  const explicitLoopback = getLoopbackOrigin(explicitOrigin);
  if (explicitLoopback) return explicitLoopback;
  if (typeof window !== 'undefined') {
    const currentLoopback = getLoopbackOrigin(window.location.origin);
    if (currentLoopback) return currentLoopback;
  }
  const configuredOrigin = getLoopbackOrigin(
    process.env.MILLENNIUM_APP_URL || process.env.VITE_APP_URL || process.env.APP_URL,
  );
  return configuredOrigin || DEFAULT_APP_ORIGIN;
}

export function getDesktopWebOrigin(): string {
  const defaultOrigin = import.meta.env?.DEV
    ? DEVELOPMENT_WEB_ORIGIN
    : PACKAGED_WEB_ORIGIN;
  return getTrustedWebOrigin(process.env.MILLENNIUM_DESKTOP_WEB_URL) || defaultOrigin;
}

export function createDesktopBrowserLoginUrl(codeChallenge: string, state: string): string {
  const url = new URL('/login', getDesktopWebOrigin());
  url.searchParams.set('desktop', '1');
  url.searchParams.set('codeChallenge', codeChallenge);
  url.searchParams.set('state', state);
  return url.toString();
}

export function createDesktopLoginUrl(token: string, state: string): string {
  const url = new URL(`${DESKTOP_SCHEME}://${DESKTOP_LOGIN_HOST}`);
  url.searchParams.set('token', token);
  url.searchParams.set('state', state);
  return url.toString();
}

export function createDesktopBridgeUrl(token: string, state: string, origin?: string | null): string {
  const url = new URL('/app-open', getAppOrigin(origin));
  url.searchParams.set('token', token);
  url.searchParams.set('state', state);
  return url.toString();
}

export function extractDesktopLoginPayload(rawUrl: string | null | undefined): DesktopLoginPayload | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const token = url.searchParams.get('token');
    const state = url.searchParams.get('state');
    if (!token || !state || !isValidDesktopLoginPayload(token, state)) return null;

    if (url.protocol === `${DESKTOP_SCHEME}:` && url.hostname === DESKTOP_LOGIN_HOST) {
      return { token, state };
    }
    if (url.protocol === 'http:' && getLoopbackOrigin(url.origin)) {
      if (url.pathname === '/app-open' || url.pathname === '/app/open' || url.pathname === '/login') {
        return { token, state };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function extractDesktopToken(rawUrl: string | null | undefined): string | null {
  return extractDesktopLoginPayload(rawUrl)?.token || null;
}
