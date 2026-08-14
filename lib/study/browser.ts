import { z } from "zod";

import type { StudyCardState, StudyNoteType } from "./domain";

export const STUDY_BROWSER_PAGE_SIZE = 50;
export const STUDY_BULK_LIMIT = 500;

const identifierSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });

export type StudyBrowserSort = "due" | "created" | "lapses" | "difficulty" | "stability";

export interface StudyBrowserItem {
  cardId: string;
  noteId: string;
  deckId: string;
  deckTitle: string;
  templateKey: string;
  noteType: StudyNoteType;
  fields: Record<string, unknown>;
  tags: string[];
  noteRevision: number;
  state: StudyCardState;
  dueAt: string;
  stability: number;
  difficulty: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
  scheduleRevision: number;
  createdAt: string;
}

export interface StudyBrowserPage {
  items: StudyBrowserItem[];
  total: number;
}

/**
 * Every filter is a typed value compiled into a parameterized query. There is no place for a raw
 * SQL fragment to enter, by construction rather than by escaping.
 */
export const studyBrowserQuerySchema = z.object({
  text: z.string().trim().max(200).optional(),
  deckIds: z.array(identifierSchema).max(60).default([]),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  noteTypes: z.array(z.enum([
    "basic",
    "basic-reversed",
    "typed",
    "cloze",
    "sequence",
    "compare-contrast",
    "application",
    "image-occlusion",
  ])).max(8).default([]),
  states: z.array(z.enum([
    "new",
    "learning",
    "review",
    "relearning",
    "suspended",
    "buried",
  ])).max(6).default([]),
  dueBefore: isoDateTimeSchema.optional(),
  dueAfter: isoDateTimeSchema.optional(),
  minimumLapses: z.coerce.number().int().min(0).max(1_000).optional(),
  sort: z.enum(["due", "created", "lapses", "difficulty", "stability"]).default("due"),
  limit: z.coerce.number().int().min(1).max(200).default(STUDY_BROWSER_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
}).strict();

export type StudyBrowserQuery = z.infer<typeof studyBrowserQuerySchema>;

export const studyBulkCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["suspend", "unsuspend", "bury", "unbury", "delete"]),
    cardIds: z.array(identifierSchema).min(1).max(STUDY_BULK_LIMIT),
  }).strict(),
  z.object({
    action: z.literal("reschedule"),
    cardIds: z.array(identifierSchema).min(1).max(STUDY_BULK_LIMIT),
    dueAt: isoDateTimeSchema,
  }).strict(),
  z.object({
    action: z.literal("move"),
    cardIds: z.array(identifierSchema).min(1).max(STUDY_BULK_LIMIT),
    deckId: identifierSchema,
  }).strict(),
  z.object({
    action: z.enum(["add-tag", "remove-tag"]),
    cardIds: z.array(identifierSchema).min(1).max(STUDY_BULK_LIMIT),
    tag: z.string().trim().min(1).max(80),
  }).strict(),
]);

export type StudyBulkCommand = z.infer<typeof studyBulkCommandSchema>;

/** One bulk action without its selection, so callers supply the ids once. Distributes over the union. */
export type StudyBulkAction = StudyBulkCommand extends infer Command
  ? Command extends { cardIds: string[] } ? Omit<Command, "cardIds"> : never
  : never;

export interface StudyBulkResult {
  affected: number;
}

const studyBrowserItemSchema = z.object({
  cardId: identifierSchema,
  noteId: identifierSchema,
  deckId: identifierSchema,
  deckTitle: z.string().max(120),
  templateKey: z.string().max(120),
  noteType: z.string().max(40),
  fields: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  noteRevision: z.number().int().min(1),
  state: z.enum(["new", "learning", "review", "relearning", "suspended", "buried"]),
  dueAt: isoDateTimeSchema,
  stability: z.number().finite(),
  difficulty: z.number().finite(),
  repetitions: z.number().int().min(0),
  lapses: z.number().int().min(0),
  lastReviewedAt: isoDateTimeSchema.nullable(),
  scheduleRevision: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
}).passthrough();

export const studyBrowserPageSchema = z.object({
  items: z.array(studyBrowserItemSchema),
  total: z.number().int().min(0),
}).passthrough();

export function parseStudyBrowserPage(value: unknown): StudyBrowserPage {
  return studyBrowserPageSchema.parse(value) as unknown as StudyBrowserPage;
}

/** Reads browser filters from a URL. Repeated parameters express multi-select filters. */
export function readStudyBrowserQuery(url: URL): unknown {
  const number = url.searchParams.get("minimumLapses");
  return {
    text: url.searchParams.get("text") ?? undefined,
    deckIds: url.searchParams.getAll("deckId"),
    tags: url.searchParams.getAll("tag"),
    noteTypes: url.searchParams.getAll("noteType"),
    states: url.searchParams.getAll("state"),
    dueBefore: url.searchParams.get("dueBefore") ?? undefined,
    dueAfter: url.searchParams.get("dueAfter") ?? undefined,
    minimumLapses: number === null ? undefined : number,
    sort: url.searchParams.get("sort") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  };
}

export function studyBrowserQueryToSearchParams(query: Partial<StudyBrowserQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.text) params.set("text", query.text);
  for (const deckId of query.deckIds ?? []) params.append("deckId", deckId);
  for (const tag of query.tags ?? []) params.append("tag", tag);
  for (const noteType of query.noteTypes ?? []) params.append("noteType", noteType);
  for (const state of query.states ?? []) params.append("state", state);
  if (query.dueBefore) params.set("dueBefore", query.dueBefore);
  if (query.dueAfter) params.set("dueAfter", query.dueAfter);
  if (query.minimumLapses !== undefined) params.set("minimumLapses", String(query.minimumLapses));
  if (query.sort) params.set("sort", query.sort);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  return params;
}
