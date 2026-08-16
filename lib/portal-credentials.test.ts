import { beforeAll, describe, expect, it } from 'vitest';
import {
  decryptPortalCredentials,
  encryptPortalCredentials,
  reusablePortalCookies,
} from './portal-credentials';

const USER_ID = '0a2f8f2c-4c1e-4a6b-9a5b-2f7c1d3e4f50';
const OTHER_USER_ID = '11111111-2222-3333-4444-555555555555';

beforeAll(() => {
  process.env.PORTAL_CREDENTIALS_SECRET = 'portal-credentials-secret-with-32-characters';
});

describe('portal credential envelopes', () => {
  it('round-trips a saved login for the same user', () => {
    const envelope = encryptPortalCredentials(USER_ID, {
      username: '  student@example.com  ',
      password: 'p@ssword-with-ünicode',
      cookies: ['ASPSESSION=abc123', 'portal=xyz'],
      portalUrl: 'https://millennium.education/portal',
      cookiesUpdatedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(decryptPortalCredentials(USER_ID, envelope)).toEqual({
      username: 'student@example.com',
      password: 'p@ssword-with-ünicode',
      cookies: ['ASPSESSION=abc123', 'portal=xyz'],
      portalUrl: 'https://millennium.education/portal',
      cookiesUpdatedAt: '2026-08-16T00:00:00.000Z',
    });
  });

  it('refuses an envelope belonging to another account', () => {
    const envelope = encryptPortalCredentials(USER_ID, {
      username: 'student@example.com',
      password: 'secret',
    });

    expect(decryptPortalCredentials(OTHER_USER_ID, envelope)).toBeNull();
  });
});

describe('portal cookie reuse', () => {
  const now = Date.parse('2026-08-16T12:00:00.000Z');
  const credentials = (cookiesUpdatedAt?: string) => ({
    username: 'student@example.com',
    password: 'secret',
    cookies: ['ASPSESSION=abc123'],
    ...(cookiesUpdatedAt ? { cookiesUpdatedAt } : {}),
  });

  it('reuses cookies that were refreshed recently', () => {
    expect(reusablePortalCookies(credentials('2026-08-16T11:30:00.000Z'), now)).toEqual(['ASPSESSION=abc123']);
  });

  it('skips cookies the portal has had time to expire', () => {
    expect(reusablePortalCookies(credentials('2026-08-16T05:00:00.000Z'), now)).toBeNull();
  });

  it('skips cookies with no or unusable refresh time', () => {
    expect(reusablePortalCookies(credentials(), now)).toBeNull();
    expect(reusablePortalCookies(credentials('not-a-date'), now)).toBeNull();
  });

  it('returns null when there is nothing saved to reuse', () => {
    expect(reusablePortalCookies(null, now)).toBeNull();
    expect(reusablePortalCookies({ username: 'a', password: 'b', cookies: [] }, now)).toBeNull();
  });
});
