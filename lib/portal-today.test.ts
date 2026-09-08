import { describe, expect, it } from 'vitest';
import { getTodayClasses, overlayTodayTimetable } from './portal-today';
import type { FullTimetable, PortalData, TodayTimetable } from '@/types/portal';

const now = new Date('2026-09-07T23:00:00Z'); // Tuesday morning in Sydney.
const normal = { day: 'Tuesday', period: 'P1', classCode: 'MATH', course: 'Mathematics', teacher: 'Usual Teacher', room: 'E4' };
const timetable: FullTimetable = { weekA: [normal], weekB: [] };
const today: TodayTimetable = { date: '2026-09-08', entries: [{ period: 'P1', subject: 'MATH', teacher: 'Cover Teacher', room: 'E5', attendanceStatus: 'absent' }] };

describe('today homepage display', () => {
  it('uses the homepage teacher, room and mark without mutating the recurring week', () => {
    const result = overlayTodayTimetable(timetable, today, 'weekA', now);
    expect(result.weekA[0]).toMatchObject({ teacher: 'Cover Teacher', room: 'E5', course: 'Mathematics' });
    expect(timetable.weekA[0].teacher).toBe('Usual Teacher');
    expect(getTodayClasses({ timetable, todayTimetable: today } as PortalData, now)).toEqual(today.entries);
  });
  it('does not show yesterday’s substitute and honours an explicitly empty current card', () => {
    expect(overlayTodayTimetable(timetable, { ...today, date: '2026-09-07' }, 'weekA', now)).toBe(timetable);
    expect(overlayTodayTimetable(timetable, { ...today, entries: [] }, 'weekA', now).weekA).toEqual([]);
  });

  it('leaves the other rotation and the other days of the week alone', () => {
    const wednesday = { ...normal, day: 'Wednesday', classCode: 'ENG', course: 'English' };
    const both: FullTimetable = { weekA: [normal, wednesday], weekB: [normal] };
    const result = overlayTodayTimetable(both, today, 'weekA', now);
    expect(result.weekA.map((entry) => entry.day)).toEqual(['Wednesday', 'Tuesday']);
    expect(result.weekA.find((entry) => entry.day === 'Wednesday')).toEqual(wednesday);
    expect(result.weekB).toEqual(both.weekB);
  });

  it('falls back to the recurring rotation for the day when there is no card for today', () => {
    const weekB = [{ ...normal, classCode: 'SCI', course: 'Science', teacher: 'Week B Teacher' }];
    const data = { timetable: { weekA: [normal], weekB } } as PortalData;
    // 2026-09-08 is a Week B Tuesday, so the Week A row must not be the one returned.
    expect(getTodayClasses(data, now)).toEqual([
      { period: 'P1', subject: 'Science', teacher: 'Week B Teacher', room: 'E4', attendanceStatus: 'unmarked' },
    ]);
    expect(getTodayClasses({ timetable, todayTimetable: { ...today, date: '2026-09-07' } } as PortalData, now))
      .toEqual([]);
  });

  it('returns a legacy flat timetable as it stands', () => {
    const flat = [{ period: 'P1', subject: 'MATH', teacher: 'Usual Teacher', room: 'E4', attendanceStatus: 'unmarked' as const }];
    expect(getTodayClasses({ timetable: flat } as PortalData, now)).toBe(flat);
  });
});
