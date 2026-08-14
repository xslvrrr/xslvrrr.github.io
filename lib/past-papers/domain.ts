/**
 * Core vocabulary for the past papers index.
 *
 * The index is a catalogue, not a library. A row here says a paper exists, where it can be
 * obtained, and what we know about it — it deliberately does not imply the file has been
 * downloaded. Fetching a document is a separate, user-initiated act (a save or a star), because
 * the upstream sources are other people's bandwidth and, in some cases, other people's licences.
 */

/** Stage of schooling. Mirrors the top level of the THSC folder tree so the browser can match it. */
export type PaperYearLevel = "yr9" | "yr10" | "yr11" | "yr12";

export const PAPER_YEAR_LEVELS = ["yr9", "yr10", "yr11", "yr12"] as const;

export const PAPER_YEAR_LEVEL_LABELS: Record<PaperYearLevel, string> = {
  yr9: "Year 9",
  yr10: "Year 10",
  yr11: "Year 11 - Preliminary",
  yr12: "Year 12 - HSC",
};

/**
 * Second level of the tree. THSC splits every subject into these three buckets and students
 * navigate by them, so the same split is load-bearing here rather than cosmetic.
 */
export type PaperCategory = "hsc" | "trial" | "assessment" | "prelim" | "yearly" | "other";

export const PAPER_CATEGORIES = ["hsc", "trial", "assessment", "prelim", "yearly", "other"] as const;

export const PAPER_CATEGORY_LABELS: Record<PaperCategory, string> = {
  hsc: "Past HSC",
  trial: "Trial papers",
  assessment: "Assessment tasks",
  prelim: "Preliminary papers",
  // Year 9 and 10 end-of-year exams. Not a trial for anything, so it does not belong under the
  // trial label a student reads as "practice for the HSC".
  yearly: "Yearly exams",
  other: "Other resources",
};

/**
 * What a single document actually is. A "paper" and its "marking guidelines" are separate
 * documents in every upstream source, and conflating them is how a student ends up sitting a
 * timed practice exam with the answers open.
 */
export type PaperDocumentKind =
  | "paper"
  | "solutions"
  | "marking_guidelines"
  | "sample_answers"
  | "marking_feedback"
  | "notes"
  | "unknown";

export const PAPER_DOCUMENT_KIND_LABELS: Record<PaperDocumentKind, string> = {
  paper: "Paper",
  solutions: "Solutions",
  marking_guidelines: "Marking guidelines",
  sample_answers: "Sample answers",
  marking_feedback: "Marking feedback",
  notes: "Notes",
  unknown: "Document",
};

/** Documents that give the answers away, and so must never auto-open beside a running timer. */
export const ANSWER_BEARING_KINDS: readonly PaperDocumentKind[] = [
  "solutions",
  "marking_guidelines",
  "sample_answers",
  "marking_feedback",
];

export function isAnswerBearing(kind: PaperDocumentKind): boolean {
  return ANSWER_BEARING_KINDS.includes(kind);
}

/**
 * How a document can be obtained.
 *
 * - `direct` — a public URL we may fetch server-side on the student's behalf.
 * - `referral` — the source gates delivery behind its own flow. We link the student out and never
 *   attempt the gate ourselves. Every school trial paper on THSC is one of these.
 */
export type PaperAccessMode = "direct" | "referral";

export interface PaperResource {
  /** Human label for the provider of this particular copy, shown next to the link. */
  display: string;
  url: string;
  accessMode: PaperAccessMode;
  /** True for the copy the source itself considers canonical. */
  preferred: boolean;
  /** `official` copies come from NESA/Board of Studies and are preferred for archival fetches. */
  official: boolean;
}

/**
 * A syllabus era groups years that sit under one set of prescriptions. Comparing a 2015 paper to a
 * 2020 one is comparing different courses, so the browser needs to be able to say so.
 *
 * Eras are open-ended on purpose: `endYear: null` means "current, still running". A future era is
 * only surfaced once the index actually holds a paper inside it, which is why `startYear` alone
 * cannot drive visibility — see `visibleSyllabusEras`.
 */
export interface SyllabusEra {
  id: string;
  label: string;
  /** Shown in the filter row under the label. */
  description: string;
  startYear: number;
  endYear: number | null;
  /** Subject slugs this era applies to; empty means every subject. */
  subjectSlugs: readonly string[];
}

export interface PastPaper {
  id: string;
  sourceSlug: string;
  /** Stable key within the source, so a re-index updates rather than duplicates. */
  externalKey: string;
  yearLevel: PaperYearLevel;
  category: PaperCategory;
  /** Display name of the subject as the source spells it. */
  subject: string;
  /** Normalised slug used for cross-source joins and URLs. */
  subjectSlug: string;
  /** Issuing school for a trial paper; null for official papers. */
  school: string | null;
  /** Year the paper was sat. Null when a source lists an undated resource. */
  year: number | null;
  title: string;
  documentKind: PaperDocumentKind;
  resources: readonly PaperResource[];
  /** Set when a companion solutions document exists anywhere in the index. */
  hasSolutions: boolean;
  syllabusEraId: string | null;
  /** Working time in minutes, detected from the paper or from the subject's official allowance. */
  durationMinutes: number | null;
  readingMinutes: number | null;
  /**
   * Which authority the timing came from.
   *
   * Carried all the way to the timer, which says so. A `subject-default` allowance presented as if
   * it had been read off the paper is the failure this field exists to prevent: the number looks
   * identical either way, and a student has no way to tell an assumption from a measurement.
   */
  durationSource: "document" | "subject-default" | "unknown";
  totalMarks: number | null;
  /**
   * Which authority the mark total came from, on the same terms as `durationSource`.
   *
   * `title` covers the common THSC case where the listing itself says "2019 Trial (100 marks)";
   * `subject-default` is the course's official HSC total, which is right for a past HSC paper and
   * only a reasonable prior for a school trial. The card says which, because pacing to marks off
   * an assumed total is the same mistake as pacing to an assumed clock.
   */
  marksSource: "document" | "title" | "subject-default" | "unknown";
  difficulty: PaperDifficulty | null;
  tags: readonly PaperTag[];
  /** Referral URL back to the source's own page, always shown for attribution. */
  sourceUrl: string;
  indexedAt: string;
  /**
   * Denormalised usage counters behind the relevance sort and the picked-for-you row.
   *
   * Aggregate across all students and never attributable to one, so they can be read on the shared
   * catalogue row without leaking who sat what.
   */
  saveCount: number;
  attemptCount: number;
}

/**
 * Difficulty is a five-point ladder rather than a number, because the only honest granularity we
 * have is "roughly where does this sit against the cohort".
 */
export type PaperDifficultyBand = "gentle" | "standard" | "solid" | "hard" | "brutal";

export const PAPER_DIFFICULTY_BANDS = ["gentle", "standard", "solid", "hard", "brutal"] as const;

export const PAPER_DIFFICULTY_LABELS: Record<PaperDifficultyBand, string> = {
  gentle: "Gentle",
  standard: "Standard",
  solid: "Solid",
  hard: "Hard",
  brutal: "Brutal",
};

/**
 * Difficulty carries its evidence with it. A band asserted from three forum threads and a band
 * asserted from nothing look identical in the UI unless the confidence and sources ride along,
 * and an unsourced difficulty label is worse than none — students plan around it.
 */
export interface PaperDifficulty {
  band: PaperDifficultyBand;
  /** 0-1. Below `DIFFICULTY_MIN_DISPLAY_CONFIDENCE` the band is shown as an estimate. */
  confidence: number;
  /** Short, quotable reasons. Rendered verbatim in the paper's detail popover. */
  rationale: readonly string[];
  /** Where the judgement came from, so a student can check it. */
  sources: readonly PaperEvidenceSource[];
}

export const DIFFICULTY_MIN_DISPLAY_CONFIDENCE = 0.45;

export interface PaperEvidenceSource {
  kind: "thread" | "article" | "official" | "heuristic" | "cohort";
  label: string;
  url: string | null;
}

/**
 * Tags are the steering wheel. A student who knows they are weak at one thing should be able to
 * reach the papers that punish it, which is what separates this from a file listing.
 */
export interface PaperTag {
  id: string;
  label: string;
  group: PaperTagGroup;
}

export type PaperTagGroup =
  | "difficulty"
  | "format"
  | "topic"
  | "provenance"
  | "usage"
  | "quality";

export const PAPER_TAG_GROUP_LABELS: Record<PaperTagGroup, string> = {
  difficulty: "Difficulty",
  format: "Format",
  topic: "Topic",
  provenance: "Source",
  usage: "Best for",
  quality: "Quality",
};

/**
 * Eras visible to a student. A future era is withheld until a paper inside it exists, so the
 * filter row never advertises a syllabus nobody can practise yet.
 */
export function visibleSyllabusEras(
  eras: readonly SyllabusEra[],
  availableYears: readonly number[]
): SyllabusEra[] {
  if (availableYears.length === 0) return [];
  const newest = Math.max(...availableYears);
  return eras.filter((era) => era.startYear <= newest);
}

export function eraForYear(eras: readonly SyllabusEra[], year: number, subjectSlug?: string): SyllabusEra | null {
  const candidates = eras.filter((era) => {
    if (year < era.startYear) return false;
    if (era.endYear !== null && year > era.endYear) return false;
    if (era.subjectSlugs.length === 0) return true;
    return subjectSlug ? era.subjectSlugs.includes(subjectSlug) : false;
  });
  // A subject-specific era wins over the catch-all covering the same years.
  return candidates.sort((a, b) => b.subjectSlugs.length - a.subjectSlugs.length)[0] ?? null;
}

export function subjectSlugOf(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
