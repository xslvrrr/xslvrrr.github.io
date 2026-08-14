/**
 * The "picked for you" row.
 *
 * One scrollable line at the top of the browser, so it has room for roughly a dozen papers and no
 * more. That constraint is the whole design problem: with twelve slots, showing twelve papers from
 * the student's strongest subject is a worse answer than showing four subjects' worth, even if the
 * top twelve score higher individually.
 *
 * The scoring reads three things the app already knows — what the student is enrolled in, what
 * they have attempted, and how their flashcard reviews are going — and turns them into a reason
 * string. Every pick carries its reason: an unexplained recommendation is indistinguishable from
 * an advert, and a student who cannot tell why a paper was suggested has no basis to trust the
 * next one.
 */

import { eraForYear, type PastPaper, type SyllabusEra } from "./domain.ts";

export interface SubjectStanding {
  subjectSlug: string;
  /**
   * 0-1 retention from flashcard reviews in this subject, or null when there is not enough review
   * history to say anything. Null is not zero, and must not be treated as weakness.
   */
  retention: number | null;
  /** Reviews the retention is based on. Small samples are noise. */
  reviewCount: number;
  /** Papers already attempted in this subject. */
  attempts: number;
  /** Mean self-rated difficulty of those attempts, 1-5, or null. */
  meanRating: number | null;
}

export interface RecommendationContext {
  yearLevel: string | null;
  enrolledSubjectSlugs: readonly string[];
  standings: readonly SubjectStanding[];
  attemptedPaperIds: ReadonlySet<string>;
  savedPaperIds: ReadonlySet<string>;
  currentYear: number;
  eras: readonly SyllabusEra[];
}

export interface Recommendation {
  paper: PastPaper;
  score: number;
  /** Shown on the card. Written to be read by a student, not by us. */
  reason: string;
}

export const PICKED_FOR_YOU_LIMIT = 12;
/** Below this many reviews, retention is not evidence of anything. */
const MIN_REVIEWS_FOR_RETENTION = 20;

export function pickForYou(
  papers: readonly PastPaper[],
  context: RecommendationContext,
  limit = PICKED_FOR_YOU_LIMIT,
): Recommendation[] {
  const standings = new Map(context.standings.map((standing) => [standing.subjectSlug, standing]));
  const enrolled = new Set(context.enrolledSubjectSlugs);

  const scored = papers
    .filter((paper) => isEligible(paper, context, enrolled))
    .map((paper) => scorePaper(paper, context, standings.get(paper.subjectSlug)))
    .sort((a, b) => b.score - a.score);

  return diversify(scored, limit);
}

function isEligible(
  paper: PastPaper,
  context: RecommendationContext,
  enrolled: ReadonlySet<string>,
): boolean {
  // Answer documents are not something to be recommended into: they are what you open afterwards.
  if (paper.documentKind !== "paper") return false;
  // A recommendation the student cannot act on is worse than an empty row.
  if (!enrolled.has(paper.subjectSlug)) return false;
  if (context.yearLevel && paper.yearLevel !== context.yearLevel) return false;
  if (context.attemptedPaperIds.has(paper.id)) return false;
  return true;
}

function scorePaper(
  paper: PastPaper,
  context: RecommendationContext,
  standing: SubjectStanding | undefined,
): Recommendation {
  let score = 0;
  let reason = "In one of your subjects";

  const era = paper.year !== null ? eraForYear(context.eras, paper.year, paper.subjectSlug) : null;
  const currentSyllabus = era?.endYear === null;
  if (currentSyllabus) score += 30;
  else if (era) score -= 25;

  if (paper.year !== null) {
    score += Math.max(0, 20 - (context.currentYear - paper.year) * 20 / 12);
  }

  // A paper with no answers available cannot be marked, so it teaches pacing and nothing else.
  if (paper.hasSolutions) {
    score += 14;
  } else {
    score -= 6;
  }

  if (paper.category === "hsc") score += 16;

  // --- The part that makes this personal -------------------------------------------------
  const weakness = weaknessSignal(standing);
  if (weakness !== null) {
    score += weakness * 45;
    if (weakness > 0.35) reason = "Your flashcard recall in this subject has slipped";
  }

  // Difficulty is matched to the student rather than maximised. Someone whose recall is weak needs
  // a paper they can finish; someone comfortable needs one that actually tests them. Recommending
  // a brutal paper to a struggling student is how practice turns into avoidance.
  if (paper.difficulty) {
    const target = targetDifficulty(standing);
    const distance = Math.abs(difficultyValue(paper.difficulty.band) - target);
    score += Math.max(0, 24 - distance * 12) * paper.difficulty.confidence;
    if (distance <= 0.5 && paper.difficulty.confidence >= 0.45) {
      reason = weakness !== null && weakness > 0.35
        ? "Pitched to rebuild confidence in this subject"
        : "Pitched at about your current level";
    }
  }

  if (standing && standing.attempts === 0) {
    score += 18;
    reason = "You have not sat a paper in this subject yet";
  }

  if (context.savedPaperIds.has(paper.id)) {
    score += 12;
    reason = "Saved, and still not sat";
  }

  score += Math.log10(1 + paper.saveCount + paper.attemptCount) * 5;

  return { paper, score, reason };
}

/**
 * How much this subject needs attention, 0-1, or null when there is not enough evidence.
 *
 * Returning null rather than 0 for a thin review history matters: a subject the student has barely
 * reviewed would otherwise look identical to one they have mastered, and get pushed down the row
 * for it.
 */
function weaknessSignal(standing: SubjectStanding | undefined): number | null {
  if (!standing) return null;
  if (standing.retention === null || standing.reviewCount < MIN_REVIEWS_FOR_RETENTION) return null;
  return Math.min(1, Math.max(0, 1 - standing.retention));
}

/** 0-1 across the five bands, so difficulty and retention are on comparable scales. */
function difficultyValue(band: string): number {
  const index = ["gentle", "standard", "solid", "hard", "brutal"].indexOf(band);
  return index === -1 ? 0.5 : index / 4;
}

/**
 * Where to pitch the next paper.
 *
 * Defaults to the middle for a student we know nothing about. Weak recall pulls it down, a run of
 * papers the student found easy pushes it up — the same reason a ladder exists, applied one paper
 * at a time.
 */
function targetDifficulty(standing: SubjectStanding | undefined): number {
  if (!standing) return 0.5;

  let target = 0.5;
  const weakness = weaknessSignal(standing);
  if (weakness !== null) target -= weakness * 0.3;
  // Rated below 3 means the papers sat so far were not stretching them.
  if (standing.meanRating !== null && standing.attempts >= 2) {
    target += (3 - standing.meanRating) * 0.12;
  }
  return Math.min(1, Math.max(0, target));
}

/**
 * Spreads the row across subjects.
 *
 * A strict rotation: take each subject's best remaining paper, then its second best, and so on
 * until the row is full or the candidates run out. A student with four subjects sees all four
 * before any subject gets a second slot, and a student with one subject still gets a full row.
 *
 * The per-subject cap emerges from the rotation rather than being enforced on top of it. An
 * earlier version capped each subject at three and then topped the row up by raw score, which
 * quietly undid the cap — the top-up came from whichever subject had the most papers, so the
 * subject the cap was meant to restrain ended up with nine of twelve slots.
 */
function diversify(scored: readonly Recommendation[], limit: number): Recommendation[] {
  const bySubject = new Map<string, Recommendation[]>();
  for (const entry of scored) {
    const list = bySubject.get(entry.paper.subjectSlug) ?? [];
    list.push(entry);
    bySubject.set(entry.paper.subjectSlug, list);
  }

  const queues = [...bySubject.values()];
  const deepest = Math.max(0, ...queues.map((queue) => queue.length));
  const picked: Recommendation[] = [];

  for (let round = 0; round < deepest && picked.length < limit; round += 1) {
    // Subjects are visited in order of their best paper in this round, so the strongest candidate
    // still leads the row even though no subject can dominate it.
    const candidates = queues
      .map((queue) => queue[round])
      .filter((entry): entry is Recommendation => entry !== undefined)
      .sort((a, b) => b.score - a.score);

    for (const entry of candidates) {
      if (picked.length >= limit) break;
      picked.push(entry);
    }
  }

  return picked.slice(0, limit);
}
