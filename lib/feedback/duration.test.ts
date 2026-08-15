import { describe, expect, it } from 'vitest';
import {
  describeSuspensionDuration,
  describeSuspensionRemaining,
  isSuspensionActive,
  parseSuspensionDuration,
  suspensionExpiryFrom,
} from './duration';

const base = new Date('2026-01-31T12:00:00.000Z');

describe('parseSuspensionDuration', () => {
  it('reads each single-unit shorthand', () => {
    expect(parseSuspensionDuration('6h')).toEqual({ permanent: false, years: 0, months: 0, days: 0, hours: 6 });
    expect(parseSuspensionDuration('3d')).toEqual({ permanent: false, years: 0, months: 0, days: 3, hours: 0 });
    expect(parseSuspensionDuration('2w')).toEqual({ permanent: false, years: 0, months: 0, days: 14, hours: 0 });
    expect(parseSuspensionDuration('5m')).toEqual({ permanent: false, years: 0, months: 5, days: 0, hours: 0 });
    expect(parseSuspensionDuration('1y')).toEqual({ permanent: false, years: 1, months: 0, days: 0, hours: 0 });
  });

  it('treats perm and its spellings as permanent', () => {
    expect(parseSuspensionDuration('perm')).toEqual({ permanent: true });
    expect(parseSuspensionDuration('  PERMANENT ')).toEqual({ permanent: true });
  });

  it('combines several segments', () => {
    expect(parseSuspensionDuration('1y 6m')).toEqual({ permanent: false, years: 1, months: 6, days: 0, hours: 0 });
    expect(parseSuspensionDuration('3d12h')).toEqual({ permanent: false, years: 0, months: 0, days: 3, hours: 12 });
  });

  it('rejects input that is not a duration', () => {
    expect(parseSuspensionDuration('')).toBeNull();
    expect(parseSuspensionDuration('soon')).toBeNull();
    expect(parseSuspensionDuration('2 monts')).toBeNull();
    expect(parseSuspensionDuration('0d')).toBeNull();
    expect(parseSuspensionDuration('7')).toBeNull();
    expect(parseSuspensionDuration('2d junk')).toBeNull();
  });

  it('rejects a length far outside any plausible suspension', () => {
    expect(parseSuspensionDuration('999y')).toBeNull();
  });
});

describe('suspensionExpiryFrom', () => {
  it('returns no expiry for a permanent suspension', () => {
    expect(suspensionExpiryFrom({ permanent: true }, base)).toBeNull();
  });

  it('adds hours, days, and weeks as elapsed time', () => {
    const duration = parseSuspensionDuration('1w')!;
    expect(suspensionExpiryFrom(duration, base)?.toISOString()).toBe('2026-02-07T12:00:00.000Z');
  });

  it('adds months as calendar arithmetic', () => {
    const duration = parseSuspensionDuration('1m')!;
    // January 31 has no February 31: the calendar rolls into March rather than drifting 30 days.
    expect(suspensionExpiryFrom(duration, base)?.toISOString()).toBe('2026-03-03T12:00:00.000Z');
  });

  it('adds combined segments in order', () => {
    const duration = parseSuspensionDuration('1y 1d')!;
    expect(suspensionExpiryFrom(duration, base)?.toISOString()).toBe('2027-02-01T12:00:00.000Z');
  });
});

describe('describeSuspensionDuration', () => {
  it('describes permanent and combined durations', () => {
    expect(describeSuspensionDuration({ permanent: true })).toBe('Permanent');
    expect(describeSuspensionDuration(parseSuspensionDuration('1y 2m 1d 3h')!))
      .toBe('1 year, 2 months, 1 day, 3 hours');
  });
});

describe('describeSuspensionRemaining', () => {
  it('reports permanent, expired, and remaining time', () => {
    expect(describeSuspensionRemaining(null, base)).toBe('Permanent');
    expect(describeSuspensionRemaining('2026-01-30T12:00:00.000Z', base)).toBe('Expired');
    expect(describeSuspensionRemaining('2026-01-31T18:00:00.000Z', base)).toBe('6 hours left');
    expect(describeSuspensionRemaining('2026-02-05T12:00:00.000Z', base)).toBe('5 days left');
    expect(describeSuspensionRemaining('2026-05-31T12:00:00.000Z', base)).toBe('4 months left');
    expect(describeSuspensionRemaining('2028-01-31T12:00:00.000Z', base)).toBe('2 years left');
  });

  it('reports an unparseable expiry rather than throwing', () => {
    expect(describeSuspensionRemaining('not-a-date', base)).toBe('Unknown');
  });
});

describe('isSuspensionActive', () => {
  it('treats a missing expiry as permanent and a past expiry as lapsed', () => {
    expect(isSuspensionActive(null, base)).toBe(true);
    expect(isSuspensionActive('2026-02-01T12:00:00.000Z', base)).toBe(true);
    expect(isSuspensionActive('2026-01-01T12:00:00.000Z', base)).toBe(false);
  });
});
