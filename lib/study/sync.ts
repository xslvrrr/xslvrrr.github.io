import { z } from "zod";

import type { StudyCard, StudyNoteType, StudyPreferences, StudyReviewCommand, StudyUndoCommand } from "./domain";
import type { StudyErrorCode } from "./errors";
import {
  studyCardSchema,
  studyPreferencesSchema,
  studyReviewCommandSchema,
  studyUndoCommandSchema,
} from "./schemas";

/** One push batch stays small so a flaky connection never blocks a whole outbox. */
export const STUDY_SYNC_PUSH_LIMIT = 50;
export const STUDY_SYNC_PULL_LIMIT = 200;
export const STUDY_SNAPSHOT_ENTITY_LIMIT = 4_000;

const identifierSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });

export type StudySyncEntityKind = "deck" | "note" | "card" | "preference";

export interface StudySyncDeckEntity {
  id: string;
  title: string;
  description: string;
  pinned: boolean;
  sortOrder: number;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudySyncNoteEntity {
  id: string;
  deckId: string;
  noteType: StudyNoteType;
  schemaVersion: number;
  fields: Record<string, unknown>;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type StudySyncEntity =
  | StudySyncDeckEntity
  | StudySyncNoteEntity
  | StudyCard
  | StudyPreferences;

export interface StudySyncChange {
  cursor: number;
  ordinal: number;
  entityKind: StudySyncEntityKind;
  entityId: string;
  operation: "upsert" | "delete";
  revision: number;
  changedAt: string;
  entity: StudySyncEntity | null;
}

export interface StudySyncPullPage {
  status: "ok" | "reset-required";
  upperCursor: number;
  nextCursor: number;
  hasMore: boolean;
  changes: StudySyncChange[];
}

export interface StudySyncSnapshot {
  status: "ok";
  cursor: number;
  decks: StudySyncDeckEntity[];
  notes: StudySyncNoteEntity[];
  cards: StudyCard[];
  preferences: StudyPreferences;
}

export interface StudySyncSnapshotTooLarge {
  status: "too-large";
  cursor: number;
  deckCount: number;
  noteCount: number;
  cardCount: number;
}

export type StudySyncSnapshotResult = StudySyncSnapshot | StudySyncSnapshotTooLarge;

export type StudySyncOperation =
  | { kind: "review"; command: StudyReviewCommand }
  | { kind: "undo"; command: StudyUndoCommand };

export interface StudySyncPushOutcome {
  operationId: string;
  kind: "review" | "undo";
  /**
   * `conflict` and `rejected` are terminal for the operation: the desktop client keeps them for
   * user resolution instead of retrying them forever.
   */
  status: "accepted" | "duplicate" | "conflict" | "rejected" | "retry";
  errorCode?: StudyErrorCode;
  message?: string;
  card?: StudyCard;
}

export interface StudySyncPushResult {
  outcomes: StudySyncPushOutcome[];
  cursor: number;
}

const studySyncDeckEntitySchema = z.object({
  id: identifierSchema,
  title: z.string().min(1).max(120),
  description: z.string().max(500),
  pinned: z.boolean(),
  sortOrder: z.number().int().min(0),
  revision: z.number().int().min(1),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();

const studySyncNoteEntitySchema = z.object({
  id: identifierSchema,
  deckId: identifierSchema,
  noteType: z.enum([
    "basic",
    "basic-reversed",
    "typed",
    "cloze",
    "sequence",
    "compare-contrast",
    "application",
    "image-occlusion",
  ]),
  schemaVersion: z.number().int().min(1),
  fields: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  revision: z.number().int().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();

const studySyncEntitySchema = z.union([
  studySyncDeckEntitySchema,
  studySyncNoteEntitySchema,
  studyCardSchema,
  studyPreferencesSchema,
]);

const studySyncChangeSchema = z.object({
  cursor: z.number().int().min(1),
  ordinal: z.number().int().min(0),
  entityKind: z.enum(["deck", "note", "card", "preference"]),
  entityId: identifierSchema,
  operation: z.enum(["upsert", "delete"]),
  revision: z.number().int().min(0),
  changedAt: isoDateTimeSchema,
  entity: studySyncEntitySchema.nullable(),
}).strict();

export const studySyncPullPageSchema = z.object({
  status: z.enum(["ok", "reset-required"]),
  upperCursor: z.number().int().min(0),
  nextCursor: z.number().int().min(0),
  hasMore: z.boolean(),
  changes: z.array(studySyncChangeSchema),
}).strict();

export const studySyncSnapshotSchema = z.union([
  z.object({
    status: z.literal("ok"),
    cursor: z.number().int().min(0),
    decks: z.array(studySyncDeckEntitySchema),
    notes: z.array(studySyncNoteEntitySchema),
    cards: z.array(studyCardSchema),
    preferences: studyPreferencesSchema,
  }).strict(),
  z.object({
    status: z.literal("too-large"),
    cursor: z.number().int().min(0),
    deckCount: z.number().int().min(0),
    noteCount: z.number().int().min(0),
    cardCount: z.number().int().min(0),
  }).strict(),
]);

export const studySyncOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("review"), command: studyReviewCommandSchema }).strict(),
  z.object({ kind: z.literal("undo"), command: studyUndoCommandSchema }).strict(),
]);

export const studySyncPushCommandSchema = z.object({
  deviceId: identifierSchema,
  operations: z.array(studySyncOperationSchema).min(1).max(STUDY_SYNC_PUSH_LIMIT),
}).strict();

export const studySyncPullQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(STUDY_SYNC_PULL_LIMIT),
}).strict();

export const studySyncPushOutcomeSchema = z.object({
  operationId: identifierSchema,
  kind: z.enum(["review", "undo"]),
  status: z.enum(["accepted", "duplicate", "conflict", "rejected", "retry"]),
  errorCode: z.string().max(80).optional(),
  message: z.string().max(500).optional(),
  card: studyCardSchema.optional(),
}).strict();

export const studySyncPushResultSchema = z.object({
  outcomes: z.array(studySyncPushOutcomeSchema),
  cursor: z.number().int().min(0),
}).strict();

export function parseStudySyncPullPage(value: unknown): StudySyncPullPage {
  return studySyncPullPageSchema.parse(value) as StudySyncPullPage;
}

export function parseStudySyncSnapshot(value: unknown): StudySyncSnapshotResult {
  return studySyncSnapshotSchema.parse(value) as StudySyncSnapshotResult;
}

export function parseStudySyncPushResult(value: unknown): StudySyncPushResult {
  return studySyncPushResultSchema.parse(value) as StudySyncPushResult;
}
