/**
 * School bell times, as minutes from midnight.
 *
 * Recess follows period 3 and lunch follows period 6; both run for 30 minutes, so every bell after
 * a break is offset by the full break rather than by the 29 minutes an earlier revision used.
 *
 * The `a`/`b` suffixed entries are the split-period variants some days run.
 */
export interface PeriodBounds {
    start: number
    end: number
}

const hm = (hour: number, minute: number) => hour * 60 + minute

const PERIOD_SCHEDULE: Record<string, PeriodBounds> = {
    '1': { start: hm(8, 45), end: hm(9, 24) },
    '2': { start: hm(9, 24), end: hm(10, 3) },
    '3': { start: hm(10, 3), end: hm(10, 42) },
    '3a': { start: hm(10, 3), end: hm(10, 42) },
    // recess: 10:42 - 11:12
    '3b': { start: hm(10, 32), end: hm(11, 12) },
    '4': { start: hm(11, 12), end: hm(11, 51) },
    '5': { start: hm(11, 51), end: hm(12, 32) },
    '6': { start: hm(12, 32), end: hm(13, 9) },
    '6a': { start: hm(12, 32), end: hm(13, 9) },
    // lunch: 13:09 - 13:39
    '6b': { start: hm(12, 58), end: hm(13, 39) },
    '7': { start: hm(13, 39), end: hm(14, 18) },
    '8': { start: hm(14, 18), end: hm(14, 57) },
}

/** Tuesday runs a shortened final period for staff briefing. */
const SHORT_TUESDAY_PERIOD_8_MINUTES = 28

/**
 * Bounds for a period code (`"3"`, `"3b"`, `"P6a"`…) on a given weekday, or null when the code is
 * not one this school runs.
 */
export function getPeriodBounds(dayKey: string, periodCode: string): PeriodBounds | null {
    const normalizedCode = String(periodCode || '').toLowerCase()
    const numberOnly = normalizedCode.match(/\d+/)?.[0] || normalizedCode
    const bounds = PERIOD_SCHEDULE[normalizedCode] || PERIOD_SCHEDULE[numberOnly]
    if (!bounds) return null

    if (dayKey.toLowerCase() === 'tuesday' && numberOnly === '8') {
        return { start: bounds.start, end: bounds.start + SHORT_TUESDAY_PERIOD_8_MINUTES }
    }
    return bounds
}
