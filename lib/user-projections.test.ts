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

import { findUserIdentityById, findUserPortalDataById } from './users';

describe('narrow user projections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
  });

  it('loads only identity fields for auth and extension authorization', async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: { id: 'user-1', millennium_uid: 'portal-1', name: 'Student', school: 'RHHS' },
      error: null,
    });

    await expect(findUserIdentityById('user-1')).resolves.toEqual({
      id: 'user-1',
      millenniumUid: 'portal-1',
      name: 'Student',
      school: 'RHHS',
    });
    expect(mocks.query.select).toHaveBeenCalledWith('id, millennium_uid, name, school');
  });

  it('loads portal data without unrelated settings or profile blobs', async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        millennium_uid: 'portal-1',
        name: 'Student',
        school: 'RHHS',
        portal_data: { notices: [] },
        last_sync: '2026-07-14T00:00:00.000Z',
      },
      error: null,
    });

    await expect(findUserPortalDataById('user-1')).resolves.toMatchObject({
      millenniumUid: 'portal-1',
      portalData: { notices: [] },
    });
    expect(mocks.query.select).toHaveBeenCalledWith('millennium_uid, name, school, portal_data, last_sync');
  });
});
