import { describe, expect, test } from "vitest";

import {
  DEFAULT_PAST_PAPER_PREFERENCES,
  mergePastPaperPreferences,
  parsePastPaperPreferences,
} from "./preferences.ts";

describe("parsePastPaperPreferences", () => {
  test("fills every field from defaults when nothing is stored", () => {
    expect(parsePastPaperPreferences(undefined)).toEqual(DEFAULT_PAST_PAPER_PREFERENCES);
  });

  test("falls back to defaults rather than throwing on a corrupt blob", () => {
    expect(parsePastPaperPreferences({ timerVolume: "loud" })).toEqual(DEFAULT_PAST_PAPER_PREFERENCES);
  });
});

describe("mergePastPaperPreferences", () => {
  test("keeps settings the update does not mention", () => {
    const quiet = mergePastPaperPreferences(DEFAULT_PAST_PAPER_PREFERENCES, { timerVolume: 0.25 });
    const senior = mergePastPaperPreferences(quiet, { yearLevel: "yr12" });

    expect(senior.timerVolume).toBe(0.25);
    expect(senior.yearLevel).toBe("yr12");
  });

  test("survives a run of single-field saves, as the settings page issues them", () => {
    const saved = [
      { timerVolume: 0.25 },
      { yearLevel: "yr12" },
      { subjectSlugs: ["mathematics-advanced"] },
      { rollingDigits: false },
      { defaultSort: "year-desc" },
      { onboardingCompleted: true },
    ].reduce(mergePastPaperPreferences, DEFAULT_PAST_PAPER_PREFERENCES);

    expect(saved).toMatchObject({
      timerVolume: 0.25,
      yearLevel: "yr12",
      subjectSlugs: ["mathematics-advanced"],
      rollingDigits: false,
      defaultSort: "year-desc",
      onboardingCompleted: true,
    });
  });

  test("writes a false the same way it writes a true", () => {
    const off = mergePastPaperPreferences(DEFAULT_PAST_PAPER_PREFERENCES, { timerEnabled: false });
    expect(off.timerEnabled).toBe(false);
    expect(mergePastPaperPreferences(off, { timerEnabled: true }).timerEnabled).toBe(true);
  });

  test("ignores an update whose values are the wrong shape", () => {
    const current = mergePastPaperPreferences(DEFAULT_PAST_PAPER_PREFERENCES, { timerVolume: 0.25 });
    expect(mergePastPaperPreferences(current, { timerVolume: 4 })).toEqual(current);
    expect(mergePastPaperPreferences(current, null)).toEqual(current);
  });

  test("drops keys the schema does not know", () => {
    const merged = mergePastPaperPreferences(DEFAULT_PAST_PAPER_PREFERENCES, { nonsense: true });
    expect(merged).toEqual(DEFAULT_PAST_PAPER_PREFERENCES);
    expect("nonsense" in merged).toBe(false);
  });
});
