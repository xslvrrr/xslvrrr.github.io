import { describe, expect, it } from 'vitest';
import type { FullTimetable, FullTimetableEntry, TimetableEntry } from '../types/portal';
import {
  describePortalClassChange,
  detectPortalClassChanges,
  getAffectedClassCodes,
  getPortalClassChangeKey,
  getPortalSchoolDate,
  getPortalWeekType,
  getSchoolDate,
  normalizePortalClassCode,
  resolvePortalTimetableWeek,
} from './portal-class-changes';
import type { PortalClassChange, PortalClassChangeInput } from './portal-class-changes';

const DATE = '2026-02-16'; // Monday, Week A; +7 is B, +14 is A.
const row = (overrides: Partial<FullTimetableEntry> = {}): FullTimetableEntry => ({
  day: 'Monday', period: 'P3a', course: 'Mathematics', classCode: '12MAT1',
  teacher: 'Ms Old', room: 'R1', ...overrides,
});
const home = (overrides: Partial<TimetableEntry> = {}): TimetableEntry => ({
  period: '3a', subject: '12MAT1', teacher: 'Mr New', room: 'R1',
  attendanceStatus: 'unmarked', ...overrides,
});
const full = (overrides: Partial<FullTimetableEntry> = {}): FullTimetable => ({
  weekA: [row(overrides)], weekB: [row(overrides)],
});
const input = (overrides: Partial<PortalClassChangeInput> = {}): PortalClassChangeInput => ({
  timetable: full(), todayTimetable: { date: DATE, entries: [home()] }, ...overrides,
});
const references = () => [DATE, '2026-02-23', '2026-03-02'].map((date) => ({
  date, timetable: full({ teacher: 'Mr New' }),
}));
const types = (data: PortalClassChangeInput, previous?: PortalClassChangeInput) => (
  detectPortalClassChanges(data, previous).map((change) => change.type)
);

describe('school dates and rotation', () => {
  it.each([
    ['2026-02-16', 'weekA'], ['2026-02-22', 'weekA'], ['2026-02-23', 'weekB'],
    ['2026-03-02', 'weekA'], ['2026-02-15', 'weekB'], ['2026-02-02', 'weekA'],
    ['2026-10-04', 'weekA'], ['2026-10-05', 'weekB'],
    ['2026-04-05', 'weekA'], ['2026-04-06', 'weekB'],
  ])('resolves %s using the existing anchor, including DST and negative offsets', (date, week) => {
    expect(getPortalWeekType(date)).toBe(week);
  });

  it('converts instants in Sydney, independently of the machine timezone', () => {
    expect(getSchoolDate(new Date('2026-02-15T13:30:00Z'))).toBe(DATE);
    expect(getPortalWeekType(new Date('2026-02-15T13:30:00Z'))).toBe('weekA');
    expect(getPortalSchoolDate('2026-07-11T14:30:00Z')).toBe('2026-07-12');
    expect(getPortalSchoolDate('2026-07-11')).toBe('2026-07-11');
  });

  it('rejects invalid or ambiguous dates', () => {
    for (const date of ['2026-02-30', 'invalid', '16/02/2026', '2026-02-16T12:00:00']) {
      expect(getPortalWeekType(date)).toBeNull();
    }
    expect(() => getSchoolDate(new Date(NaN))).toThrow(RangeError);
  });

  it('prefers dated calendar labels, then unique patterns, then the anchor', () => {
    const data = input({ timetable: { weekA: [row({ classCode: '12ENG1' })], weekB: [row()] } });
    expect(resolvePortalTimetableWeek(data, DATE)).toBe('weekB');
    data.calendar = [{ date: '16/02/2026', title: 'Week A' }];
    expect(resolvePortalTimetableWeek(data, DATE)).toBe('weekA');
    expect(resolvePortalTimetableWeek(input(), DATE)).toBe('weekA');
  });

  it('does not extrapolate stale labels or infer a rotation reset from holidays', () => {
    const data = input({ calendar: [
      { date: '2026-02-09', title: 'Week A' }, { date: DATE, title: 'End of holidays' },
    ] });
    expect(resolvePortalTimetableWeek(data, DATE)).toBe('weekA');
  });
});

describe('homepage overlays', () => {
  it('detects a substitute on the first full sync without a prior snapshot', () => {
    expect(detectPortalClassChanges(input())).toEqual([{
      type: 'substitute', date: DATE, period: '3a', classCode: '12MAT1', from: 'Ms Old', to: 'Mr New',
    }]);
  });

  it('normalizes code case/whitespace and full period labels', () => {
    expect(types(input({ todayTimetable: { date: DATE, entries: [home({
      subject: ' 12 mat 1 ', period: ' Period 03 A ', teacher: ' ms   old ', room: ' r1 ',
    })] } }))).toEqual([]);
    expect(normalizePortalClassCode(' 12 mAt\t1 ')).toBe('12MAT1');
  });

  it('keeps numeric, a and b slots separate and does not match a different day', () => {
    const data = input({ timetable: { weekA: [
      row({ period: 'P3', teacher: 'Numeric' }), row({ period: 'P3a', teacher: 'A teacher' }),
      row({ period: 'P3b', teacher: 'B teacher' }), row({ day: 'Tuesday', teacher: 'Tuesday teacher' }),
    ], weekB: [] }, todayTimetable: { date: DATE, entries: [home(), home({ period: '3b' })] } });
    expect(detectPortalClassChanges(data).map(({ period, from }) => [period, from])).toEqual([
      ['3a', 'A teacher'], ['3b', 'B teacher'],
    ]);
  });

  it('does not fall back from a missing split slot to its whole period', () => {
    expect(types(input({ timetable: full({ period: 'P3' }) }))).toEqual([]);
  });

  it('detects room and teacher overrides independently', () => {
    expect(types(input({ todayTimetable: { date: DATE, entries: [home({ room: 'R2' })] } })))
      .toEqual(['room-change', 'substitute']);
  });

  it('never turns a missing teacher or room into a change', () => {
    expect(types(input({ todayTimetable: { date: DATE, entries: [home({ teacher: '', room: '' })] } })))
      .toEqual([]);
    expect(types(input({ timetable: full({ teacher: '', room: '' }) }))).toEqual([]);
  });

  it('ignores attendance changes', () => {
    expect(types(input({ todayTimetable: { date: DATE, entries: [home({
      teacher: 'Ms Old', attendanceStatus: 'absent',
    })] } }))).toEqual([]);
  });

  it('requires an explicitly dated homepage and a full normal timetable', () => {
    expect(types(input({ todayTimetable: undefined }))).toEqual([]);
    expect(types(input({ todayTimetable: { date: '2026-02-30', entries: [home()] } }))).toEqual([]);
    expect(types(input({ timetable: [home()] }))).toEqual([]);
  });

  it('suppresses ambiguous calendar rotations with different classes', () => {
    expect(types(input({ calendar: [{ date: DATE, title: 'Week A / Week B' }],
      timetable: { weekA: [row()], weekB: [row({ classCode: '12ENG1' })] },
    }))).toEqual([]);
  });

  it('allows agreed fields in ambiguous rotations, but not a conflicting teacher', () => {
    expect(types(input({ calendar: [{ date: DATE, title: 'Week A / Week B' }],
      timetable: { weekA: [row()], weekB: [row({ teacher: 'Someone Else' })] },
      todayTimetable: { date: DATE, entries: [home({ room: 'R2' })] },
    }))).toEqual(['room-change']);
  });
});

describe('sustained teacher evidence', () => {
  it('requires the current week plus each of the next two weeks and returns all evidence dates', () => {
    const changes = detectPortalClassChanges(input({ timetableReferences: references() }));
    expect(changes).toEqual([{
      type: 'teacher-change', date: DATE, period: '3a', classCode: '12MAT1',
      from: 'Ms Old', to: 'Mr New', referenceDates: [DATE, '2026-02-23', '2026-03-02'],
    }]);
  });

  it.each([0, 1, 2])('never promotes with missing reference %i', (missing) => {
    expect(types(input({ timetableReferences: references().filter((_, i) => i !== missing) })))
      .toEqual(['substitute']);
  });

  it('does not count duplicate dates or two dates in the same week as future evidence', () => {
    const refs = references();
    refs[2] = { ...refs[1], date: '2026-02-24' };
    expect(types(input({ timetableReferences: [...refs, refs[0]] }))).toEqual(['substitute']);
  });

  it.each(['empty', 'missing-class', 'blank-teacher', 'old-teacher', 'co-teacher', 'invalid-date'])
    ('rejects %s reference evidence', (kind) => {
      const refs = references();
      if (kind === 'empty') refs[1].timetable.weekB = [];
      if (kind === 'missing-class') refs[1].timetable.weekB = [row({ classCode: '12ENG1' })];
      if (kind === 'blank-teacher') refs[1].timetable.weekB[0].teacher = '';
      if (kind === 'old-teacher') refs[1].timetable.weekB[0].teacher = 'Ms Old';
      if (kind === 'co-teacher') refs[1].timetable.weekB.push(row({ day: 'Thursday', teacher: 'Other teacher' }));
      if (kind === 'invalid-date') refs[1].date = 'not-a-date';
      expect(types(input({ timetableReferences: refs }))).toEqual(['substitute']);
    });

  it('evaluates only the rotation for each reference date, even if both are parsed', () => {
    const refs = references();
    refs[0].timetable.weekB = [row({ teacher: 'Inactive B' })];
    refs[1].timetable.weekA = [];
    refs[2].timetable.weekB = [];
    expect(types(input({ timetableReferences: refs }))).toEqual(['teacher-change']);
  });

  it('accepts a class taught on another day in the next rotation', () => {
    const refs = references();
    refs[1].timetable.weekB = [row({ teacher: 'Mr New', day: 'Friday', period: 'P6b' })];
    expect(types(input({ timetableReferences: refs }))).toEqual(['teacher-change']);
  });

  it('uses explicit future calendar rotation labels', () => {
    const refs = references();
    refs[1].timetable.weekB = [];
    expect(types(input({ timetableReferences: refs,
      calendar: [{ date: '2026-02-23', title: 'Week A' }],
    }))).toEqual(['teacher-change']);
  });

  it('does not reuse cached successful references when sync reports a timetable failure', () => {
    const failedPages = [{ page: 'timetable-reference-1', section: 'timetableReferences', code: 'timeout', message: '' }];
    expect(types(input({ timetableReferences: references(), sync: { failedPages } }))).toEqual(['substitute']);
    expect(types(input({ timetableReferences: references(), syncMeta: {
      complete: false, degraded: true, pageCount: 3, succeededPages: 2, failedPages: [], durationMs: 0,
      sections: { timetableReferences: { requested: 3, succeeded: 2, failed: 1 } },
    } }))).toEqual(['substitute']);
  });

  it('ignores failures in unrelated pages', () => {
    expect(types(input({ timetableReferences: references(), sync: {
      failedPages: [{ page: 'notices', section: 'notices', code: 'timeout', message: '' }],
    } }))).toEqual(['teacher-change']);
  });

  it('rejects contradictory references within one week regardless of order', () => {
    const refs = [...references(), { date: '2026-02-24', timetable: full() }];
    expect(types(input({ timetableReferences: refs }))).toEqual(['substitute']);
    expect(types(input({ timetableReferences: refs.reverse() }))).toEqual(['substitute']);
  });

  it('detects a new normal teacher using the prior recurring snapshot', () => {
    const data = input({ timetable: full({ teacher: 'Mr New' }), timetableReferences: references() });
    expect(types(data)).toEqual([]);
    expect(types(data, input())).toEqual(['teacher-change']);
    expect(types({ ...data, timetableReferences: undefined }, input())).toEqual([]);
  });

  it('never uses yesterday’s homepage substitute as the baseline', () => {
    const data = input({ timetable: full({ teacher: 'Mr New' }), timetableReferences: references() });
    expect(types(data, input({ timetable: full({ teacher: 'Mr New' }),
      todayTimetable: { date: '2026-02-15', entries: [home({ teacher: 'Yesterday substitute' })] },
    }))).toEqual([]);
  });

  it('rejects a newer previous snapshot or a different student', () => {
    const data = input({ timetable: full({ teacher: 'Mr New' }), timetableReferences: references(),
      userId: 'alice', lastUpdated: '2026-02-16T00:00:00Z',
    });
    expect(types(data, input({ userId: 'bob' }))).toEqual([]);
    expect(types(data, input({ lastUpdated: '2026-02-17T00:00:00Z' }))).toEqual([]);
  });
});

describe('class replacements and stable identity', () => {
  it('falls back to the anchor when a real replacement breaks homepage pattern matching', () => {
    const data = input({ timetable: { weekA: [row()], weekB: [row({ classCode: '12SCI1' })] },
      todayTimetable: { date: DATE, entries: [home({ subject: '12ENG1', room: 'R2' })] },
    });
    const changes = detectPortalClassChanges(data);
    expect(changes).toEqual([{
      type: 'class-change', date: DATE, period: '3a', classCode: '12ENG1', from: '12MAT1', to: '12ENG1',
    }]);
    expect(getAffectedClassCodes(changes)).toEqual(new Set(['12MAT1', '12ENG1']));
    expect(getAffectedClassCodes(detectPortalClassChanges(input()))).toEqual(new Set());
  });

  it('detects a replacement already present in the new normal timetable', () => {
    const data = input({ timetable: full({ classCode: '12ENG1' }),
      todayTimetable: { date: DATE, entries: [home({ subject: '12ENG1' })] },
    });
    expect(types(data, input())).toEqual(['class-change']);
  });

  it('never interprets absence, blank codes, or newly added slots as replacement', () => {
    expect(types(input({ timetable: full({ classCode: '' }) }))).toEqual([]);
    expect(types(input({ timetable: full({ period: 'P1' }) }))).toEqual([]);
    expect(types(input({ todayTimetable: { date: DATE, entries: [home({ subject: '' })] } }))).toEqual([]);
    expect(types(input({ todayTimetable: { date: DATE, entries: [] } }))).toEqual([]);
  });

  it('deduplicates scraped rows, reference dates and class-wide teacher changes', () => {
    const data = input({ timetable: { weekA: [row(), row(), row({ period: 'P3b' })], weekB: [row()] },
      todayTimetable: { date: DATE, entries: [home(), home(), home({ period: '3b' })] },
      timetableReferences: [...references(), ...references()],
    });
    const changes = detectPortalClassChanges(data);
    expect(changes).toHaveLength(1);
    expect(changes[0].type === 'teacher-change' && changes[0].referenceDates).toHaveLength(3);
    expect(detectPortalClassChanges(data)).toEqual(changes);
  });

  it('produces stable keys across formatting, polls and lessons but distinct daily split slots', () => {
    const [change] = detectPortalClassChanges(input({ timetableReferences: references() }));
    expect(getPortalClassChangeKey(change)).toBe(getPortalClassChangeKey({ ...change,
      date: '2026-02-17', period: 'P6b', classCode: ' 12mat 1 ', from: ' ms OLD ', to: 'mr   NEW',
    }));
    const [daily] = detectPortalClassChanges(input());
    expect(getPortalClassChangeKey(daily)).not.toBe(getPortalClassChangeKey({ ...daily, period: '3b' }));
    expect(getPortalClassChangeKey(daily)).not.toBe(getPortalClassChangeKey({ ...daily, date: '2026-02-17' }));
  });

  it('suppresses conflicting duplicate homepage rows', () => {
    expect(types(input({ todayTimetable: { date: DATE, entries: [home(), home({ subject: '12ENG1' })] } })))
      .toEqual([]);
    expect(types(input({ todayTimetable: { date: DATE, entries: [home(), home({ teacher: 'Other' })] } })))
      .toEqual([]);
  });

  it('does not mutate either snapshot or the normal recurring timetable', () => {
    const data = input({ timetableReferences: references() });
    const previous = input();
    const before = JSON.stringify([data, previous]);
    detectPortalClassChanges(data, previous);
    expect(JSON.stringify([data, previous])).toBe(before);
  });
});

describe('recurring grid handovers', () => {
  // English never meets on the homepage's Monday, so only the recurring grid can report it.
  const grid = (english: string): FullTimetable => ({
    weekA: [row(), row({ day: 'Thursday', period: 'P5', classCode: '12ENG1', course: 'English', teacher: english })],
    weekB: [row(), row({ day: 'Thursday', period: 'P5', classCode: '12ENG1', course: 'English', teacher: english })],
  });
  const quiet = { date: DATE, entries: [home({ teacher: 'Ms Old' })] };
  const current = (overrides: Partial<PortalClassChangeInput> = {}) => input({
    timetable: grid('Mr Fresh'),
    todayTimetable: quiet,
    timetableReferences: [DATE, '2026-02-23', '2026-03-02'].map((date) => ({ date, timetable: grid('Mr Fresh') })),
    ...overrides,
  });
  const previous = (english = 'Mrs Gone') => input({ timetable: grid(english), todayTimetable: quiet });

  it('reports a confirmed handover for a class that does not meet today', () => {
    expect(detectPortalClassChanges(current(), previous())).toEqual([{
      type: 'teacher-change', date: DATE, period: '5', classCode: '12ENG1',
      from: 'Mrs Gone', to: 'Mr Fresh', referenceDates: [DATE, '2026-02-23', '2026-03-02'],
    }]);
  });

  it('stays silent rather than calling an unconfirmed grid difference a substitute', () => {
    expect(types(current({ timetableReferences: undefined }), previous())).toEqual([]);
    expect(types(current({ timetableReferences: [{ date: DATE, timetable: grid('Mr Fresh') }] }), previous()))
      .toEqual([]);
  });

  it('never reads a blank teacher on either side as a handover', () => {
    expect(types(current({ timetable: grid('') }), previous())).toEqual([]);
    expect(types(current(), previous(''))).toEqual([]);
  });

  it('ignores a slot the previous snapshot never had', () => {
    expect(types(current(), input({ timetable: full(), todayTimetable: quiet }))).toEqual([]);
  });
});

describe('describing a change', () => {
  const base = { date: DATE, period: '3a', classCode: '12MAT1', from: 'Ms Old', to: 'Mr New' };
  const changes: PortalClassChange[] = [
    { ...base, type: 'teacher-change', referenceDates: [DATE] },
    { ...base, type: 'substitute' },
    { ...base, type: 'room-change', from: 'R1', to: 'R2' },
    { ...base, type: 'class-change', from: '12MAT1', to: '12ENG1' },
  ];

  it.each(changes)('names the lesson and both values for a $type', (change) => {
    const sentence = describePortalClassChange(change);
    for (const part of [change.classCode, change.period, change.date, change.from, change.to]) {
      expect(sentence).toContain(part);
    }
  });

  it('does not report a confirmed handover in the same words as a cover', () => {
    expect(describePortalClassChange(changes[0])).toContain('fortnight');
    expect(describePortalClassChange(changes[1])).toContain('covering');
    expect(describePortalClassChange(changes[0])).not.toBe(describePortalClassChange(changes[1]));
  });
});
