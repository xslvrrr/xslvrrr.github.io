import { supabaseAdmin } from "../supabase";
import type {
  PaperDifficulty,
  PaperDocumentKind,
  PaperResource,
  PaperTag,
  PastPaper,
  PaperCategory,
  PaperYearLevel,
} from "./domain.ts";
import { PastPapersError } from "./http";
import type { IndexedPaper } from "./indexer.ts";
import { parsePastPaperPreferences, type PastPaperPreferences } from "./preferences.ts";
import type { BrowseQuery } from "./schemas.ts";

/**
 * Supabase access for past papers.
 *
 * Everything goes through the service-role client behind an authenticated route, matching the rest
 * of the schema. Two rules hold throughout:
 *
 * - Every user-scoped read and write carries `user_id` in its filter, never only a row id. The
 *   composite foreign keys in the migration make cross-account re-parenting impossible, and these
 *   filters make cross-account *reading* impossible even if a route is called with someone else's
 *   row id.
 * - The catalogue is read-only from any request path. Only `upsertIndexedPapers`, called by the
 *   indexer, writes it.
 */

function db() {
  if (!supabaseAdmin) {
    throw new PastPapersError("PAST_PAPERS_UNAVAILABLE", "Past papers storage is not configured.", 503);
  }
  return supabaseAdmin;
}

// --- Catalogue -----------------------------------------------------------------------------

interface PaperRow {
  id: string;
  source_slug: string;
  external_key: string;
  year_level: string;
  category: string;
  subject: string;
  subject_slug: string;
  school: string | null;
  year: number | null;
  title: string;
  document_kind: string;
  bundled_solutions: boolean;
  has_solutions: boolean;
  resources: unknown;
  source_url: string;
  syllabus_era_id: string | null;
  duration_minutes: number | null;
  reading_minutes: number | null;
  duration_source: string;
  total_marks: number | null;
  marks_source: string | null;
  difficulty: unknown;
  tags: unknown;
  save_count: number;
  attempt_count: number;
  indexed_at: string;
}

export function mapPaperRow(row: PaperRow): PastPaper {
  return {
    id: row.id,
    sourceSlug: row.source_slug,
    externalKey: row.external_key,
    yearLevel: row.year_level as PaperYearLevel,
    category: row.category as PaperCategory,
    subject: row.subject,
    subjectSlug: row.subject_slug,
    school: row.school,
    year: row.year,
    title: row.title,
    documentKind: row.document_kind as PaperDocumentKind,
    resources: Array.isArray(row.resources) ? (row.resources as PaperResource[]) : [],
    hasSolutions: row.has_solutions || row.bundled_solutions,
    syllabusEraId: row.syllabus_era_id,
    durationMinutes: row.duration_minutes,
    readingMinutes: row.reading_minutes,
    durationSource: (row.duration_source as PastPaper["durationSource"]) ?? "unknown",
    totalMarks: row.total_marks,
    marksSource: (row.marks_source as PastPaper["marksSource"]) ?? "unknown",
    difficulty: (row.difficulty as PaperDifficulty | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as PaperTag[]) : [],
    sourceUrl: row.source_url,
    indexedAt: row.indexed_at,
    saveCount: row.save_count,
    attemptCount: row.attempt_count,
  };
}

const PAPER_COLUMNS = "id, source_slug, external_key, year_level, category, subject, subject_slug, school, year, title, document_kind, bundled_solutions, has_solutions, resources, source_url, syllabus_era_id, duration_minutes, reading_minutes, duration_source, total_marks, marks_source, difficulty, tags, save_count, attempt_count, indexed_at";

/**
 * Narrows the catalogue in SQL before the pure ranking code sees it.
 *
 * The split is deliberate: anything that removes rows happens here, where an index can serve it;
 * anything that decides *order* happens in `query.ts`, where it can be reasoned about and tested.
 * The one exception is text search, which uses the generated `search_vector` because reproducing
 * weighted full-text ranking in TypeScript would be slower and worse.
 */
export interface PaperQueryOptions {
  limit: number;
  offset?: number;
  /**
   * Restricts the result to a set of ids.
   *
   * How the saved, folder and downloaded views are expressed: folder membership lives on the
   * student's save rows, not on the catalogue, so the service resolves it to ids first and the
   * narrowing still happens in SQL rather than over a fetched page.
   */
  paperIds?: readonly string[] | null;
  /** Difficulty bands to keep. Unrated papers are excluded, as they are in `filterPapers`. */
  difficultyRanks?: readonly number[];
}

export async function findPapers(query: BrowseQuery, options: PaperQueryOptions): Promise<PastPaper[]> {
  const offset = options.offset ?? 0;

  let statement = db().from("past_papers").select(PAPER_COLUMNS);

  if (query.yearLevel) statement = statement.eq("year_level", query.yearLevel);
  if (query.subjects?.length) statement = statement.in("subject_slug", query.subjects);
  if (query.categories?.length) statement = statement.in("category", query.categories);
  if (query.schools?.length) statement = statement.in("school", query.schools);
  if (query.yearFrom !== undefined) statement = statement.gte("year", query.yearFrom);
  if (query.yearTo !== undefined) statement = statement.lte("year", query.yearTo);
  if (query.requireSolutions) statement = statement.eq("has_solutions", true);
  if (options.paperIds) statement = statement.in("id", [...options.paperIds]);
  if (options.difficultyRanks?.length) {
    // Paired with the not-null check because the generated column ranks an unrated paper as the
    // middle band so it *sorts* sensibly; it must never let one *match* a band filter.
    statement = statement
      .in("difficulty_rank", [...options.difficultyRanks])
      .not("difficulty", "is", null);
  }
  if (query.search) {
    // `websearch_to_tsquery` handles a student typing quotes or a stray `-` without erroring,
    // which `to_tsquery` does not.
    statement = statement.textSearch("search_vector", query.search, { type: "websearch" });
  }

  // Ordering and paging both happen here, over the whole catalogue.
  //
  // This matters more than it looks. Ordering every query by year descending and re-sorting the
  // returned slice in memory meant "oldest first", "hardest first" and "school A-Z" could only
  // rearrange the newest few hundred papers — they appeared to do almost nothing, because the rows
  // they should have surfaced were never fetched. The one ordering SQL genuinely cannot express is
  // relevance, which depends on this student's enrolment and attempt history; the service handles
  // that one by ranking a candidate set itself.
  const { data, error } = await applyOrdering(statement, query.sort)
    .range(offset, offset + options.limit - 1);

  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load papers.", 500);
  return (data ?? []).map((row) => mapPaperRow(row as PaperRow));
}

/**
 * The SQL-side ordering for each sort.
 *
 * `id` is always the final tiebreak so paging is stable: without it Postgres may return equal rows
 * in a different order between two identical queries, and a paper can appear twice or not at all
 * as the reader scrolls.
 */
function applyOrdering<T>(statement: T, sort: BrowseQuery["sort"]): T {
  type Orderable = {
    order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => Orderable;
  };
  const query = statement as Orderable;
  const newestFirst = (target: Orderable) => target.order("year", { ascending: false, nullsFirst: false });

  switch (sort) {
    case "year-asc":
      return query.order("year", { ascending: true, nullsFirst: false }).order("id") as T;
    case "popular":
      return query
        .order("save_count", { ascending: false })
        .order("attempt_count", { ascending: false })
        .order("id") as T;
    case "school":
      return newestFirst(query.order("school", { ascending: true, nullsFirst: false })).order("id") as T;
    case "difficulty-asc":
      return newestFirst(query.order("difficulty_rank", { ascending: true })).order("id") as T;
    case "difficulty-desc":
      return newestFirst(query.order("difficulty_rank", { ascending: false })).order("id") as T;
    case "relevance":
    case "year-desc":
    default:
      // Newest-first is also the candidate set relevance refines: a recent paper outranks an old
      // one under the relevance score too, so the window is already close to the answer.
      return newestFirst(query).order("id") as T;
  }
}

export async function findPapersByIds(ids: readonly string[]): Promise<PastPaper[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db()
    .from("past_papers")
    .select(PAPER_COLUMNS)
    .in("id", [...ids]);

  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load papers.", 500);
  return (data ?? []).map((row) => mapPaperRow(row as PaperRow));
}

export async function findPaper(paperId: string): Promise<PastPaper> {
  const [paper] = await findPapersByIds([paperId]);
  if (!paper) throw new PastPapersError("PAST_PAPER_NOT_FOUND", "That paper is not in the index.", 404);
  return paper;
}

export interface PaperFacets {
  subjects: Array<{ slug: string; label: string; count: number }>;
  schools: string[];
  years: number[];
}

/**
 * The facet lists the browser's filter row is built from.
 *
 * Read from the catalogue rather than from the current result set so the filters do not
 * disappear as a student narrows — a school filter that vanishes once you select a subject is
 * worse than one that shows a few options with no results.
 *
 * Aggregated in the database, not here. Folding the rows in TypeScript meant selecting them all,
 * and PostgREST caps a select at 1,000 rows without saying so: the filter row showed 7 of 106
 * subjects and 59 of 574 schools, each with a count off by an order of magnitude, and looked
 * entirely plausible doing it. `.limit()` cannot raise a server-side ceiling.
 */
export async function loadFacets(yearLevel?: string): Promise<PaperFacets> {
  const { data, error } = await db().rpc("past_paper_facets", { p_year_level: yearLevel ?? null });
  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load filters.", 500);

  return normaliseFacets(data);
}

/**
 * Reads the aggregate into the shape the browser expects.
 *
 * Every field is checked rather than trusted: a function that returns an unexpected shape should
 * cost the filter row, not the whole listing behind it.
 */
export function normaliseFacets(payload: unknown): PaperFacets {
  const record = (payload ?? {}) as Record<string, unknown>;

  const subjects = Array.isArray(record.subjects)
    ? record.subjects.flatMap((entry): PaperFacets["subjects"] => {
      const row = entry as { slug?: unknown; label?: unknown; count?: unknown };
      if (typeof row.slug !== "string" || !row.slug) return [];
      return [{
        slug: row.slug,
        label: typeof row.label === "string" && row.label ? row.label : row.slug,
        count: typeof row.count === "number" ? row.count : Number(row.count) || 0,
      }];
    })
    : [];

  const schools = Array.isArray(record.schools)
    ? record.schools.filter((school): school is string => typeof school === "string" && school !== "")
    : [];

  const years = Array.isArray(record.years)
    ? record.years.map(Number).filter((year) => Number.isFinite(year))
    : [];

  return { subjects, schools, years };
}

/**
 * Writes an index run.
 *
 * Chunked and upserted on the source's own key, so a re-run converges rather than duplicating and
 * a partial run leaves valid rows behind. Counters and difficulty are deliberately excluded from
 * the update: they are computed from student behaviour and must survive a re-index.
 *
 * Timing and marks are excluded conditionally, for the same reason. A listing can only ever offer
 * the course's official allowance; once anybody has downloaded a paper, its own cover page has
 * been read and the row holds the better number. Letting a nightly re-index write the assumption
 * back over the measurement would silently regress every enriched paper.
 */
export async function upsertIndexedPapers(papers: readonly IndexedPaper[]): Promise<number> {
  const CHUNK = 500;
  let written = 0;

  // Deduplicated on the conflict target before anything is sent. Two manifest entries can describe
  // the same paper found at two URLs, and Postgres refuses an `on conflict do update` that would
  // affect one row twice in a single statement — so an un-deduplicated batch fails outright rather
  // than merging. Last occurrence wins, which matches the re-index semantics everywhere else.
  const unique = new Map<string, IndexedPaper>();
  for (const paper of papers) unique.set(`${paper.sourceSlug}::${paper.externalKey}`, paper);
  const deduplicated = [...unique.values()];

  for (let start = 0; start < deduplicated.length; start += CHUNK) {
    const batch = deduplicated.slice(start, start + CHUNK);
    const measured = await loadMeasuredFields(batch);

    const chunk = batch.map((paper) => ({
      source_slug: paper.sourceSlug,
      external_key: paper.externalKey,
      year_level: paper.yearLevel,
      category: paper.category,
      subject: paper.subject,
      subject_slug: paper.subjectSlug,
      school: paper.school,
      year: paper.year,
      title: paper.title,
      document_kind: paper.documentKind,
      bundled_solutions: paper.bundledSolutions,
      has_solutions: paper.hasSolutions,
      resources: paper.resources,
      source_url: paper.sourceUrl,
      syllabus_era_id: paper.syllabusEraId,
      duration_minutes: paper.durationMinutes,
      reading_minutes: paper.readingMinutes,
      duration_source: paper.durationSource,
      total_marks: paper.totalMarks,
      marks_source: paper.marksSource,
      // Last, so anything already read off the document itself wins over this run's assumptions.
      ...(measured.get(paper.externalKey) ?? {}),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await db()
      .from("past_papers")
      .upsert(chunk, { onConflict: "source_slug,external_key" });

    if (error) {
      // The underlying message names the offending column or constraint, which is the difference
      // between a five-minute fix and an afternoon of guessing during an index run.
      throw new PastPapersError(
        "PAST_PAPERS_INDEX_FAILED",
        `Could not write the index: ${error.message}`,
        500,
      );
    }
    written += chunk.length;
  }

  return written;
}

/**
 * Fields already read off the papers themselves, keyed by external key.
 *
 * Only rows whose source is `document` are returned, so the merge above is a no-op for every paper
 * nobody has downloaded yet — which is most of the catalogue on a first run.
 */
async function loadMeasuredFields(
  batch: readonly IndexedPaper[],
): Promise<Map<string, Record<string, unknown>>> {
  const measured = new Map<string, Record<string, unknown>>();
  if (batch.length === 0) return measured;

  const { data, error } = await db()
    .from("past_papers")
    .select("external_key, duration_minutes, reading_minutes, duration_source, total_marks, marks_source")
    .eq("source_slug", batch[0].sourceSlug)
    .in("external_key", batch.map((paper) => paper.externalKey));

  // A failed read here means the index run writes its own values, which is the previous behaviour
  // and still leaves a usable catalogue. It must not abort the run.
  if (error || !data) return measured;

  for (const row of data as Array<Record<string, unknown>>) {
    const patch: Record<string, unknown> = {};
    if (row.duration_source === "document") {
      patch.duration_minutes = row.duration_minutes;
      patch.reading_minutes = row.reading_minutes;
      patch.duration_source = "document";
    }
    if (row.marks_source === "document") {
      patch.total_marks = row.total_marks;
      patch.marks_source = "document";
    }
    if (Object.keys(patch).length > 0) measured.set(String(row.external_key), patch);
  }

  return measured;
}

/**
 * Removes rows a completed run did not produce.
 *
 * Without this, a change to how a paper is keyed — a new listing file in the key, a subject that
 * split into its real courses — leaves the old row in place, and the browser shows the same paper
 * twice with two different labels. Only rows the run actually covered are eligible: a run
 * restricted to one year level must not delete another's, so `yearLevels` scopes the sweep to
 * exactly what was walked.
 *
 * Deleting by key rather than by "not in this list" keeps the statement bounded, and a paper a
 * student has saved is deleted the same as any other — the save's own row carries the document.
 */
export async function pruneIndexedPapers(
  sourceSlug: string,
  keptExternalKeys: ReadonlySet<string>,
  options: { yearLevels?: readonly string[] } = {},
): Promise<number> {
  // Paged explicitly. PostgREST caps an unbounded select at 1,000 rows and says nothing about it,
  // so the first version of this saw a thousand of the catalogue's rows, judged the rest absent
  // from its own reckoning, and left 8,000 stale rows standing next to their replacements.
  const PAGE = 1_000;
  const existing: string[] = [];

  for (let offset = 0; ; offset += PAGE) {
    let statement = db()
      .from("past_papers")
      .select("external_key")
      .eq("source_slug", sourceSlug)
      // A stable order, without which two pages can overlap and a row can be missed entirely.
      .order("external_key", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (options.yearLevels && options.yearLevels.length > 0) {
      statement = statement.in("year_level", [...options.yearLevels]);
    }

    const { data, error } = await statement;
    if (error) {
      throw new PastPapersError("PAST_PAPERS_READ_FAILED", `Could not read existing rows: ${error.message}`, 500);
    }

    const page = data ?? [];
    existing.push(...page.map((row) => String((row as Record<string, unknown>).external_key)));
    if (page.length < PAGE) break;
  }

  const stale = existing.filter((key) => !keptExternalKeys.has(key));
  if (stale.length === 0) return 0;

  const CHUNK = 200;
  for (let start = 0; start < stale.length; start += CHUNK) {
    const { error: deleteError } = await db()
      .from("past_papers")
      .delete()
      .eq("source_slug", sourceSlug)
      .in("external_key", stale.slice(start, start + CHUNK));

    if (deleteError) {
      throw new PastPapersError(
        "PAST_PAPERS_INDEX_FAILED",
        `Could not remove stale rows: ${deleteError.message}`,
        500,
      );
    }
  }

  return stale.length;
}

export async function isSourceEnabled(slug: string): Promise<boolean> {
  const { data, error } = await db()
    .from("past_paper_sources")
    .select("enabled")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not read source state.", 500);
  return data?.enabled === true;
}

export async function recordIndexRun(slug: string, error: string | null): Promise<void> {
  await db()
    .from("past_paper_sources")
    .update({ last_indexed_at: new Date().toISOString(), last_index_error: error, updated_at: new Date().toISOString() })
    .eq("slug", slug);
}

// --- Saves ---------------------------------------------------------------------------------

export interface PaperSave {
  id: string;
  paperId: string;
  folderId: string | null;
  starred: boolean;
  /** Null until the document has actually been fetched. */
  storagePath: string | null;
  cachedAt: string | null;
  cacheError: string | null;
  note: string;
  updatedAt: string;
}

interface SaveRow {
  id: string;
  paper_id: string;
  folder_id: string | null;
  starred: boolean;
  storage_path: string | null;
  cached_at: string | null;
  cache_error: string | null;
  note: string;
  updated_at: string;
}

function mapSaveRow(row: SaveRow): PaperSave {
  return {
    id: row.id,
    paperId: row.paper_id,
    folderId: row.folder_id,
    starred: row.starred,
    storagePath: row.storage_path,
    cachedAt: row.cached_at,
    cacheError: row.cache_error,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

/** Ceiling on one student's library. Reached by paging, because a select is capped at 1,000. */
const SAVES_CEILING = 2_000;

export async function listSaves(userId: string): Promise<PaperSave[]> {
  // Asking for 2,000 in one statement returns 1,000: PostgREST's cap wins over `.limit()`, so the
  // stated ceiling was never the real one. Every card asks "is this saved?" against this list, so
  // a truncated read does not just hide saves — it offers to save papers already in the library.
  const PAGE = 1_000;
  const rows: SaveRow[] = [];

  for (let offset = 0; offset < SAVES_CEILING; offset += PAGE) {
    const { data, error } = await db()
      .from("past_paper_saves")
      .select("id, paper_id, folder_id, starred, storage_path, cached_at, cache_error, note, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, Math.min(offset + PAGE, SAVES_CEILING) - 1);

    if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load saved papers.", 500);

    const page = (data ?? []) as SaveRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  return rows.map(mapSaveRow);
}

export async function upsertSave(
  userId: string,
  input: { paperId: string; folderId?: string | null; starred?: boolean; note?: string },
): Promise<PaperSave> {
  const { data, error } = await db()
    .from("past_paper_saves")
    .upsert({
      user_id: userId,
      paper_id: input.paperId,
      ...(input.folderId !== undefined ? { folder_id: input.folderId } : {}),
      ...(input.starred !== undefined ? { starred: input.starred } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,paper_id" })
    .select("id, paper_id, folder_id, starred, storage_path, cached_at, cache_error, note, updated_at")
    .single();

  if (error || !data) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not save that paper.", 500);
  return mapSaveRow(data as SaveRow);
}

export async function deleteSave(userId: string, paperId: string): Promise<void> {
  const { error } = await db()
    .from("past_paper_saves")
    .delete()
    .eq("user_id", userId)
    .eq("paper_id", paperId);

  if (error) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not remove that paper.", 500);
}

export async function recordCachedDocument(
  userId: string,
  paperId: string,
  result: { storagePath: string; bytes: number } | { error: string },
): Promise<void> {
  const patch = "error" in result
    ? { cache_error: result.error.slice(0, 500), cached_at: null, storage_path: null }
    : {
      storage_path: result.storagePath,
      cached_at: new Date().toISOString(),
      cached_bytes: result.bytes,
      cache_error: null,
    };

  await db()
    .from("past_paper_saves")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("paper_id", paperId);
}

/**
 * Keeps the catalogue's save counter roughly in step.
 *
 * "Roughly" is honest and sufficient: the counter feeds a logarithmic popularity term in the
 * ranking, so drift of a few is invisible, and paying for a transaction per star would not buy
 * anything a student could perceive.
 */
export async function adjustPaperCounter(
  paperId: string,
  column: "save_count" | "attempt_count",
  delta: number,
): Promise<void> {
  const { data } = await db().from("past_papers").select(column).eq("id", paperId).maybeSingle();
  const current = Number((data as Record<string, unknown> | null)?.[column] ?? 0);
  await db()
    .from("past_papers")
    .update({ [column]: Math.max(0, current + delta) })
    .eq("id", paperId);
}

// --- Preferences ---------------------------------------------------------------------------

export async function loadPreferences(userId: string): Promise<PastPaperPreferences> {
  const { data, error } = await db()
    .from("past_paper_preferences")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  // Settings are not worth failing the feature over; defaults are always a valid answer.
  if (error) return parsePastPaperPreferences({});
  return parsePastPaperPreferences(data?.settings);
}

export async function savePreferences(userId: string, settings: PastPaperPreferences): Promise<void> {
  const { error } = await db()
    .from("past_paper_preferences")
    .upsert({ user_id: userId, settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not save settings.", 500);
}

// --- Annotations ---------------------------------------------------------------------------

export async function loadAnnotations(userId: string, paperId: string): Promise<unknown[]> {
  const { data, error } = await db()
    .from("past_paper_annotations")
    .select("annotations")
    .eq("user_id", userId)
    .eq("paper_id", paperId)
    .maybeSingle();

  if (error) throw new PastPapersError("PAST_PAPERS_READ_FAILED", "Could not load annotations.", 500);
  return Array.isArray(data?.annotations) ? (data.annotations as unknown[]) : [];
}

export async function saveAnnotations(
  userId: string,
  paperId: string,
  annotations: unknown[],
): Promise<void> {
  const { error } = await db()
    .from("past_paper_annotations")
    .upsert({
      user_id: userId,
      paper_id: paperId,
      annotations,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,paper_id" });

  if (error) throw new PastPapersError("PAST_PAPERS_WRITE_FAILED", "Could not save annotations.", 500);
}
