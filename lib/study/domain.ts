export const STUDY_SCHEMA_VERSION = 1 as const;
export const STUDY_DEFAULT_DESIRED_RETENTION = 0.9;
export const STUDY_MAXIMUM_INTERVAL_DAYS = 36_500;

export type StudyExperienceMode = "beginner" | "intermediate" | "expert";
export type StudyReviewRating = "again" | "hard" | "good" | "easy";
export type StudyCardState = "new" | "learning" | "review" | "relearning" | "suspended" | "buried";
export type StudyNoteType =
  | "basic"
  | "basic-reversed"
  | "typed"
  | "cloze"
  | "sequence"
  | "compare-contrast"
  | "application"
  | "image-occlusion";

export interface StudyDeckSummary {
  id: string;
  title: string;
  description: string;
  pinned: boolean;
  revision: number;
  cardCount: number;
  dueCount: number;
  newCount: number;
  updatedAt: string;
}

export interface StudyDeck extends StudyDeckSummary {
  userId: string;
  parentDeckId: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface StudyBasicFields {
  prompt: string;
  answer: string;
  explanation?: string;
}

export interface StudyNote {
  id: string;
  userId: string;
  deckId: string;
  noteType: StudyNoteType;
  schemaVersion: number;
  fields: Record<string, unknown>;
  tags: string[];
  sourceKind: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StudySchedulingState {
  state: Exclude<StudyCardState, "suspended" | "buried">;
  dueAt: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
}

export interface StudyCard extends StudySchedulingState {
  id: string;
  userId: string;
  deckId: string;
  noteId: string;
  templateKey: string;
  ordinal: number;
  isSuspended: boolean;
  isBuried: boolean;
  schedulerName: string;
  schedulerVersion: string;
  parametersVersion: string;
  schedulerMetadata: Record<string, unknown>;
  scheduleRevision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StudySchedulerParameters {
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string[];
  relearningSteps: string[];
  weights: number[];
}

export interface StudyReviewLogSnapshot {
  rating: StudyReviewRating;
  state: StudySchedulingState["state"];
  dueAt: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reviewedAt: string;
}

export interface StudyReviewTransition {
  rating: StudyReviewRating;
  before: StudySchedulingState;
  after: StudySchedulingState;
  log: StudyReviewLogSnapshot;
  nextIntervalSeconds: number;
  retrievabilityBefore: number | null;
}

export type StudyReviewPreview = Record<StudyReviewRating, StudyReviewTransition>;

export interface StudyReviewCommand {
  cardId: string;
  clientOperationId: string;
  expectedScheduleRevision: number;
  rating: StudyReviewRating;
  reviewedAt: string;
  durationMs?: number;
  deviceId?: string;
  sessionId?: string;
}

export interface StudyReviewResult {
  operationId: string;
  status: "accepted" | "duplicate";
  card: StudyCard;
  eventId: string;
  preview: StudyReviewPreview;
}

export interface StudyCardSummary {
  id: string;
  templateKey: string;
  ordinal: number;
  state: StudyCardState;
  dueAt: string;
  isSuspended: boolean;
  isBuried: boolean;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
  scheduleRevision: number;
}

export interface StudyNoteWithCards {
  id: string;
  deckId: string;
  noteType: StudyNoteType;
  schemaVersion: number;
  fields: Record<string, unknown>;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  cards: StudyCardSummary[];
}

export interface StudyDeckContentsPage {
  notes: StudyNoteWithCards[];
  nextCursor: string | null;
}

export interface StudyQueueItem extends StudySchedulingState {
  cardId: string;
  noteId: string;
  deckId: string;
  deckTitle: string;
  templateKey: string;
  scheduleRevision: number;
  noteRevision: number;
  noteType: StudyNoteType;
  fields: Record<string, unknown>;
  tags: string[];
}

export interface StudyDeckCommand {
  deckId: string;
  title: string;
  description: string;
  pinned?: boolean;
  expectedRevision?: number;
}

export interface StudyNoteCommand {
  noteId: string;
  deckId: string;
  noteType: StudyNoteType;
  fields: Record<string, unknown>;
  tags: string[];
  expectedRevision?: number;
}

export interface StudyUndoCommand {
  targetEventId: string;
  clientOperationId: string;
  deviceId?: string;
}

export interface StudyUndoResult {
  status: "accepted" | "duplicate";
  operationId: string;
  eventId: string;
  targetEventId: string;
  card: StudyCard;
}

export interface StudyUndoableReview {
  eventId: string;
  cardId: string;
  rating: StudyReviewRating;
  reviewedAt: string;
}

export interface StudyPreferences {
  experienceMode: StudyExperienceMode;
  desiredRetention: number;
  dailyTimeBudgetMinutes: number;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  dayBoundaryHour: number;
  timeZone: string;
  defaultMixingStrategy: "adaptive" | "blocked" | "mixed";
  showStreaks: boolean;
  revision: number;
}

export interface StudyBootstrap {
  schemaVersion: typeof STUDY_SCHEMA_VERSION;
  decks: StudyDeckSummary[];
  preferences: StudyPreferences;
  dueCount: number;
  activeSessionId: string | null;
  syncCursor: number;
  capabilities: {
    normalizedStorage: boolean;
    fsrs: boolean;
    offlineSync: boolean;
    richNotes: boolean;
    aiWorkshop: boolean;
    /**
     * Whether this deployment allows an account to move itself onto normalized
     * storage. Read from server configuration, so the legacy UI can offer the
     * upgrade instead of leaving the account with no way to reach it.
     */
    cutoverAvailable: boolean;
  };
}
