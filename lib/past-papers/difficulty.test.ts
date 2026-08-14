import { describe, expect, test } from "vitest";

import {
  assessDifficulty,
  bandFromScore,
  isDifficultySettled,
  MIN_COHORT_ATTEMPTS,
  type CohortSignal,
  type StructuralSignal,
} from "./difficulty.ts";

const OFFICIAL: StructuralSignal = {
  marksPerMinute: 100 / 180,
  official: true,
  schoolTier: null,
  currentSyllabus: true,
};

const cohort = (overrides: Partial<CohortSignal> = {}): CohortSignal => ({
  attempts: 40,
  meanTimeUsedRatio: 0.85,
  abandonRate: 0.1,
  meanSelfRating: 3,
  ...overrides,
});

describe("bandFromScore", () => {
  test("maps the scale onto bands and clamps outside it", () => {
    expect(bandFromScore(1)).toBe("gentle");
    expect(bandFromScore(3)).toBe("solid");
    expect(bandFromScore(5)).toBe("brutal");
    expect(bandFromScore(-4)).toBe("gentle");
    expect(bandFromScore(99)).toBe("brutal");
  });
});

describe("assessDifficulty", () => {
  test("calibrates a standard official paper to the middle of the ladder", () => {
    const result = assessDifficulty({ cohort: null, curated: null, structural: OFFICIAL });
    expect(result?.band).toBe("solid");
  });

  test("never claims high confidence from structure alone", () => {
    const result = assessDifficulty({ cohort: null, curated: null, structural: OFFICIAL });

    expect(result).not.toBeNull();
    expect(isDifficultySettled(result)).toBe(false);
  });

  test("raises the band for a top selective school's trial and says why", () => {
    const result = assessDifficulty({
      cohort: null,
      curated: null,
      structural: { ...OFFICIAL, official: false, schoolTier: "selective-top" },
    });

    expect(result?.band).toBe("hard");
    expect(result?.rationale.join(" ")).toContain("top selective school");
  });

  test("ignores a cohort too small to mean anything", () => {
    const withTiny = assessDifficulty({
      cohort: cohort({ attempts: MIN_COHORT_ATTEMPTS - 1, meanSelfRating: 5 }),
      curated: null,
      structural: OFFICIAL,
    });
    const without = assessDifficulty({ cohort: null, curated: null, structural: OFFICIAL });

    expect(withTiny?.band).toBe(without?.band);
    expect(withTiny?.confidence).toBe(without?.confidence);
  });

  test("lets a large cohort override the structural prior", () => {
    const result = assessDifficulty({
      cohort: cohort({ attempts: 120, meanSelfRating: 5, meanTimeUsedRatio: 1.05, abandonRate: 0.5 }),
      curated: null,
      structural: OFFICIAL,
    });

    expect(result?.band).toBe("brutal");
    expect(isDifficultySettled(result)).toBe(true);
  });

  test("weights a bigger cohort more than a smaller one", () => {
    const small = assessDifficulty({
      cohort: cohort({ attempts: 10, meanSelfRating: 5 }),
      curated: null,
      structural: OFFICIAL,
    });
    const large = assessDifficulty({
      cohort: cohort({ attempts: 200, meanSelfRating: 5 }),
      curated: null,
      structural: OFFICIAL,
    });

    expect(large!.confidence).toBeGreaterThan(small!.confidence);
  });

  test("carries a curated judgement's citation through to the result", () => {
    const result = assessDifficulty({
      cohort: null,
      curated: {
        band: "brutal",
        note: "Widely described as the hardest paper of its decade.",
        source: { kind: "thread", label: "Bored of Studies", url: "https://example.invalid/thread" },
      },
      structural: OFFICIAL,
    });

    expect(result?.sources).toContainEqual({
      kind: "thread",
      label: "Bored of Studies",
      url: "https://example.invalid/thread",
    });
    expect(result?.rationale).toContain("Widely described as the hardest paper of its decade.");
  });

  test("flags an out-of-era paper in the rationale", () => {
    const result = assessDifficulty({
      cohort: null,
      curated: null,
      structural: { ...OFFICIAL, currentSyllabus: false },
    });

    expect(result?.rationale.join(" ")).toContain("earlier syllabus");
  });

  test("reads a dense paper as harder than a light one", () => {
    const dense = assessDifficulty({
      cohort: null,
      curated: null,
      structural: { ...OFFICIAL, marksPerMinute: 0.9 },
    });
    const light = assessDifficulty({
      cohort: null,
      curated: null,
      structural: { ...OFFICIAL, marksPerMinute: 0.3 },
    });

    expect(dense!.band).not.toBe(light!.band);
    expect(dense!.rationale.join(" ")).toContain("Denser");
    expect(light!.rationale.join(" ")).toContain("Lighter");
  });
});
