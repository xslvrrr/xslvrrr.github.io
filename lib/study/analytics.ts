import { z } from "zod";

/**
 * Analytics are derived from review events and current card projections. Every metric carries a
 * plain-language meaning and, where there is one, an action. Nothing here claims a mechanism it
 * cannot show: retention is an estimate from this account's own reviews, not a prediction of what
 * a different schedule would have produced.
 */

/** Cards that keep lapsing need different treatment, not more repetitions of the same card. */
export const STUDY_LEECH_LAPSE_THRESHOLD = 8;

export interface StudyAnalyticsDay {
  date: string;
  reviews: number;
  minutes: number;
}

export interface StudyAnalyticsForecastDay {
  date: string;
  due: number;
}

export interface StudyDeckAnalytics {
  deckId: string;
  title: string;
  cardCount: number;
  dueCount: number;
  lapseCount: number;
  averageDifficulty: number;
}

export interface StudyAnalytics {
  generatedAt: string;
  historyDays: number;
  forecastDays: number;
  history: StudyAnalyticsDay[];
  forecast: StudyAnalyticsForecastDay[];
  ratings: { again: number; hard: number; good: number; easy: number };
  totals: {
    reviewCount: number;
    matureReviewCount: number;
    matureRecalledCount: number;
    studyMinutes: number;
  };
  leechCount: number;
  backlogCount: number;
  oldestOverdueDays: number;
  decks: StudyDeckAnalytics[];
}

export const studyAnalyticsQuerySchema = z.object({
  historyDays: z.coerce.number().int().min(1).max(365).default(90),
  forecastDays: z.coerce.number().int().min(1).max(365).default(30),
}).strict();

const countSchema = z.coerce.number().min(0);

export const studyAnalyticsSchema = z.object({
  generatedAt: z.string(),
  historyDays: z.coerce.number().int(),
  forecastDays: z.coerce.number().int(),
  history: z.array(z.object({
    date: z.string(),
    reviews: countSchema,
    minutes: countSchema,
  }).passthrough()),
  forecast: z.array(z.object({ date: z.string(), due: countSchema }).passthrough()),
  ratings: z.object({
    again: countSchema.default(0),
    hard: countSchema.default(0),
    good: countSchema.default(0),
    easy: countSchema.default(0),
  }).passthrough(),
  totals: z.object({
    reviewCount: countSchema.default(0),
    matureReviewCount: countSchema.default(0),
    matureRecalledCount: countSchema.default(0),
    studyMinutes: countSchema.default(0),
  }).passthrough(),
  leechCount: countSchema,
  backlogCount: countSchema,
  oldestOverdueDays: countSchema,
  decks: z.array(z.object({
    deckId: z.string(),
    title: z.string(),
    cardCount: countSchema,
    dueCount: countSchema,
    lapseCount: countSchema,
    averageDifficulty: countSchema,
  }).passthrough()),
}).passthrough();

export function parseStudyAnalytics(value: unknown): StudyAnalytics {
  return studyAnalyticsSchema.parse(value) as unknown as StudyAnalytics;
}

export interface StudyInsight {
  id: string;
  headline: string;
  /** What the number means, in ordinary words. */
  meaning: string;
  /** What to do about it, or null when no action is warranted. */
  action: string | null;
}

function estimatedRetention(analytics: StudyAnalytics): number | null {
  const { matureReviewCount, matureRecalledCount } = analytics.totals;
  if (matureReviewCount < 20) return null;
  return matureRecalledCount / matureReviewCount;
}

export function studyRetentionEstimate(analytics: StudyAnalytics): number | null {
  return estimatedRetention(analytics);
}

/**
 * Turns the raw numbers into statements a learner can act on. Deliberately conservative: an
 * estimate with too little data reports that, rather than showing a confident-looking figure.
 */
export function buildStudyInsights(analytics: StudyAnalytics): StudyInsight[] {
  const insights: StudyInsight[] = [];
  const retention = estimatedRetention(analytics);
  const upcomingWeek = analytics.forecast.slice(0, 7).reduce((total, day) => total + day.due, 0);
  const recentDays = analytics.history.slice(-7);
  const recentReviews = recentDays.reduce((total, day) => total + day.reviews, 0);

  insights.push({
    id: "retention",
    headline: retention === null
      ? "Not enough reviews yet to estimate recall"
      : `You recall about ${Math.round(retention * 100)}% of cards you have seen before`,
    meaning: retention === null
      ? "Recall is estimated from reviews of cards you had already learned. There are fewer than 20 of those so far."
      : "This counts only reviews of cards you had already learned, so first exposures do not inflate it.",
    action: retention !== null && retention < 0.8
      ? "Recall below about 80% usually means too much new material at once. Try lowering the daily new-card limit."
      : null,
  });

  insights.push({
    id: "workload",
    headline: `${upcomingWeek} card${upcomingWeek === 1 ? "" : "s"} due in the next 7 days`,
    meaning: "This is what your current schedule will ask for if you add no new cards.",
    action: upcomingWeek > recentReviews * 2 && recentReviews > 0
      ? "That is roughly double what you have been doing. Adding fewer new cards now keeps it manageable."
      : null,
  });

  if (analytics.backlogCount > 0) {
    insights.push({
      id: "backlog",
      headline: `${analytics.backlogCount} card${analytics.backlogCount === 1 ? "" : "s"} are waiting`,
      meaning: analytics.oldestOverdueDays > 0
        ? `The oldest has been waiting ${analytics.oldestOverdueDays} day${analytics.oldestOverdueDays === 1 ? "" : "s"}.`
        : "These became due today.",
      action: analytics.backlogCount > 100
        ? "A backlog this size does not need clearing in one sitting. Start with a short oldest-first session."
        : null,
    });
  }

  if (analytics.leechCount > 0) {
    insights.push({
      id: "leeches",
      headline: `${analytics.leechCount} card${analytics.leechCount === 1 ? "" : "s"} keep being forgotten`,
      meaning: `These have lapsed at least ${STUDY_LEECH_LAPSE_THRESHOLD} times.`,
      action: "Repeating them unchanged rarely helps. Rewrite them into smaller, clearer questions, or suspend them for now.",
    });
  }

  const weakest = [...analytics.decks]
    .filter((deck) => deck.cardCount > 0)
    .sort((left, right) => (right.lapseCount / right.cardCount) - (left.lapseCount / left.cardCount))[0];
  if (weakest && weakest.lapseCount > 0) {
    insights.push({
      id: "weakest-deck",
      headline: `${weakest.title} is the set you forget most`,
      meaning: `${weakest.lapseCount} lapse${weakest.lapseCount === 1 ? "" : "s"} across ${weakest.cardCount} card${weakest.cardCount === 1 ? "" : "s"}.`,
      action: "Cards that keep lapsing are often doing too much at once. Splitting them usually helps more than repeating them.",
    });
  }

  return insights;
}

/** Buckets for the heatmap. Colour is never the only signal; each cell also carries its count. */
export function studyHeatmapLevel(reviews: number, busiest: number): 0 | 1 | 2 | 3 | 4 {
  if (reviews <= 0) return 0;
  if (busiest <= 0) return 1;
  const share = reviews / busiest;
  if (share > 0.75) return 4;
  if (share > 0.5) return 3;
  if (share > 0.25) return 2;
  return 1;
}
