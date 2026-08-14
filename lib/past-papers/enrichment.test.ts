import { describe, expect, test } from "vitest";

import { detectPaperTiming, detectStatedPageCount, detectTotalMarks } from "./enrichment.ts";

/** The NESA cover page format, bullets and en dashes included. */
const NESA_COVER = `
2019 HIGHER SCHOOL CERTIFICATE EXAMINATION

Physics

General Instructions
• Reading time – 5 minutes
• Working time – 3 hours
• Write using black pen

Total marks: 100
`;

describe("detectPaperTiming", () => {
  test("reads the official cover page", () => {
    const timing = detectPaperTiming(NESA_COVER, "physics");

    expect(timing).toMatchObject({ workingMinutes: 180, readingMinutes: 5, source: "document" });
    expect(timing.evidence).toContain("Working time");
  });

  test("reads a compound allowance without truncating to the hour", () => {
    const timing = detectPaperTiming("Working time: 2 hours and 30 minutes", "maths-standard");
    expect(timing.workingMinutes).toBe(150);
  });

  test("reads a half-hour written as a fraction", () => {
    expect(detectPaperTiming("Working Time: 1 1/2 hours").workingMinutes).toBe(90);
    expect(detectPaperTiming("Working Time: 2 ½ hours").workingMinutes).toBe(150);
  });

  test("reads a written-out number", () => {
    expect(detectPaperTiming("Working time - three hours").workingMinutes).toBe(180);
  });

  test("reads a school trial's single-sentence phrasing", () => {
    const timing = detectPaperTiming("Time allowed: 2 hours (plus 5 minutes reading time)");

    expect(timing.workingMinutes).toBe(120);
    expect(timing.readingMinutes).toBe(5);
  });

  test("falls back to the official subject allowance and says so", () => {
    const timing = detectPaperTiming("Physics Trial Examination", "physics");

    expect(timing).toMatchObject({ workingMinutes: 180, readingMinutes: 5, source: "subject-default" });
    expect(timing.evidence).toBeNull();
  });

  test("reports unknown rather than guessing for an unmapped subject", () => {
    expect(detectPaperTiming("Some paper", "underwater-basket-weaving")).toMatchObject({
      workingMinutes: null,
      source: "unknown",
    });
  });

  test("ignores a per-question suggestion that outranks nothing", () => {
    // "allow 20 minutes" is advice about one section, not the paper's allowance.
    const timing = detectPaperTiming("Question 31\nAllow 20 minutes for this section.", "physics");
    expect(timing.source).toBe("subject-default");
    expect(timing.workingMinutes).toBe(180);
  });

  test("rejects an implausible allowance rather than trusting it", () => {
    const timing = detectPaperTiming("Working time - 2019 hours", "physics");
    expect(timing.source).toBe("subject-default");
  });

  test("takes the first working time when a paper repeats it", () => {
    const timing = detectPaperTiming("Working time - 3 hours\nWorking time - 45 minutes");
    expect(timing.workingMinutes).toBe(180);
  });
});

describe("detectTotalMarks", () => {
  test("reads a labelled total", () => {
    expect(detectTotalMarks(NESA_COVER)).toBe(100);
  });

  test("ignores per-question allocations", () => {
    expect(detectTotalMarks("Question 21 (4 marks)\nQuestion 22 (6 marks)")).toBeNull();
  });

  test("rejects a total outside any real paper's range", () => {
    expect(detectTotalMarks("Total marks: 9000")).toBeNull();
  });
});

describe("detectStatedPageCount", () => {
  test("reads a stated page count", () => {
    expect(detectStatedPageCount("This paper has 32 pages")).toBe(32);
  });

  test("returns null when the paper does not state one", () => {
    expect(detectStatedPageCount(NESA_COVER)).toBeNull();
  });
});
