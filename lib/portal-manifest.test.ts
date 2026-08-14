import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  return { query, from: vi.fn(() => query) };
});

vi.mock('./supabase', () => ({
  supabaseAdmin: { from: mocks.from },
}));

import { getUserPortalManifest } from './users';

describe('getUserPortalManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
  });

  it('loads only lightweight portal freshness metadata', async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: { millennium_uid: 'portal-1', name: 'Student', school: 'RHHS', last_sync: '2026-07-14T00:00:00.000Z' },
      error: null,
    });

    await expect(getUserPortalManifest('user-1')).resolves.toEqual({
      millenniumUid: 'portal-1',
      name: 'Student',
      school: 'RHHS',
      lastSync: '2026-07-14T00:00:00.000Z',
    });
    expect(mocks.query.select).toHaveBeenCalledWith('millennium_uid, name, school, last_sync');
  });
});
