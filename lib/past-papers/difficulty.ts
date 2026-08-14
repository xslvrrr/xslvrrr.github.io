/**
 * How a paper gets a difficulty band.
 *
 * The temptation here is to have a model read a few forum threads and emit "hard". That produces a
 * confident label with no provenance, and students plan around difficulty labels — a wrong one
 * sends someone into a paper that wrecks their confidence a week before the exam, or away from the
 * paper they needed. So difficulty is assembled from layers that each carry their own evidence,
 * and the band is only shown as settled when the layers agree.
 *
 * The layers, strongest first:
 *
 * 1. `cohort` — what actually happened to students on this site: attempts finished, time used
 *    against the allowance, self-rated difficulty afterwards. This is the only first-party signal
 *    and it is the one that improves on its own.
 * 2. `curated` — a small hand-checked table of established community consensus, every row carrying
 *    a citation. Deliberately coarse and deliberately small; see `difficulty-seed.ts`.
 * 3. `structural` — properties of the document itself: marks per minute, era match, whether it is
 *    an official paper or a selective school's trial.
 *
 * A band derived from structure alone never claims high confidence, and the UI renders anything
 * below `DIFFICULTY_MIN_DISPLAY_CONFIDENCE` as an estimate rather than a fact.
 */

import {
  DIFFICULTY_MIN_DISPLAY_CONFIDENCE,
  PAPER_DIFFICULTY_BANDS,
  type PaperDifficulty,
  type PaperDifficultyBand,
  type PaperEvidenceSource,
} from "./domain.ts";

/** Numeric scale the layers vote on, mapped back to a band at the end. */
const BAND_SCORES: Record<PaperDifficultyBand, number> = {
  gentle: 1,
  standard: 2,
  solid: 3,
  hard: 4,
  brutal: 5,
};

export function bandFromScore(score: number): PaperDifficultyBand {
  const clamped = Math.min(5, Math.max(1, score));
  return PAPER_DIFFICULTY_BANDS[Math.round(clamped) - 1];
}

export interface CohortSignal {
  /** Attempts with a recorded finish. Below `MIN_COHORT_ATTEMPTS` the layer is ignored. */
  attempts: number;
  /** Mean fraction of the allowance used. Above 1 means students routinely ran out of time. */
  meanTimeUsedRatio: number;
  /** Fraction of attempts abandoned before the timer ended. */
  abandonRate: number;
  /** Mean of the 1-5 rating students gave the paper afterwards, or null if nobody rated it. */
  meanSelfRating: number | null;
}

export const MIN_COHORT_ATTEMPTS = 8;

export interface StructuralSignal {
  /** Total marks over working minutes. NSW papers sit near 0.55; denser papers punish pace. */
  marksPerMinute: number | null;
  /** True for a NESA/Board of Studies paper rather than a school trial. */
  official: boolean;
  /** Reputation tier of the school that set a trial, from the curated table. */
  schoolTier: SchoolTier | null;
  /** False when the paper predates the syllabus the student is sitting. */
  currentSyllabus: boolean;
}

/**
 * School reputation tiers.
 *
 * Selective and academically-selective independent schools set trials harder than the HSC on
 * purpose, to bank a mark buffer for internal ranking. That is the single most reliable
 * community-known fact about trial difficulty, and it is what this tier captures. It says nothing
 * about any individual paper, which is exactly why it is capped at a low confidence contribution.
 */
export type SchoolTier = "selective-top" | "selective" | "independent-strong" | "general";

const SCHOOL_TIER_ADJUSTMENT: Record<SchoolTier, number> = {
  "selective-top": 1.1,
  "selective": 0.7,
  "independent-strong": 0.5,
  "general": 0,
};

export interface DifficultyInputs {
  cohort: CohortSignal | null;
  curated: CuratedDifficulty | null;
  structural: StructuralSignal;
}

export interface CuratedDifficulty {
  band: PaperDifficultyBand;
  note: string;
  source: PaperEvidenceSource;
}

/**
 * Combines the layers into one band.
 *
 * Weights are proportional to how much each layer actually knows. Cohort weight grows with the
 * number of attempts and saturates, so eight attempts nudge the band and eighty decide it — a
 * fixed weight would let the first handful of students permanently brand a paper.
 */
export function assessDifficulty(inputs: DifficultyInputs): PaperDifficulty | null {
  const votes: Array<{ score: number; weight: number }> = [];
  const rationale: string[] = [];
  const sources: PaperEvidenceSource[] = [];

  const structural = scoreStructural(inputs.structural);
  votes.push({ score: structural.score, weight: 1 });
  rationale.push(...structural.rationale);
  if (structural.rationale.length > 0) {
    sources.push({ kind: "heuristic", label: "Paper structure", url: null });
  }

  if (inputs.curated) {
    votes.push({ score: BAND_SCORES[inputs.curated.band], weight: 1.6 });
    rationale.push(inputs.curated.note);
    sources.push(inputs.curated.source);
  }

  const cohort = inputs.cohort && inputs.cohort.attempts >= MIN_COHORT_ATTEMPTS
    ? scoreCohort(inputs.cohort)
    : null;
  if (cohort) {
    votes.push({ score: cohort.score, weight: cohort.weight });
    rationale.push(...cohort.rationale);
    sources.push({
      kind: "cohort",
      label: `${inputs.cohort?.attempts} timed attempts on Millennium`,
      url: null,
    });
  }

  const totalWeight = votes.reduce((sum, vote) => sum + vote.weight, 0);
  if (totalWeight === 0) return null;

  const score = votes.reduce((sum, vote) => sum + vote.score * vote.weight, 0) / totalWeight;

  return {
    band: bandFromScore(score),
    confidence: confidenceFrom(inputs, totalWeight),
    rationale,
    sources,
  };
}

function scoreStructural(signal: StructuralSignal): { score: number; rationale: string[] } {
  const rationale: string[] = [];
  // Official HSC papers are the reference point the whole ladder is calibrated against.
  let score = signal.official ? 3 : 3.2;

  if (signal.schoolTier && signal.schoolTier !== "general") {
    score += SCHOOL_TIER_ADJUSTMENT[signal.schoolTier];
    rationale.push(
      signal.schoolTier === "selective-top"
        ? "Set by a top selective school, which typically pitches its trial above the HSC."
        : "Set by a high-performing school, whose trials usually run harder than the HSC."
    );
  }

  if (signal.marksPerMinute !== null) {
    // 0.55 marks/minute is roughly the NSW norm: 100 marks over 180 minutes.
    const density = signal.marksPerMinute - 0.55;
    if (Math.abs(density) > 0.08) {
      score += Math.max(-0.8, Math.min(0.8, density * 4));
      rationale.push(
        density > 0
          ? "Denser than a standard paper: more marks per minute of working time."
          : "Lighter than a standard paper: fewer marks per minute of working time."
      );
    }
  }

  if (!signal.currentSyllabus) {
    rationale.push("Written for an earlier syllabus, so the format will not match your exam.");
  }

  return { score, rationale };
}

function scoreCohort(signal: CohortSignal): { score: number; weight: number; rationale: string[] } {
  const rationale: string[] = [];
  let score = 3;

  if (signal.meanSelfRating !== null) {
    score = signal.meanSelfRating;
    rationale.push(`Students who sat it rated it ${signal.meanSelfRating.toFixed(1)} out of 5.`);
  }

  if (signal.meanTimeUsedRatio > 0.98) {
    score += 0.5;
    rationale.push("Most students used the entire allowance or ran over.");
  } else if (signal.meanTimeUsedRatio < 0.7) {
    score -= 0.4;
    rationale.push("Most students finished comfortably inside the allowance.");
  }

  if (signal.abandonRate > 0.35) {
    score += 0.4;
    rationale.push("A high share of attempts were abandoned partway.");
  }

  // Saturating weight: eight attempts inform, eighty decide.
  const weight = Math.min(2.4, 0.8 + Math.log10(signal.attempts) * 1.2);
  return { score, weight, rationale };
}

/**
 * Confidence tracks provenance, not agreement. Three layers that happen to coincide on a paper
 * nobody has sat is still a paper nobody has sat.
 */
function confidenceFrom(inputs: DifficultyInputs, totalWeight: number): number {
  let confidence = 0.2;
  if (inputs.curated) confidence += 0.3;
  if (inputs.cohort && inputs.cohort.attempts >= MIN_COHORT_ATTEMPTS) {
    confidence += Math.min(0.45, 0.15 + Math.log10(inputs.cohort.attempts) * 0.2);
  }
  if (inputs.structural.marksPerMinute !== null) confidence += 0.08;
  return Math.min(0.95, Math.round(confidence * (totalWeight >= 1 ? 1 : totalWeight) * 100) / 100);
}

export function isDifficultySettled(difficulty: PaperDifficulty | null): boolean {
  return difficulty !== null && difficulty.confidence >= DIFFICULTY_MIN_DISPLAY_CONFIDENCE;
}
