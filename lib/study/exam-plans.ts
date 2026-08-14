import { z } from "zod";

/**
 * Exam planning. The plan is arithmetic on the account's own cards and stated time budget: how much
 * is unseen, how many days remain, what that implies per day. It does not predict a grade, and it
 * does not claim that following it guarantees recall.
 */

/** Seconds per card, used only to turn a card count into a rough minutes estimate. */
const SECONDS_PER_NEW_CARD = 30;
const SECONDS_PER_REVIEW = 12;
/** Below this, "cram" is the honest description rather than "plan". */
const SHORT_NOTICE_DAYS = 3;

export interface StudyExamPlan {
  id: string;
  title: string;
  examDate: string;
  deckIds: string[];
  dailyMinutes: number;
  targetRetention: number;
  status: "active" | "completed" | "archived";
  revision: number;
  updatedAt: string;
}

export interface StudyExamCoverage {
  cardCount: number;
  newCount: number;
  dueCount: number;
  weakCount: number;
  averageStability: number;
}

export const studyExamPlanCommandSchema = z.object({
  planId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-14"),
  deckIds: z.array(z.string().uuid()).max(60).default([]),
  dailyMinutes: z.number().int().min(1).max(1_440).default(20),
  targetRetention: z.number().min(0.7).max(0.99).default(0.9),
  expectedRevision: z.number().int().min(1).optional(),
}).strict();

export type StudyExamPlanCommand = z.infer<typeof studyExamPlanCommandSchema>;

export const studyExamPlanSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(120),
  examDate: z.string(),
  deckIds: z.array(z.string()),
  dailyMinutes: z.coerce.number().int(),
  targetRetention: z.coerce.number(),
  status: z.enum(["active", "completed", "archived"]),
  revision: z.coerce.number().int(),
  updatedAt: z.string(),
}).passthrough();

export const studyExamCoverageSchema = z.object({
  cardCount: z.coerce.number().int().min(0),
  newCount: z.coerce.number().int().min(0),
  dueCount: z.coerce.number().int().min(0),
  weakCount: z.coerce.number().int().min(0),
  averageStability: z.coerce.number().min(0),
}).passthrough();

export function parseStudyExamPlan(value: unknown): StudyExamPlan {
  return studyExamPlanSchema.parse(value) as StudyExamPlan;
}

export function parseStudyExamCoverage(value: unknown): StudyExamCoverage {
  return studyExamCoverageSchema.parse(value) as StudyExamCoverage;
}

export interface StudyExamOutlook {
  daysRemaining: number;
  newCardsPerDay: number;
  estimatedMinutesPerDay: number;
  /** True when the stated time budget cannot cover the unseen material before the date. */
  isOverBudget: boolean;
  isShortNotice: boolean;
  headline: string;
  detail: string;
  action: string | null;
}

export function daysUntilExam(examDate: string, now: Date): number {
  const exam = new Date(`${examDate}T00:00:00.000Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((exam.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Turns a plan plus its coverage into plain statements. Every number is presented as an estimate,
 * because the inputs — how long a card takes, how much is already known — are estimates.
 */
export function buildStudyExamOutlook(
  plan: Pick<StudyExamPlan, "examDate" | "dailyMinutes">,
  coverage: StudyExamCoverage,
  now: Date,
): StudyExamOutlook {
  const daysRemaining = daysUntilExam(plan.examDate, now);

  if (daysRemaining < 0) {
    return {
      daysRemaining,
      newCardsPerDay: 0,
      estimatedMinutesPerDay: 0,
      isOverBudget: false,
      isShortNotice: false,
      headline: "This exam date has passed",
      detail: "Mark the plan complete, or change the date if it moved.",
      action: null,
    };
  }

  const studyDays = Math.max(1, daysRemaining);
  const newCardsPerDay = Math.ceil(coverage.newCount / studyDays);
  const dailyReviewLoad = Math.ceil((coverage.cardCount - coverage.newCount) / Math.max(1, studyDays));
  const estimatedSeconds = newCardsPerDay * SECONDS_PER_NEW_CARD + dailyReviewLoad * SECONDS_PER_REVIEW;
  const estimatedMinutesPerDay = Math.ceil(estimatedSeconds / 60);
  const isOverBudget = estimatedMinutesPerDay > plan.dailyMinutes;
  const isShortNotice = daysRemaining <= SHORT_NOTICE_DAYS;

  const headline = coverage.newCount === 0
    ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left, and you have seen every card at least once`
    : `${coverage.newCount} card${coverage.newCount === 1 ? "" : "s"} still unseen, ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`;

  const detail = `About ${newCardsPerDay} new card${newCardsPerDay === 1 ? "" : "s"} and ${dailyReviewLoad} review${dailyReviewLoad === 1 ? "" : "s"} a day, roughly ${estimatedMinutesPerDay} minutes. This is an estimate from your own review times.`;

  const action = isShortNotice && coverage.newCount > 0
    ? "With this little time, covering the weakest cards once beats trying to see everything."
    : isOverBudget
      ? `That is more than your ${plan.dailyMinutes}-minute budget. Either raise the budget, or narrow the plan to the sets that matter most.`
      : coverage.weakCount > 0
        ? `${coverage.weakCount} card${coverage.weakCount === 1 ? "" : "s"} keep being forgotten. Those are worth rewriting rather than repeating.`
        : null;

  return {
    daysRemaining,
    newCardsPerDay,
    estimatedMinutesPerDay,
    isOverBudget,
    isShortNotice,
    headline,
    detail,
    action,
  };
}
