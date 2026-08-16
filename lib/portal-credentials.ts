import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENVELOPE_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';

// The portal drops an idle session well before the envelope itself ages out.
// Cookies older than this are treated as spent, so a refresh signs in again with
// the saved password instead of scraping a logged-out portal.
const COOKIE_FRESHNESS_MS = 4 * 60 * 60 * 1000;

export interface PortalCredentials {
  username: string;
  password: string;
  cookies?: string[];
  portalUrl?: string;
  cookiesUpdatedAt?: string;
}

export interface PortalCredentialEnvelope {
  version: typeof ENVELOPE_VERSION;
  iv: string;
  ciphertext: string;
  authTag: string;
}

function getCredentialSecret(): string {
  const secret = process.env.PORTAL_CREDENTIALS_SECRET
    || (process.env.NODE_ENV !== 'production' ? process.env.SESSION_SECRET : undefined);
  if (!secret || secret.length < 32) {
    throw new Error('PORTAL_CREDENTIALS_SECRET must be configured with at least 32 characters');
  }
  return secret;
}

function deriveUserKey(userId: string): Buffer {
  return createHash('sha256')
    .update('millennium:portal-credentials:v1\0', 'utf8')
    .update(userId, 'utf8')
    .update('\0', 'utf8')
    .update(getCredentialSecret(), 'utf8')
    .digest();
}

function associatedData(userId: string): Buffer {
  return Buffer.from(`millennium-user:${userId}:portal-credentials:v1`, 'utf8');
}

export function reusablePortalCookies(credentials: PortalCredentials | null, now = Date.now()): string[] | null {
  if (!credentials?.cookies?.length) return null;
  const updatedAt = credentials.cookiesUpdatedAt ? Date.parse(credentials.cookiesUpdatedAt) : Number.NaN;
  if (!Number.isFinite(updatedAt)) return null;
  if (now - updatedAt > COOKIE_FRESHNESS_MS || updatedAt > now + 60_000) return null;
  return credentials.cookies;
}

export function encryptPortalCredentials(userId: string, credentials: PortalCredentials): PortalCredentialEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveUserKey(userId), iv);
  cipher.setAAD(associatedData(userId));

  const plaintext = Buffer.from(JSON.stringify({
    username: credentials.username.trim(),
    password: credentials.password,
    ...(Array.isArray(credentials.cookies) && credentials.cookies.length > 0
      ? { cookies: credentials.cookies.slice(0, 32) }
      : {}),
    ...(typeof credentials.portalUrl === 'string' && credentials.portalUrl
      ? { portalUrl: credentials.portalUrl }
      : {}),
    ...(typeof credentials.cookiesUpdatedAt === 'string' && credentials.cookiesUpdatedAt
      ? { cookiesUpdatedAt: credentials.cookiesUpdatedAt }
      : {}),
  }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    version: ENVELOPE_VERSION,
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptPortalCredentials(userId: string, envelope: unknown): PortalCredentials | null {
  if (!envelope || typeof envelope !== 'object') return null;
  const value = envelope as Partial<PortalCredentialEnvelope>;
  if (
    value.version !== ENVELOPE_VERSION
    || typeof value.iv !== 'string'
    || typeof value.ciphertext !== 'string'
    || typeof value.authTag !== 'string'
  ) {
    return null;
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, deriveUserKey(userId), Buffer.from(value.iv, 'base64url'));
    decipher.setAAD(associatedData(userId));
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64url')),
      decipher.final(),
    ]);
    const credentials = JSON.parse(plaintext.toString('utf8')) as Partial<PortalCredentials>;
    if (typeof credentials.username !== 'string' || typeof credentials.password !== 'string') return null;
    if (!credentials.username.trim() || !credentials.password) return null;
    const cookies = Array.isArray(credentials.cookies)
      ? credentials.cookies
        .filter((cookie): cookie is string => typeof cookie === 'string' && cookie.includes('='))
        .slice(0, 32)
      : undefined;
    return {
      username: credentials.username.trim(),
      password: credentials.password,
      ...(cookies?.length ? { cookies } : {}),
      ...(typeof credentials.portalUrl === 'string' ? { portalUrl: credentials.portalUrl } : {}),
      ...(typeof credentials.cookiesUpdatedAt === 'string' ? { cookiesUpdatedAt: credentials.cookiesUpdatedAt } : {}),
    };
  } catch {
    return null;
  }
}
