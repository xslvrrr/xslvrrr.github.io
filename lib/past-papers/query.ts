/**
 * Filtering, sorting and relevance for the paper browser.
 *
 * Kept as pure functions over already-fetched rows so the ordering rules are testable without a
 * database, and so the same code can order a cached page in the browser as ordered it on the
 * server. The heavy narrowing — year level, subject, text search — belongs in SQL; this module
 * decides the arrangement, which is the part with judgement in it.
 */

import {
  eraForYear,
  isAnswerBearing,
  type PaperCategory,
  type PaperDifficultyBand,
  type PastPaper,
  type SyllabusEra,
} from "./domain.ts";

export type PaperSort = "relevance" | "year-desc" | "year-asc" | "difficulty-asc" | "difficulty-desc" | "popular" | "school";

export const PAPER_SORT_LABELS: Record<PaperSort, string> = {
  relevance: "Most relevant",
  "year-desc": "Newest first",
  "year-asc": "Oldest first",
  "difficulty-asc": "Easiest first",
  "difficulty-desc": "Hardest first",
  popular: "Most used",
  school: "School A-Z",
};

export interface PaperFilters {
  yearLevel?: string;
  subjectSlugs?: readonly string[];
  categories?: readonly PaperCategory[];
  schools?: readonly string[];
  /** Inclusive on both ends. */
  yearFrom?: number | null;
  yearTo?: number | null;
  /** Overrides `yearFrom`/`yearTo` when set, so era buttons and the range control cannot disagree. */
  syllabusEraId?: string | null;
  difficultyBands?: readonly PaperDifficultyBand[];
  tagIds?: readonly string[];
  /** Hides marking guidelines, sample answers and the like from the listing. */
  papersOnly?: boolean;
  requireSolutions?: boolean;
  savedOnly?: boolean;
  search?: string;
}

const DIFFICULTY_ORDER: Record<PaperDifficultyBand, number> = {
  gentle: 0,
  standard: 1,
  solid: 2,
  hard: 3,
  brutal: 4,
};

export function resolveYearRange(
  filters: PaperFilters,
  eras: readonly SyllabusEra[]
): { from: number | null; to: number | null } {
  if (filters.syllabusEraId) {
    const era = eras.find((candidate) => candidate.id === filters.syllabusEraId);
    if (era) return { from: era.startYear, to: era.endYear };
  }
  return { from: filters.yearFrom ?? null, to: filters.yearTo ?? null };
}

export function filterPapers(
  papers: readonly PastPaper[],
  filters: PaperFilters,
  eras: readonly SyllabusEra[],
  savedPaperIds: ReadonlySet<string> = new Set()
): PastPaper[] {
  const range = resolveYearRange(filters, eras);
  const search = filters.search?.trim().toLowerCase() ?? "";

  return papers.filter((paper) => {
    if (filters.yearLevel && paper.yearLevel !== filters.yearLevel) return false;
    if (filters.subjectSlugs?.length && !filters.subjectSlugs.includes(paper.subjectSlug)) return false;
    if (filters.categories?.length && !filters.categories.includes(paper.category)) return false;
    if (filters.schools?.length && (!paper.school || !filters.schools.includes(paper.school))) return false;
    if (filters.papersOnly && isAnswerBearing(paper.documentKind)) return false;
    if (filters.requireSolutions && !paper.hasSolutions) return false;
    if (filters.savedOnly && !savedPaperIds.has(paper.id)) return false;

    // An undated resource is excluded by any year constraint rather than silently kept: a range is
    // a statement about when a paper was sat, and a paper with no year cannot satisfy it.
    if (range.from !== null || range.to !== null) {
      if (paper.year === null) return false;
      if (range.from !== null && paper.year < range.from) return false;
      if (range.to !== null && paper.year > range.to) return false;
    }

    if (filters.difficultyBands?.length) {
      if (!paper.difficulty || !filters.difficultyBands.includes(paper.difficulty.band)) return false;
    }

    if (filters.tagIds?.length) {
      const tagIds = new Set(paper.tags.map((tag) => tag.id));
      if (!filters.tagIds.every((tagId) => tagIds.has(tagId))) return false;
    }

    if (search && !matchesSearch(paper, search)) return false;
    return true;
  });
}

function matchesSearch(paper: PastPaper, search: string): boolean {
  const haystack = [paper.subject, paper.school ?? "", paper.title, paper.year?.toString() ?? ""]
    .join(" ")
    .toLowerCase();
  // Every term must appear somewhere, so "ruse 2019" narrows rather than widening to either.
  return search.split(/\s+/).every((term) => haystack.includes(term));
}

export interface RelevanceContext {
  /** Subjects the student is actually enrolled in. Dominates the ranking. */
  enrolledSubjectSlugs: ReadonlySet<string>;
  /** The student's year level, so a Year 12 is not shown Year 9 papers first. */
  yearLevel: string | null;
  /** Papers already attempted, which should fall behind ones not yet tried. */
  attemptedPaperIds: ReadonlySet<string>;
  savedPaperIds: ReadonlySet<string>;
  /** Current year, for recency scoring. Passed in rather than read, so ordering is testable. */
  currentYear: number;
  eras: readonly SyllabusEra[];
}

/**
 * Relevance score.
 *
 * The ordering this produces is the default the browser opens on, so it answers "what should I
 * sit next" rather than "what matches the query best". Enrolment and syllabus era dominate,
 * because a brilliantly-rated paper for a subject the student does not take is noise, and a paper
 * written for a superseded syllabus teaches a format that no longer exists.
 */
export function relevanceScore(paper: PastPaper, context: RelevanceContext): number {
  let score = 0;

  if (context.enrolledSubjectSlugs.has(paper.subjectSlug)) score += 100;
  if (context.yearLevel && paper.yearLevel === context.yearLevel) score += 40;

  const era = paper.year !== null
    ? eraForYear(context.eras, paper.year, paper.subjectSlug)
    : null;
  if (era && era.endYear === null) score += 35;
  else if (era) score -= 15;

  if (paper.year !== null) {
    // Recency decays over fifteen years rather than cutting off: a 2012 paper is still worth
    // sitting, it just should not outrank a 2024 one.
    score += Math.max(0, 25 - (context.currentYear - paper.year) * 25 / 15);
  }

  // Official papers are the format the exam will actually take. A school-set exam — a trial, a
  // preliminary paper, a junior yearly — is the next best thing, and all three outrank the loose
  // material in `other`, which is topic sheets and competition problems rather than a sitting.
  if (paper.category === "hsc") score += 20;
  else if (paper.category === "trial" || paper.category === "prelim" || paper.category === "yearly") {
    score += 12;
  }

  if (isAnswerBearing(paper.documentKind)) score -= 60;
  if (paper.hasSolutions) score += 10;

  // Already sat: keep it findable, stop it leading.
  if (context.attemptedPaperIds.has(paper.id)) score -= 45;
  if (context.savedPaperIds.has(paper.id)) score += 8;

  // Popularity is a weak tiebreak, deliberately logarithmic. Linear popularity would freeze the
  // top of the list: the papers shown first get used most, which ranks them first again.
  score += Math.log10(1 + paper.saveCount + paper.attemptCount) * 6;

  return score;
}

export function sortPapers(
  papers: readonly PastPaper[],
  sort: PaperSort,
  context: RelevanceContext
): PastPaper[] {
  const ordered = [...papers];

  switch (sort) {
    case "relevance":
      return ordered.sort((a, b) => relevanceScore(b, context) - relevanceScore(a, context) || compareTitle(a, b));
    case "year-desc":
      return ordered.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || compareTitle(a, b));
    case "year-asc":
      return ordered.sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || compareTitle(a, b));
    case "difficulty-asc":
      return ordered.sort((a, b) => difficultyRank(a) - difficultyRank(b) || compareTitle(a, b));
    case "difficulty-desc":
      return ordered.sort((a, b) => difficultyRank(b) - difficultyRank(a) || compareTitle(a, b));
    case "popular":
      return ordered.sort((a, b) =>
        (b.saveCount + b.attemptCount) - (a.saveCount + a.attemptCount) || compareTitle(a, b));
    case "school":
      return ordered.sort((a, b) =>
        (a.school ?? "￿").localeCompare(b.school ?? "￿") || (b.year ?? 0) - (a.year ?? 0));
    default:
      return ordered;
  }
}

/**
 * Papers with no difficulty sort to the middle rather than to an end, so an unrated paper does not
 * masquerade as the easiest thing available to a student sorting by difficulty ascending.
 */
function difficultyRank(paper: PastPaper): number {
  if (!paper.difficulty) return 2;
  return DIFFICULTY_ORDER[paper.difficulty.band];
}

function compareTitle(a: PastPaper, b: PastPaper): number {
  return a.title.localeCompare(b.title);
}

/** Distinct schools present in a result set, for the school filter. */
export function schoolsIn(papers: readonly PastPaper[]): string[] {
  return [...new Set(papers.flatMap((paper) => (paper.school ? [paper.school] : [])))]
    .sort((a, b) => a.localeCompare(b));
}

/** Distinct years present, for the range control's bounds and for era visibility. */
export function yearsIn(papers: readonly PastPaper[]): number[] {
  return [...new Set(papers.flatMap((paper) => (paper.year === null ? [] : [paper.year])))]
    .sort((a, b) => a - b);
}
