import { z } from "zod";

import {
  STUDY_DEFAULT_DESIRED_RETENTION,
  STUDY_MAXIMUM_INTERVAL_DAYS,
  type StudyBootstrap,
  type StudyCard,
  type StudyDeckCommand,
  type StudyDeckContentsPage,
  type StudyDeckSummary,
  type StudyNoteCommand,
  type StudyPreferences,
  type StudyQueueItem,
  type StudyReviewCommand,
  type StudyReviewResult,
  type StudySchedulerParameters,
  type StudyUndoCommand,
  type StudyUndoResult,
  type StudyUndoableReview,
} from "./domain";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const identifierSchema = z.string().uuid();
const stepSchema = z.string().regex(/^\d+(?:\.\d+)?[mhd]$/, "Invalid scheduler step");

export const studyReviewRatingSchema = z.enum(["again", "hard", "good", "easy"]);
export const studyExperienceModeSchema = z.enum(["beginner", "intermediate", "expert"]);

export const studySchedulingStateSchema = z.object({
  state: z.enum(["new", "learning", "review", "relearning"]),
  dueAt: isoDateTimeSchema,
  stability: z.number().finite().min(0).max(STUDY_MAXIMUM_INTERVAL_DAYS),
  difficulty: z.number().finite().min(0).max(10),
  elapsedDays: z.number().finite().min(0).max(STUDY_MAXIMUM_INTERVAL_DAYS),
  scheduledDays: z.number().finite().min(0).max(STUDY_MAXIMUM_INTERVAL_DAYS),
  learningSteps: z.number().int().min(0).max(100),
  repetitions: z.number().int().min(0).max(1_000_000),
  lapses: z.number().int().min(0).max(1_000_000),
  lastReviewedAt: isoDateTimeSchema.nullable(),
}).strict();

export const studySchedulerParametersSchema = z.object({
  desiredRetention: z.number().finite().min(0.7).max(0.99).default(STUDY_DEFAULT_DESIRED_RETENTION),
  maximumIntervalDays: z.number().int().min(1).max(STUDY_MAXIMUM_INTERVAL_DAYS).default(STUDY_MAXIMUM_INTERVAL_DAYS),
  enableFuzz: z.boolean().default(false),
  enableShortTerm: z.boolean().default(true),
  learningSteps: z.array(stepSchema).max(10).default(["1m", "10m"]),
  relearningSteps: z.array(stepSchema).max(10).default(["10m"]),
  weights: z.array(z.number().finite()).min(19).max(30),
}).strict();

export const studyReviewCommandSchema = z.object({
  cardId: identifierSchema,
  clientOperationId: identifierSchema,
  expectedScheduleRevision: z.number().int().min(0),
  rating: studyReviewRatingSchema,
  reviewedAt: isoDateTimeSchema,
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  deviceId: identifierSchema.optional(),
  sessionId: identifierSchema.optional(),
}).strict();

export const studyBasicFieldsSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000),
  answer: z.string().trim().min(1).max(4_000),
  explanation: z.string().trim().max(8_000).optional(),
}).strict();

export const studyDeckCommandSchema = z.object({
  deckId: identifierSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  pinned: z.boolean().optional(),
  expectedRevision: z.number().int().min(1).optional(),
}).strict();

export const studyNoteCommandSchema = z.object({
  noteId: identifierSchema,
  deckId: identifierSchema,
  noteType: z.enum([
    "basic",
    "basic-reversed",
    "typed",
    "cloze",
    "sequence",
    "compare-contrast",
    "application",
  ]).default("basic"),
  // Field shapes are validated per note type once the type is known.
  fields: z.record(z.string(), z.unknown()),
  tags: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  expectedRevision: z.number().int().min(1).optional(),
}).strict();

export const studyUndoCommandSchema = z.object({
  targetEventId: identifierSchema,
  clientOperationId: identifierSchema,
  deviceId: identifierSchema.optional(),
}).strict();

export const studyDeleteCommandSchema = z.object({
  deckId: identifierSchema.optional(),
  noteId: identifierSchema.optional(),
}).strict().refine(
  (value) => Boolean(value.deckId) !== Boolean(value.noteId),
  "Provide exactly one of deckId or noteId.",
);

export const studyDeckContentsQuerySchema = z.object({
  deckId: identifierSchema,
  cursor: z.string().regex(/^[^|]{20,40}\|[0-9a-fA-F-]{36}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const studyQueueQuerySchema = z.object({
  deckId: identifierSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // Query strings carry "false" as text, which z.coerce.boolean would read as true.
  includeNew: z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .default(true),
}).strict();

export const studyPreferencesCommandSchema = z.object({
  experienceMode: studyExperienceModeSchema.optional(),
  desiredRetention: z.number().min(0.7).max(0.99).optional(),
  dailyTimeBudgetMinutes: z.number().int().min(1).max(1_440).optional(),
  dailyNewLimit: z.number().int().min(0).max(1_000).optional(),
  dailyReviewLimit: z.number().int().min(0).max(10_000).optional(),
  dayBoundaryHour: z.number().int().min(0).max(23).optional(),
  timeZone: z.string().trim().min(1).max(120).optional(),
  defaultMixingStrategy: z.enum(["adaptive", "blocked", "mixed"]).optional(),
  showStreaks: z.boolean().optional(),
  expectedRevision: z.number().int().min(1).optional(),
}).strict();

export function parseStudyReviewCommand(value: unknown): StudyReviewCommand {
  return studyReviewCommandSchema.parse(value);
}

const studyReviewTransitionSchema = z.object({
  rating: studyReviewRatingSchema,
  before: studySchedulingStateSchema,
  after: studySchedulingStateSchema,
  log: z.object({
    rating: studyReviewRatingSchema,
    state: z.enum(["new", "learning", "review", "relearning"]),
    dueAt: isoDateTimeSchema,
    stability: z.number().finite(),
    difficulty: z.number().finite(),
    elapsedDays: z.number().finite(),
    scheduledDays: z.number().finite(),
    learningSteps: z.number().int(),
    reviewedAt: isoDateTimeSchema,
  }).strict(),
  nextIntervalSeconds: z.number().int().min(0),
  retrievabilityBefore: z.number().min(0).max(1).nullable(),
}).strict();

export const studyReviewPreviewSchema = z.object({
  again: studyReviewTransitionSchema,
  hard: studyReviewTransitionSchema,
  good: studyReviewTransitionSchema,
  easy: studyReviewTransitionSchema,
}).strict();

export const studyCardSchema = z.object({
  id: identifierSchema,
  userId: identifierSchema,
  deckId: identifierSchema,
  noteId: identifierSchema,
  templateKey: z.string().min(1).max(120),
  ordinal: z.number().int().min(0),
  isSuspended: z.boolean(),
  isBuried: z.boolean(),
  state: z.enum(["new", "learning", "review", "relearning"]),
  dueAt: isoDateTimeSchema,
  stability: z.number().finite().min(0).max(STUDY_MAXIMUM_INTERVAL_DAYS),
  difficulty: z.number().finite().min(0).max(10),
  elapsedDays: z.number().finite().min(0).max(STUDY_MAXIMUM_INTERVAL_DAYS),
  scheduledDays: z.number().finite().min(0).max(STUDY_MAXIMUM_INTERVAL_DAYS),
  learningSteps: z.number().int().min(0).max(100),
  repetitions: z.number().int().min(0).max(1_000_000),
  lapses: z.number().int().min(0).max(1_000_000),
  lastReviewedAt: isoDateTimeSchema.nullable(),
  schedulerName: z.string().min(1).max(80),
  schedulerVersion: z.string().min(1).max(80),
  parametersVersion: z.string().min(1).max(160),
  schedulerMetadata: z.record(z.string(), z.unknown()),
  scheduleRevision: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
}).strict();

export const studyReviewResultSchema = z.object({
  operationId: identifierSchema,
  status: z.enum(["accepted", "duplicate"]),
  card: studyCardSchema,
  eventId: identifierSchema,
  preview: studyReviewPreviewSchema,
}).passthrough();

const studyCardStateSchema = z.enum(["new", "learning", "review", "relearning", "suspended", "buried"]);
const studyNoteTypeSchema = z.enum([
  "basic",
  "basic-reversed",
  "typed",
  "cloze",
  "sequence",
  "compare-contrast",
  "application",
  "image-occlusion",
]);

const studyCardSummarySchema = z.object({
  id: identifierSchema,
  templateKey: z.string().min(1).max(120),
  ordinal: z.number().int().min(0),
  state: studyCardStateSchema,
  dueAt: isoDateTimeSchema,
  isSuspended: z.boolean(),
  isBuried: z.boolean(),
  repetitions: z.number().int().min(0),
  lapses: z.number().int().min(0),
  lastReviewedAt: isoDateTimeSchema.nullable(),
  scheduleRevision: z.number().int().min(0),
}).strict();

const studyNoteWithCardsSchema = z.object({
  id: identifierSchema,
  deckId: identifierSchema,
  noteType: studyNoteTypeSchema,
  schemaVersion: z.number().int().min(1),
  fields: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  revision: z.number().int().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  cards: z.array(studyCardSummarySchema),
}).strict();

export const studyDeckContentsSchema = z.object({
  notes: z.array(studyNoteWithCardsSchema),
  nextCursor: z.string().nullable(),
}).strict();

export const studyQueueItemSchema = studySchedulingStateSchema.extend({
  cardId: identifierSchema,
  noteId: identifierSchema,
  deckId: identifierSchema,
  deckTitle: z.string().min(1).max(120),
  templateKey: z.string().min(1).max(120),
  scheduleRevision: z.number().int().min(0),
  noteRevision: z.number().int().min(1),
  noteType: studyNoteTypeSchema,
  fields: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
}).strict();

export const studyUndoResultSchema = z.object({
  status: z.enum(["accepted", "duplicate"]),
  operationId: identifierSchema,
  eventId: identifierSchema,
  targetEventId: identifierSchema,
  card: studyCardSchema,
}).passthrough();

export const studyUndoableReviewSchema = z.object({
  eventId: identifierSchema,
  cardId: identifierSchema,
  rating: studyReviewRatingSchema,
  reviewedAt: isoDateTimeSchema,
}).passthrough();

export const studyPreferencesSchema = z.object({
  experienceMode: studyExperienceModeSchema,
  desiredRetention: z.coerce.number().min(0.7).max(0.99),
  dailyTimeBudgetMinutes: z.number().int().min(1).max(1_440),
  dailyNewLimit: z.number().int().min(0).max(1_000),
  dailyReviewLimit: z.number().int().min(0).max(10_000),
  dayBoundaryHour: z.number().int().min(0).max(23),
  timeZone: z.string().min(1).max(120),
  defaultMixingStrategy: z.enum(["adaptive", "blocked", "mixed"]),
  showStreaks: z.boolean(),
  revision: z.number().int().min(1),
}).strict();

export const studyDeckSummarySchema = z.object({
  id: identifierSchema,
  title: z.string().min(1).max(120),
  description: z.string().max(500),
  pinned: z.boolean(),
  revision: z.number().int().min(1),
  cardCount: z.number().int().min(0),
  dueCount: z.number().int().min(0),
  newCount: z.number().int().min(0),
  updatedAt: isoDateTimeSchema,
}).strict();

export const studyBootstrapSchema = z.object({
  schemaVersion: z.literal(1),
  decks: z.array(studyDeckSummarySchema),
  preferences: studyPreferencesSchema,
  dueCount: z.number().int().min(0),
  activeSessionId: identifierSchema.nullable(),
  syncCursor: z.number().int().min(0),
  capabilities: z.object({
    normalizedStorage: z.boolean(),
    fsrs: z.boolean(),
    offlineSync: z.boolean(),
    richNotes: z.boolean(),
    aiWorkshop: z.boolean(),
    cutoverAvailable: z.boolean().default(false),
  }).strict(),
}).strict();

export function parseStudySchedulerParameters(value: unknown): StudySchedulerParameters {
  return studySchedulerParametersSchema.parse(value);
}

export function parseStudyCard(value: unknown): StudyCard {
  return studyCardSchema.parse(value);
}

export function parseStudyReviewResult(value: unknown): StudyReviewResult {
  return studyReviewResultSchema.parse(value);
}

export function parseStudyBootstrap(value: unknown): StudyBootstrap {
  return studyBootstrapSchema.parse(value);
}

export function parseStudyDeckSummary(value: unknown): StudyDeckSummary {
  return studyDeckSummarySchema.parse(value);
}

export function parseStudyDeckCommand(value: unknown): StudyDeckCommand {
  return studyDeckCommandSchema.parse(value);
}

export function parseStudyNoteCommand(value: unknown): StudyNoteCommand {
  return studyNoteCommandSchema.parse(value);
}

export function parseStudyUndoCommand(value: unknown): StudyUndoCommand {
  return studyUndoCommandSchema.parse(value);
}

export function parseStudyDeckContents(value: unknown): StudyDeckContentsPage {
  return studyDeckContentsSchema.parse(value);
}

export function parseStudyQueueItems(value: unknown): StudyQueueItem[] {
  return z.array(studyQueueItemSchema).parse(value);
}

export function parseStudyUndoResult(value: unknown): StudyUndoResult {
  return studyUndoResultSchema.parse(value);
}

export function parseStudyUndoableReview(value: unknown): StudyUndoableReview {
  return studyUndoableReviewSchema.parse(value);
}

export function parseStudyPreferences(value: unknown): StudyPreferences {
  return studyPreferencesSchema.parse(value);
}
