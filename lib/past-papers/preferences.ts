import { z } from "zod";

/**
 * Per-student past papers settings.
 *
 * Stored as one JSON blob rather than columns because these are pure presentation choices with no
 * relational meaning, and because adding a setting should not need a migration. Everything is
 * parsed through the schema on read, so an old blob written by an earlier release still produces a
 * complete, valid object rather than a partially-undefined one the UI has to guard.
 */

export const pastPaperPreferencesSchema = z.object({
  // --- Timer -------------------------------------------------------------------------------
  /** Show the timer toolbar above the annotation tools by default. */
  timerEnabled: z.boolean().default(true),
  /**
   * Digits roll when they change. Off is not only an accessibility preference: some students find
   * a clock that moves every second harder to ignore than one that simply updates.
   */
  rollingDigits: z.boolean().default(true),
  /** 0 silences the chimes entirely. */
  timerVolume: z.number().min(0).max(1).default(0.6),
  /** Chime at 30, 10 and 5 minutes remaining, as an invigilator would call them. */
  timerAlerts: z.boolean().default(true),
  /** Start the timer as soon as a paper opens, rather than waiting for the button. */
  autoStartTimer: z.boolean().default(false),
  /** Run the paper's reading allowance as its own phase before the working clock starts. */
  includeReadingTime: z.boolean().default(false),
  /** Show the progress bar and percentage beside the clock. */
  showTimerProgress: z.boolean().default(true),

  // --- Study profile -----------------------------------------------------------------------
  /**
   * Answered during the short setup the browser opens on.
   *
   * The point of asking is to stop guessing. Year level and enrolment were previously inferred
   * from portal class names, which is a best-effort string match that silently produces a Year 9
   * ranking for a Year 12, and the student had no way to see or correct it. What the student says
   * about themselves outranks anything detected.
   */
  onboardingCompleted: z.boolean().default(false),
  yearLevel: z.enum(["yr9", "yr10", "yr11", "yr12"]).nullable().default(null),
  /** Catalogue subject slugs. Only meaningful for yr11/yr12, where enrolment is a real choice. */
  subjectSlugs: z.array(z.string().trim().min(1).max(80)).max(30).default([]),

  // --- Reading -----------------------------------------------------------------------------
  annotationsEnabled: z.boolean().default(true),
  /** Open papers with the floating toolbars collapsed. Still toggleable inside any paper. */
  hideToolbarByDefault: z.boolean().default(false),
  /** Selecting text is disabled while a timed attempt runs, so a paper cannot be copied out. */
  lockSelectionDuringAttempt: z.boolean().default(true),
  /**
   * Refuse to open a solutions or marking-guidelines document while the timer is running. On by
   * default: the entire value of a timed attempt is that the answers were not available.
   */
  hideAnswersDuringAttempt: z.boolean().default(true),
  defaultZoom: z.number().min(0.35).max(6).default(1.2),

  // --- Browsing ----------------------------------------------------------------------------
  defaultSort: z.enum(["relevance", "year-desc", "year-asc", "difficulty-asc", "difficulty-desc", "popular", "school"])
    .default("relevance"),
  /** Show the picked-for-you row at the top of the browser. */
  showPickedForYou: z.boolean().default(true),
  /** Constrain listings to the student's own year level unless they say otherwise. */
  matchMyYearLevel: z.boolean().default(true),
  /** Show difficulty bands that have not met the confidence threshold, marked as estimates. */
  showEstimatedDifficulty: z.boolean().default(true),
  /** Warn before opening a paper written for a superseded syllabus. */
  warnOffSyllabus: z.boolean().default(true),

  // --- After an attempt --------------------------------------------------------------------
  /** Ask for a difficulty rating when an attempt finishes. This is what trains the cohort signal. */
  promptForRating: z.boolean().default(true),
  /** Offer to generate flashcards from a paper once it has been sat. */
  offerFlashcardsAfterAttempt: z.boolean().default(true),
}).strip();

export type PastPaperPreferences = z.infer<typeof pastPaperPreferencesSchema>;

/**
 * Parses stored settings, falling back to defaults field by field.
 *
 * Never throws. A corrupt or partial blob yields the defaults rather than an error page: settings
 * are not worth failing a whole feature over, and a student who cannot open past papers because
 * one boolean is malformed has no way to fix it.
 */
export function parsePastPaperPreferences(value: unknown): PastPaperPreferences {
  const result = pastPaperPreferencesSchema.safeParse(value ?? {});
  return result.success ? result.data : pastPaperPreferencesSchema.parse({});
}

export const DEFAULT_PAST_PAPER_PREFERENCES: PastPaperPreferences = pastPaperPreferencesSchema.parse({});

/** Partial update from the settings page. Unknown keys are dropped rather than rejected. */
export const pastPaperPreferencesUpdateSchema = pastPaperPreferencesSchema.partial();

/**
 * Applies a partial update without disturbing anything it does not mention.
 *
 * Only the keys the caller actually sent are taken from the parsed result. Every field in the
 * schema carries a default, and a defaulted field stays defaulted through `.partial()` — parsing
 * `{ yearLevel: "yr12" }` returns a complete object with every other field at its default value.
 * Spreading that over the stored settings turned each single-switch save into a reset of all the
 * others, which is why settings appeared not to save: each one only survived until the next was
 * changed.
 */
export function mergePastPaperPreferences(
  current: PastPaperPreferences,
  update: unknown,
): PastPaperPreferences {
  if (update === null || typeof update !== "object") return current;

  const parsed = pastPaperPreferencesUpdateSchema.safeParse(update);
  if (!parsed.success) return current;

  const sent = Object.entries(parsed.data).filter(([key]) =>
    Object.prototype.hasOwnProperty.call(update, key));

  return parsePastPaperPreferences({ ...current, ...Object.fromEntries(sent) });
}
