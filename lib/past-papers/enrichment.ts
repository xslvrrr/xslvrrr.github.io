/**
 * Everything the index infers rather than reads.
 *
 * Timing is the part that has to be right. The timer above the viewer defaults to whatever this
 * module returns, and a student who practises a three-hour paper against a two-hour clock learns
 * the wrong pace and does not find out until the exam. So the order of authority is: what the
 * paper says about itself, then the official allowance for the course, then nothing — never a
 * guess dressed as a measurement. `TimingDetection.source` records which of those it was, and the
 * UI says so.
 */

import { timingForSubject } from "./taxonomy.ts";

export interface TimingDetection {
  workingMinutes: number | null;
  readingMinutes: number | null;
  source: "document" | "subject-default" | "unknown";
  /** The line the numbers came from, so a student can check the detection at a glance. */
  evidence: string | null;
}

const HOURS_IN_MINUTES = 60;

/** Written-out numbers appear as often as digits on exam cover pages. */
const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fortyfive: 45,
};

/**
 * Working time is capped at eight hours and reading at one. Past those, the match is a page
 * reference or a date that happened to sit next to the word "time", not an allowance.
 */
const MAX_WORKING_MINUTES = 8 * HOURS_IN_MINUTES;
const MAX_READING_MINUTES = 60;

function toMinutes(value: string, unit: string): number | null {
  const numeric = WORD_NUMBERS[value.toLowerCase().replace(/[\s-]/g, "")] ?? Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return /^h/i.test(unit) ? Math.round(numeric * HOURS_IN_MINUTES) : Math.round(numeric);
}

/**
 * A duration phrase such as `3 hours`, `2 1/2 hours`, `90 minutes`, or `1 hour 30 minutes`.
 * Captured as a whole so a compound like "2 hours 30 minutes" is not read as two hours.
 */
const DURATION = String.raw`(\d+(?:\.\d+)?|\d+\s*(?:1\/2|½)|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty[\s-]?five)\s*(hours?|hrs?|minutes?|mins?)`;

function parseDuration(text: string): number | null {
  const compound = text.match(new RegExp(String.raw`(\d+)\s*(?:hours?|hrs?)\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?)`, "i"));
  if (compound) return Number(compound[1]) * HOURS_IN_MINUTES + Number(compound[2]);

  const half = text.match(new RegExp(String.raw`(\d+)\s*(?:1\/2|½)\s*(hours?|hrs?)`, "i"));
  if (half) return Number(half[1]) * HOURS_IN_MINUTES + HOURS_IN_MINUTES / 2;

  const simple = text.match(new RegExp(DURATION, "i"));
  return simple ? toMinutes(simple[1], simple[2]) : null;
}

/**
 * Reads the working and reading allowances off a paper's own text.
 *
 * `text` is the first page or two extracted from the PDF, not the whole document — a question
 * later in the paper that says "allow 20 minutes for this section" is not the paper's allowance,
 * and scanning the whole thing lets that outrank the cover page.
 */
export function detectPaperTiming(text: string, subjectSlug?: string): TimingDetection {
  const lines = text
    .replace(/–|—/g, "-")
    .split(/[\n\r•·]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let workingMinutes: number | null = null;
  let readingMinutes: number | null = null;
  let evidence: string | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (workingMinutes === null && /\b(working\s*time|time\s*allowed|duration\s*of\s*(?:exam|paper))\b/.test(lower)) {
      const minutes = parseDuration(line);
      if (minutes !== null && minutes <= MAX_WORKING_MINUTES) {
        workingMinutes = minutes;
        evidence = line;
      }
    }

    if (readingMinutes === null && /\breading\s*time\b/.test(lower)) {
      const minutes = parseDuration(line);
      if (minutes !== null && minutes <= MAX_READING_MINUTES) readingMinutes = minutes;
    }

    // Some trial papers write it as one sentence: "Time allowed: 2 hours (plus 5 minutes reading)".
    if (readingMinutes === null && /\bplus\b[^.]*\breading\b/.test(lower)) {
      const tail = lower.slice(lower.indexOf("plus"));
      const minutes = parseDuration(tail);
      if (minutes !== null && minutes <= MAX_READING_MINUTES) readingMinutes = minutes;
    }
  }

  if (workingMinutes !== null) {
    return { workingMinutes, readingMinutes, source: "document", evidence };
  }

  const fallback = subjectSlug ? timingForSubject(subjectSlug) : null;
  if (fallback) {
    return {
      workingMinutes: fallback.workingMinutes,
      readingMinutes: fallback.readingMinutes,
      source: "subject-default",
      evidence: null,
    };
  }

  return { workingMinutes: null, readingMinutes: null, source: "unknown", evidence: null };
}

/**
 * Total marks from a cover page.
 *
 * Deliberately narrow: only a labelled total counts. Exam papers are dense with per-question mark
 * allocations, and the largest number on the page is as often a question number or a year.
 */
export function detectTotalMarks(text: string): number | null {
  const match = text.match(/\btotal\s*marks?\s*[:\-–]?\s*(\d{1,3})\b/i);
  if (!match) return null;
  const marks = Number(match[1]);
  return marks > 0 && marks <= 200 ? marks : null;
}

/**
 * Number of pages a paper says it has, used to sanity-check a fetched file against its listing.
 * Absent on plenty of papers, which is fine — it is a cross-check, not a requirement.
 */
export function detectStatedPageCount(text: string): number | null {
  const match = text.match(/\b(\d{1,3})\s*pages?\b/i);
  if (!match) return null;
  const pages = Number(match[1]);
  return pages > 0 && pages <= 200 ? pages : null;
}
