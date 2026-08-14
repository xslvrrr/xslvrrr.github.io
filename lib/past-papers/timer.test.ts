import { describe, expect, test } from "vitest";

import {
  buildDialTicks,
  clampDuration,
  clampReading,
  createExamTimer,
  crossedAlert,
  formatClock,
  MAX_READING_MINUTES,
  MAX_TIMER_MINUTES,
  MIN_TIMER_MINUTES,
  pauseTimer,
  readTimer,
  resetTimer,
  setDuration,
  setReadingTime,
  snapDialMinutes,
  startTimer,
} from "./timer.ts";

const T0 = 1_700_000_000_000;
const THREE_HOURS = 3 * 60 * 60;

describe("timer lifecycle", () => {
  test("starts idle showing the full allowance", () => {
    const reading = readTimer(createExamTimer(THREE_HOURS), T0);

    expect(reading).toMatchObject({ status: "idle", remainingSeconds: THREE_HOURS, percentElapsed: 0 });
  });

  test("counts down from an absolute deadline, not a decremented counter", () => {
    const running = startTimer(createExamTimer(THREE_HOURS), T0);

    // The tab was backgrounded for an hour; the clock must have moved the full hour.
    expect(readTimer(running, T0 + 3_600_000).remainingSeconds).toBe(2 * 60 * 60);
  });

  test("survives a reload by re-deriving from the stored deadline", () => {
    const running = startTimer(createExamTimer(THREE_HOURS), T0);
    const rehydrated = JSON.parse(JSON.stringify(running));

    expect(readTimer(rehydrated, T0 + 600_000).remainingSeconds).toBe(THREE_HOURS - 600);
  });

  test("pausing freezes the remaining time and resuming continues from it", () => {
    const running = startTimer(createExamTimer(THREE_HOURS), T0);
    const paused = pauseTimer(running, T0 + 600_000);

    expect(paused.status).toBe("paused");
    // An hour passes while paused; nothing is consumed.
    expect(readTimer(paused, T0 + 4_200_000).remainingSeconds).toBe(THREE_HOURS - 600);

    const resumed = startTimer(paused, T0 + 4_200_000);
    expect(readTimer(resumed, T0 + 4_260_000).remainingSeconds).toBe(THREE_HOURS - 660);
  });

  test("keeps the original start time across a pause, so the real elapsed time is recoverable", () => {
    const running = startTimer(createExamTimer(THREE_HOURS), T0);
    const resumed = startTimer(pauseTimer(running, T0 + 600_000), T0 + 900_000);

    expect(resumed.startedAt).toBe(T0);
  });

  test("reports finished rather than a negative remainder once time is gone", () => {
    const running = startTimer(createExamTimer(600), T0);
    const reading = readTimer(running, T0 + 10_000_000);

    expect(reading).toMatchObject({ status: "finished", remainingSeconds: 0, percentElapsed: 100 });
    expect(reading.progress).toBe(1);
  });

  test("reset returns to idle with the full allowance", () => {
    const running = startTimer(createExamTimer(THREE_HOURS), T0);

    expect(readTimer(resetTimer(running), T0 + 600_000)).toMatchObject({
      status: "idle",
      remainingSeconds: THREE_HOURS,
    });
  });

  test("refuses to change the length mid-attempt, which would invalidate the pacing", () => {
    const running = startTimer(createExamTimer(THREE_HOURS), T0);

    expect(setDuration(running, 600).durationSeconds).toBe(THREE_HOURS);
    expect(setDuration(createExamTimer(THREE_HOURS), 600).durationSeconds).toBe(600);
  });
});

describe("reading time", () => {
  const READING = 10 * 60;

  test("runs before the working clock rather than being added to it", () => {
    const running = startTimer(createExamTimer(THREE_HOURS, READING), T0);

    const atStart = readTimer(running, T0);
    expect(atStart).toMatchObject({ phase: "reading", phaseRemainingSeconds: READING });
    expect(atStart.remainingSeconds).toBe(THREE_HOURS + READING);
  });

  test("hands over to working time once the reading allowance is gone", () => {
    const running = startTimer(createExamTimer(THREE_HOURS, READING), T0);

    expect(readTimer(running, T0 + READING * 1000)).toMatchObject({
      phase: "working",
      phaseRemainingSeconds: THREE_HOURS,
    });
  });

  test("counts a paper with no reading allowance as working from the first second", () => {
    const running = startTimer(createExamTimer(THREE_HOURS), T0);

    expect(readTimer(running, T0)).toMatchObject({ phase: "working", phaseRemainingSeconds: THREE_HOURS });
  });

  test("keeps the reading allowance across a reset, since it belongs to the paper", () => {
    const running = startTimer(createExamTimer(THREE_HOURS, READING), T0);

    expect(resetTimer(running).readingSeconds).toBe(READING);
  });

  test("refuses to change the reading allowance mid-attempt", () => {
    const running = startTimer(createExamTimer(THREE_HOURS, READING), T0);

    expect(setReadingTime(running, 0).readingSeconds).toBe(READING);
    expect(setReadingTime(createExamTimer(THREE_HOURS), READING).readingSeconds).toBe(READING);
  });

  test("treats a state stored before reading time existed as working-time-only", () => {
    const legacy = JSON.parse(JSON.stringify({ ...createExamTimer(THREE_HOURS), readingSeconds: undefined }));

    expect(readTimer(legacy, T0)).toMatchObject({ phase: "working", remainingSeconds: THREE_HOURS });
  });

  test.each([
    [-60, 0],
    [MAX_READING_MINUTES * 60 + 600, MAX_READING_MINUTES * 60],
    [Number.NaN, 0],
  ])("clamps a reading allowance of %s", (input, expected) => {
    expect(clampReading(input)).toBe(expected);
  });
});

describe("progress reporting", () => {
  test("floors the percentage so it only reads 100 when the time is actually gone", () => {
    const running = startTimer(createExamTimer(1000), T0);

    expect(readTimer(running, T0 + 999_000).percentElapsed).toBe(99);
    expect(readTimer(running, T0 + 1_000_000).percentElapsed).toBe(100);
  });

  test("reports progress halfway through", () => {
    const running = startTimer(createExamTimer(THREE_HOURS), T0);
    expect(readTimer(running, T0 + 5_400_000).progress).toBeCloseTo(0.5, 3);
  });
});

describe("clampDuration", () => {
  test.each([
    [0, MIN_TIMER_MINUTES * 60],
    [10_000_000, MAX_TIMER_MINUTES * 60],
    [Number.NaN, MIN_TIMER_MINUTES * 60],
    [THREE_HOURS, THREE_HOURS],
  ])("clamps %s", (input, expected) => {
    expect(clampDuration(input)).toBe(expected);
  });
});

describe("formatClock", () => {
  test.each([
    [3720, "1:02:00"],
    [3600, "1:00:00"],
    [3599, "59:59"],
    [65, "01:05"],
    [0, "00:00"],
    [-40, "00:00"],
  ])("%s -> %s", (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});

describe("crossedAlert", () => {
  test("fires when a threshold is passed", () => {
    expect(crossedAlert(601, 600)?.label).toBe("10 minutes remaining");
  });

  test("still fires when a throttled tab jumps clean over the threshold", () => {
    expect(crossedAlert(640, 590)?.label).toBe("10 minutes remaining");
  });

  test("does not fire twice for the same threshold", () => {
    expect(crossedAlert(600, 599)).toBeNull();
  });

  test("does not fire when the clock is not moving down", () => {
    expect(crossedAlert(600, 600)).toBeNull();
  });

  test("fires at zero", () => {
    expect(crossedAlert(2, 0)?.label).toBe("Pens down");
  });
});

describe("dial", () => {
  test("labels every fifth minute and leaves the rest as plain ticks", () => {
    const ticks = buildDialTicks(40, 50);

    expect(ticks).toHaveLength(11);
    expect(ticks.filter((tick) => tick.labelled).map((tick) => tick.minutes)).toEqual([40, 45, 50]);
  });

  test("snaps to whole minutes inside the allowed range", () => {
    expect(snapDialMinutes(62.4)).toBe(62);
    expect(snapDialMinutes(-10)).toBe(MIN_TIMER_MINUTES);
    expect(snapDialMinutes(9999)).toBe(MAX_TIMER_MINUTES);
  });
});
