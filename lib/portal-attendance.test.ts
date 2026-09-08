import { describe, expect, it } from 'vitest';
import { mergeAttendancePeriods } from './portal-attendance';
import { mergePortalData } from './portal-data-merge';
import type { AttendancePeriodDay, PortalData } from '@/types/portal';

const day = (date: string, status: 'present' | 'absent' | 'unmarked', label = 'P3b'): AttendancePeriodDay => ({
  date, day: 'Tuesday', periods: [{ label, classCode: 'HCHE.C', status }],
});

describe('incremental attendance', () => {
  it('preserves history, matches Australian dates and applies corrections to split periods', () => {
    const result = mergeAttendancePeriods(
      [day('7/9/2026', 'present'), day('8/9/2026', 'absent'), day('8/9/2026', 'absent', 'P3a')],
      [day('2026-09-08', 'present')],
    );
    expect(result.map(value => value.date)).toEqual(['2026-09-08', '2026-09-07']);
    expect(result[0].periods.map(value => value.status)).toEqual(['present', 'absent']);
  });

  it('does not erase an official mark or reason when a homepage span is uncoloured', () => {
    const saved = day('2026-09-08', 'absent');
    saved.periods[0].reason = 'Parent notified';
    expect(mergeAttendancePeriods([saved], [day('2026-09-08', 'unmarked')])[0].periods[0])
      .toEqual(saved.periods[0]);
  });

  it('keeps a new class unmarked instead of transferring the old class mark', () => {
    const incoming = day('2026-09-08', 'unmarked');
    incoming.periods[0].classCode = 'HPHY.B';
    expect(mergeAttendancePeriods([day('2026-09-08', 'absent')], [incoming])[0].periods[0].status)
      .toBe('unmarked');
  });

  it('replaces a changed class in the same timetable slot without duplicating it', () => {
    const base = { timetable: { weekA: [{ day: 'Tuesday', period: 'P1', classCode: 'OLD' }], weekB: [] } };
    const incoming = { timetable: { weekA: [{ day: 'Tuesday', period: 'P1', classCode: 'NEW' }] } };
    const merged = mergePortalData(base as unknown as PortalData, incoming as unknown as PortalData);
    expect(merged?.timetable).toEqual({ weekA: [{ day: 'Tuesday', period: 'P1', classCode: 'NEW' }], weekB: [] });
  });
});
