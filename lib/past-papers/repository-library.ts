import { supabaseAdmin } from "../supabase";
import { PastPapersError } from "./http";
import { createPastPaperShareCode, parseSharedPayload, type PastPaperPublication, type SharedPayload } from "./sharing.ts";

/**
 * The student's own organisation of the catalogue: folders, ladders, attempts and share codes.
 *
 * Split from `repository.ts` so neither file grows past the point where the catalogue rules and
 * the personal-library rules can be read separately. Same two invariants apply: every query is
 * filtered by `user_id`, and nothing here writes the shared catalogue.
 */

function db() {
  if (!supabaseAdmin) {
    throw new PastPapersError("PAST_PAPERS_UNAVAILABLE", "Past papers storage is not configured.", 503);
  }
  return supabaseAdmin;
}

// --- Folders -------------------------------------------------------------------------------

export interface PaperFolder {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  position: number;
}

export async function listFolders(userId: string): Promise<PaperFolder[]> {
  const { data, error } = await db()
    .from("past_paper_folders")
    .select("id, parent_id, name, color, position")
    .eq("user_id", userId)
    .order("position", { ascending: true })
    .order("name", { ascending: true })
    .limit(500);

  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load folders.", 500);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    parentId: (row.parent_id as string | null) ?? null,
    name: row.name as string,
    color: row.color as string,
    position: row.position as number,
  }));
}

export const MAX_FOLDER_DEPTH = 4;

/**
 * Creates or renames a folder.
 *
 * The cycle check runs here rather than in the database. The migration's composite key stops a
 * folder pointing at another account's folder and a check constraint stops it pointing at itself,
 * but neither can see a longer loop — A under B under C under A — and a cycle makes the tree
 * unrenderable and the depth walk non-terminating.
 */
export async function saveFolder(
  userId: string,
  input: { id?: string; name: string; parentId: string | null; color: string; position: number },
): Promise<PaperFolder> {
  if (input.parentId) {
    const folders = await listFolders(userId);
    assertPlaceable(folders, input.id ?? null, input.parentId);
  }

  const row = {
    user_id: userId,
    name: input.name,
    parent_id: input.parentId,
    color: input.color,
    position: input.position,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? db().from("past_paper_folders").update(row).eq("id", input.id).eq("user_id", userId)
    : db().from("past_paper_folders").insert(row);

  const { data, error } = await query.select("id, parent_id, name, color, position").single();
  if (error || !data) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not save that folder.", 500);

  return {
    id: data.id as string,
    parentId: (data.parent_id as string | null) ?? null,
    name: data.name as string,
    color: data.color as string,
    position: data.position as number,
  };
}

function assertPlaceable(folders: readonly PaperFolder[], folderId: string | null, parentId: string): void {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  if (!byId.has(parentId)) {
    throw new PastPapersError("PAST_PAPER_FOLDER_NOT_FOUND", "That folder no longer exists.", 404);
  }

  let depth = 1;
  let cursor: string | null = parentId;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === folderId) {
      throw new PastPapersError("PAST_PAPER_FOLDER_CYCLE", "A folder cannot be moved inside itself.", 400);
    }
    // Guards against a pre-existing cycle in stored data, so a bad row cannot hang the request.
    if (seen.has(cursor)) break;
    seen.add(cursor);

    depth += 1;
    if (depth > MAX_FOLDER_DEPTH) {
      throw new PastPapersError(
        "PAST_PAPER_FOLDER_TOO_DEEP",
        `Folders can be nested ${MAX_FOLDER_DEPTH} levels deep.`,
        400,
      );
    }
    cursor = byId.get(cursor)?.parentId ?? null;
  }
}

/**
 * Deletes a folder.
 *
 * Saves inside it fall back to the root rather than being deleted with it, unless the student
 * explicitly asked otherwise. Losing a folder is an organisation mistake; losing the papers is a
 * data loss, and the two should not share a button by accident.
 */
export async function deleteFolder(userId: string, folderId: string, deleteContents: boolean): Promise<void> {
  if (deleteContents) {
    const { error: saveError } = await db()
      .from("past_paper_saves")
      .delete()
      .eq("user_id", userId)
      .eq("folder_id", folderId);
    if (saveError) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not delete folder contents.", 500);
  }

  const { error } = await db()
    .from("past_paper_folders")
    .delete()
    .eq("id", folderId)
    .eq("user_id", userId);

  if (error) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not delete that folder.", 500);
}

// --- Ladders -------------------------------------------------------------------------------

export interface PaperLadderStep {
  paperId: string;
  position: number;
  targetMinutes: number | null;
  note: string;
  completedAt: string | null;
}

export interface PaperLadder {
  id: string;
  title: string;
  description: string;
  subjectSlug: string;
  steps: PaperLadderStep[];
  updatedAt: string;
}

export async function listLadders(userId: string): Promise<PaperLadder[]> {
  const { data, error } = await db()
    .from("past_paper_ladders")
    .select("id, title, description, subject_slug, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load ladders.", 500);
  const ladders = data ?? [];
  if (ladders.length === 0) return [];

  const { data: stepRows, error: stepError } = await db()
    .from("past_paper_ladder_steps")
    .select("ladder_id, paper_id, position, target_minutes, note, completed_at")
    .eq("user_id", userId)
    .in("ladder_id", ladders.map((ladder) => ladder.id as string))
    .order("position", { ascending: true });

  if (stepError) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load ladder steps.", 500);

  const stepsByLadder = new Map<string, PaperLadderStep[]>();
  for (const row of stepRows ?? []) {
    const list = stepsByLadder.get(row.ladder_id as string) ?? [];
    list.push({
      paperId: row.paper_id as string,
      position: row.position as number,
      targetMinutes: (row.target_minutes as number | null) ?? null,
      note: row.note as string,
      completedAt: (row.completed_at as string | null) ?? null,
    });
    stepsByLadder.set(row.ladder_id as string, list);
  }

  return ladders.map((ladder) => ({
    id: ladder.id as string,
    title: ladder.title as string,
    description: ladder.description as string,
    subjectSlug: ladder.subject_slug as string,
    steps: stepsByLadder.get(ladder.id as string) ?? [],
    updatedAt: ladder.updated_at as string,
  }));
}

/**
 * Saves a ladder and its whole ordered run.
 *
 * Steps are replaced rather than diffed. A ladder's meaning is its order, and reconciling a
 * reorder as a set of per-step position updates against a server that may have changed underneath
 * is how ordered lists end up with two steps at position 3. Replacing the sequence makes the last
 * writer win over something the student can see all of at once.
 */
export async function saveLadder(
  userId: string,
  input: {
    id?: string;
    title: string;
    description: string;
    subjectSlug: string;
    steps: ReadonlyArray<{ paperId: string; targetMinutes: number | null; note: string; completed: boolean }>;
  },
): Promise<PaperLadder> {
  const row = {
    user_id: userId,
    title: input.title,
    description: input.description,
    subject_slug: input.subjectSlug,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? db().from("past_paper_ladders").update(row).eq("id", input.id).eq("user_id", userId)
    : db().from("past_paper_ladders").insert(row);

  const { data, error } = await query.select("id, title, description, subject_slug, updated_at").single();
  if (error || !data) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not save that ladder.", 500);

  const ladderId = data.id as string;
  const { error: clearError } = await db()
    .from("past_paper_ladder_steps")
    .delete()
    .eq("ladder_id", ladderId)
    .eq("user_id", userId);
  if (clearError) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not update ladder steps.", 500);

  if (input.steps.length > 0) {
    const { error: insertError } = await db().from("past_paper_ladder_steps").insert(
      input.steps.map((step, index) => ({
        ladder_id: ladderId,
        user_id: userId,
        paper_id: step.paperId,
        position: index,
        target_minutes: step.targetMinutes,
        note: step.note,
        completed_at: step.completed ? new Date().toISOString() : null,
      })),
    );
    if (insertError) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not save ladder steps.", 500);
  }

  return {
    id: ladderId,
    title: data.title as string,
    description: data.description as string,
    subjectSlug: data.subject_slug as string,
    steps: input.steps.map((step, index) => ({
      paperId: step.paperId,
      position: index,
      targetMinutes: step.targetMinutes,
      note: step.note,
      completedAt: step.completed ? new Date().toISOString() : null,
    })),
    updatedAt: data.updated_at as string,
  };
}

export async function deleteLadder(userId: string, ladderId: string): Promise<void> {
  const { error } = await db()
    .from("past_paper_ladders")
    .delete()
    .eq("id", ladderId)
    .eq("user_id", userId);

  if (error) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not delete that ladder.", 500);
}

// --- Attempts ------------------------------------------------------------------------------

export interface PaperAttempt {
  id: string;
  paperId: string;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number;
  elapsedSeconds: number;
  completed: boolean;
  selfRating: number | null;
  scoreAwarded: number | null;
  scoreTotal: number | null;
  note: string;
}

function mapAttempt(row: Record<string, unknown>): PaperAttempt {
  return {
    id: row.id as string,
    paperId: row.paper_id as string,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
    durationSeconds: row.duration_seconds as number,
    elapsedSeconds: row.elapsed_seconds as number,
    completed: row.completed as boolean,
    selfRating: (row.self_rating as number | null) ?? null,
    scoreAwarded: (row.score_awarded as number | null) ?? null,
    scoreTotal: (row.score_total as number | null) ?? null,
    note: (row.note as string) ?? "",
  };
}

const ATTEMPT_COLUMNS = "id, paper_id, started_at, finished_at, duration_seconds, elapsed_seconds, completed, self_rating, score_awarded, score_total, note";

export async function listAttempts(userId: string, limit = 300): Promise<PaperAttempt[]> {
  const { data, error } = await db()
    .from("past_paper_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load attempts.", 500);
  return (data ?? []).map(mapAttempt);
}

export async function startAttempt(
  userId: string,
  input: { paperId: string; durationSeconds: number },
): Promise<PaperAttempt> {
  const { data, error } = await db()
    .from("past_paper_attempts")
    .insert({
      user_id: userId,
      paper_id: input.paperId,
      duration_seconds: input.durationSeconds,
      started_at: new Date().toISOString(),
    })
    .select(ATTEMPT_COLUMNS)
    .single();

  if (error || !data) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not start that attempt.", 500);
  return mapAttempt(data);
}

export async function finishAttempt(
  userId: string,
  input: {
    attemptId: string;
    elapsedSeconds: number;
    completed: boolean;
    selfRating: number | null;
    scoreAwarded: number | null;
    scoreTotal: number | null;
    note: string;
  },
): Promise<PaperAttempt> {
  const { data, error } = await db()
    .from("past_paper_attempts")
    .update({
      finished_at: new Date().toISOString(),
      elapsed_seconds: input.elapsedSeconds,
      completed: input.completed,
      self_rating: input.selfRating,
      score_awarded: input.scoreAwarded,
      score_total: input.scoreTotal,
      note: input.note,
    })
    .eq("id", input.attemptId)
    .eq("user_id", userId)
    .select(ATTEMPT_COLUMNS)
    .single();

  if (error || !data) throw new PastPapersError("PAST_PAPER_ATTEMPT_NOT_FOUND", "That attempt no longer exists.", 404);
  return mapAttempt(data);
}

/**
 * Cohort statistics for one paper, feeding the difficulty model.
 *
 * Aggregated in the query rather than returned per attempt: nothing downstream needs to know who
 * sat a paper, and pulling individual rows into a shared statistic is how that leaks.
 */
export async function loadCohortSignal(paperId: string): Promise<{
  attempts: number;
  meanTimeUsedRatio: number;
  abandonRate: number;
  meanSelfRating: number | null;
} | null> {
  const { data, error } = await db()
    .from("past_paper_attempts")
    .select("duration_seconds, elapsed_seconds, completed, self_rating")
    .eq("paper_id", paperId)
    .not("finished_at", "is", null)
    .limit(1_000);

  if (error || !data || data.length === 0) return null;

  const ratios = data.map((row) => {
    const duration = Number(row.duration_seconds) || 1;
    return Number(row.elapsed_seconds) / duration;
  });
  const ratings = data
    .map((row) => row.self_rating as number | null)
    .filter((rating): rating is number => rating !== null);

  return {
    attempts: data.length,
    meanTimeUsedRatio: ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length,
    abandonRate: data.filter((row) => row.completed !== true).length / data.length,
    meanSelfRating: ratings.length > 0
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
  };
}

// --- Publications --------------------------------------------------------------------------

export async function listPublications(userId: string): Promise<PastPaperPublication[]> {
  const { data, error } = await db()
    .from("past_paper_publications")
    .select("id, kind, title, description, share_code, payload, current_version, revoked_at, updated_at")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load share codes.", 500);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as "folder" | "ladder",
    title: row.title as string,
    description: row.description as string,
    shareCode: row.share_code as string,
    paperCount: parseSharedPayload(row.payload).papers.length,
    currentVersion: row.current_version as number,
    revokedAt: (row.revoked_at as string | null) ?? null,
    updatedAt: row.updated_at as string,
  }));
}

export async function publish(
  userId: string,
  input: {
    kind: "folder" | "ladder";
    folderId: string | null;
    ladderId: string | null;
    title: string;
    description: string;
    payload: SharedPayload;
  },
): Promise<PastPaperPublication> {
  const { data, error } = await db()
    .from("past_paper_publications")
    .insert({
      owner_id: userId,
      kind: input.kind,
      folder_id: input.folderId,
      ladder_id: input.ladderId,
      title: input.title,
      description: input.description,
      share_code: createPastPaperShareCode(),
      payload: input.payload,
    })
    .select("id, kind, title, description, share_code, current_version, revoked_at, updated_at")
    .single();

  if (error || !data) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not create a share code.", 500);

  return {
    id: data.id as string,
    kind: data.kind as "folder" | "ladder",
    title: data.title as string,
    description: data.description as string,
    shareCode: data.share_code as string,
    paperCount: input.payload.papers.length,
    currentVersion: data.current_version as number,
    revokedAt: null,
    updatedAt: data.updated_at as string,
  };
}

/**
 * Resolves a share code.
 *
 * Looked up by code alone, because a code is the credential — but a revoked publication is treated
 * as absent rather than as revoked, so a withdrawn code cannot be used to confirm that something
 * was once shared.
 */
export async function findPublicationByCode(shareCode: string): Promise<{
  id: string;
  title: string;
  description: string;
  payload: SharedPayload;
} | null> {
  const { data, error } = await db()
    .from("past_paper_publications")
    .select("id, title, description, payload, revoked_at")
    .eq("share_code", shareCode)
    .maybeSingle();

  if (error || !data || data.revoked_at !== null) return null;
  return {
    id: data.id as string,
    title: data.title as string,
    description: data.description as string,
    payload: parseSharedPayload(data.payload),
  };
}

export async function revokePublication(userId: string, publicationId: string): Promise<void> {
  const { error } = await db()
    .from("past_paper_publications")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", publicationId)
    .eq("owner_id", userId);

  if (error) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not revoke that share code.", 500);
}
