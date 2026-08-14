import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  formatCalendarDate,
  parseCalendarDate,
  toExclusiveAllDayEnd,
} from './calendar-date';

describe('calendar-date', () => {
  it('parses provider dates as local civil dates', () => {
    const value = parseCalendarDate('2026-07-11');
    expect(value).not.toBeNull();
    expect(value?.getFullYear()).toBe(2026);
    expect(value?.getMonth()).toBe(6);
    expect(value?.getDate()).toBe(11);
    expect(value && formatCalendarDate(value)).toBe('2026-07-11');
  });

  it('rejects rolled and malformed dates', () => {
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(parseCalendarDate('11/07/2026')).toBeNull();
  });

  it('uses an exclusive next-day end for a single-day event', () => {
    const start = new Date(2026, 6, 11);
    expect(toExclusiveAllDayEnd(start, new Date(2026, 6, 11))).toBe('2026-07-12');
  });

  it('preserves an existing exclusive multi-day end', () => {
    const start = new Date(2026, 6, 11);
    const end = addCalendarDays(start, 3);
    expect(toExclusiveAllDayEnd(start, end)).toBe('2026-07-14');
  });
});
