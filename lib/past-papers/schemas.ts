import { z } from "zod";

import { MAX_TIMER_MINUTES, MIN_TIMER_MINUTES } from "./timer.ts";

/**
 * Command schemas for every mutating past papers route.
 *
 * `.strict()` throughout: an unexpected key is a client bug or an attempt to reach a field the
 * route does not mean to expose, and silently dropping it hides both. The one exception is
 * preferences, which is explicitly forwards-compatible.
 */

const uuid = z.string().uuid();

/** URL parameters carry `true`/`1`, not booleans. */
const booleanish = z.union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

/** `a,b,c` into a de-duplicated array, with empties dropped rather than kept as blanks. */
function commaList(maxItemLength: number) {
  return z.string().transform((value) => [
    ...new Set(
      value.split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item.length <= maxItemLength)
    ),
  ]).pipe(z.array(z.string()).max(60));
}

export const paperSaveCommandSchema = z.object({
  paperId: uuid,
  folderId: uuid.nullable().optional(),
  starred: z.boolean().optional(),
  note: z.string().trim().max(2_000).optional(),
  /**
   * Fetch the document now rather than only recording the save.
   *
   * Defaults to true because a save is the point at which a student has asked for the file, and
   * that is the only point at which we are willing to spend a source's bandwidth. A save with this
   * false is a bookmark.
   */
  download: z.boolean().default(true),
}).strict();

export const paperUnsaveCommandSchema = z.object({ paperId: uuid }).strict();

export const folderCommandSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(80),
  parentId: uuid.nullable().default(null),
  color: z.string().trim().max(32).default(""),
  position: z.number().int().min(0).max(10_000).default(0),
}).strict();

export const folderDeleteCommandSchema = z.object({
  id: uuid,
  /** Saves in a deleted folder move to the root rather than disappearing with it. */
  deleteContents: z.boolean().default(false),
}).strict();

export const ladderCommandSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).default(""),
  subjectSlug: z.string().trim().max(80).default(""),
  /**
   * The whole ordered run, replaced wholesale.
   *
   * A ladder is defined by its order, so a partial update expressed as per-step edits would need
   * the client to resolve reordering against a server that may have changed underneath it. Sending
   * the sequence makes the last writer win on something the student can see all of.
   */
  steps: z.array(z.object({
    paperId: uuid,
    targetMinutes: z.number().int().min(1).max(600).nullable().default(null),
    note: z.string().trim().max(500).default(""),
    completed: z.boolean().default(false),
  })).max(200).default([]),
}).strict();

export const ladderDeleteCommandSchema = z.object({ id: uuid }).strict();

export const attemptStartCommandSchema = z.object({
  paperId: uuid,
  durationSeconds: z.number().int()
    .min(MIN_TIMER_MINUTES * 60)
    .max(MAX_TIMER_MINUTES * 60),
}).strict();

export const attemptFinishCommandSchema = z.object({
  attemptId: uuid,
  elapsedSeconds: z.number().int().min(0).max(86_400),
  completed: z.boolean().default(false),
  selfRating: z.number().int().min(1).max(5).nullable().default(null),
  scoreAwarded: z.number().int().min(0).max(500).nullable().default(null),
  scoreTotal: z.number().int().min(1).max(500).nullable().default(null),
  note: z.string().trim().max(2_000).default(""),
}).strict().refine(
  (value) => value.scoreAwarded === null || (value.scoreTotal !== null && value.scoreAwarded <= value.scoreTotal),
  { message: "A mark cannot exceed the paper's total", path: ["scoreAwarded"] },
);

const annotationPointSchema = z.object({
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(2),
}).strict();

export const annotationSchema = z.object({
  id: z.string().min(1).max(64),
  documentId: z.string().min(1).max(64),
  page: z.number().int().min(1).max(2_000),
  kind: z.enum(["draw", "line", "arrow", "highlight", "text"]),
  // A freehand stroke is sampled, so the ceiling is generous; it exists to stop one pathological
  // stroke from filling the row's size budget on its own.
  points: z.array(annotationPointSchema).min(1).max(4_000),
  text: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  strokeWidth: z.number().min(1).max(12),
}).strict();

export const annotationsCommandSchema = z.object({
  paperId: uuid,
  annotations: z.array(annotationSchema).max(2_000),
}).strict();

export const publishCommandSchema = z.object({
  kind: z.enum(["folder", "ladder"]),
  folderId: uuid.nullable().default(null),
  ladderId: uuid.nullable().default(null),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
}).strict().refine(
  (value) => (value.kind === "folder" ? value.folderId !== null : value.ladderId !== null),
  { message: "A publication must name the folder or ladder it shares" },
);

export const redeemCommandSchema = z.object({
  shareCode: z.string().trim().min(8).max(64),
  /** Where the redeemed papers land. Null creates a folder named after the publication. */
  folderId: uuid.nullable().default(null),
}).strict();

export const revokeCommandSchema = z.object({ publicationId: uuid }).strict();

/**
 * Browse query.
 *
 * Arrives as URL parameters, so every list is a comma-separated string and every number is text.
 * Coercion lives here rather than in the route so the parsing rules are in one place and testable.
 */
export const browseQuerySchema = z.object({
  yearLevel: z.enum(["yr9", "yr10", "yr11", "yr12"]).optional(),
  subjects: commaList(80).optional(),
  categories: commaList(20).optional(),
  schools: commaList(120).optional(),
  difficulty: commaList(20).optional(),
  tags: commaList(60).optional(),
  yearFrom: z.coerce.number().int().min(1950).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1950).max(2100).optional(),
  era: z.string().trim().max(60).optional(),
  sort: z.enum(["relevance", "year-desc", "year-asc", "difficulty-asc", "difficulty-desc", "popular", "school"])
    .default("relevance"),
  search: z.string().trim().max(200).optional(),
  requireSolutions: booleanish.optional(),
  savedOnly: booleanish.optional(),
  /** Restricts the listing to one saved folder. Null and absent both mean "everything". */
  folderId: uuid.optional(),
  /** Only papers whose document has actually been fetched for this account. */
  downloadedOnly: booleanish.optional(),
  /**
   * Offset paging.
   *
   * A cursor would be better for a feed, but this listing is re-ordered by seven different sorts
   * and one of them is computed per student, so there is no column a cursor could be taken from.
   * The ceiling is well past what anyone scrolls to and keeps a crafted offset off the database.
   */
  offset: z.coerce.number().int().min(0).max(5_000).default(0),
  limit: z.coerce.number().int().min(1).max(400).default(60),
}).strip();

export type BrowseQuery = z.infer<typeof browseQuerySchema>;
