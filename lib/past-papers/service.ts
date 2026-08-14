import { supabaseAdmin } from "../supabase";
import { assessDifficulty, type SchoolTier } from "./difficulty.ts";
import {
  documentStoragePath,
  extractCoverText,
  fetchPaperDocument,
  fetchableResource,
  isCorpusResource,
  readCorpusDocument,
  PAST_PAPER_STORAGE_BUCKET,
} from "./documents.ts";
import { detectPaperTiming, detectTotalMarks } from "./enrichment.ts";
import { eraForYear, type PastPaper } from "./domain.ts";
import { PastPapersError } from "./http";
import {
  filterPapers,
  resolveYearRange,
  sortPapers,
  type PaperFilters,
  type RelevanceContext,
} from "./query.ts";
import { pickForYou, type RecommendationContext, type Recommendation } from "./recommendations.ts";
import * as repository from "./repository.ts";
import * as library from "./repository-library.ts";
import type { BrowseQuery } from "./schemas.ts";
import { SYLLABUS_ERAS } from "./taxonomy.ts";

/**
 * Orchestration for past papers.
 *
 * The service owns the sequencing that the routes should not: narrow in SQL, rank in memory,
 * download only when a student asks, and enrich a paper from its own text the first time anyone
 * opens it. Routes below this stay thin — parse, guard, call, respond.
 */

export interface BrowseResult {
  papers: PastPaper[];
  recommendations: Recommendation[];
  savedPaperIds: string[];
  facets: Awaited<ReturnType<typeof repository.loadFacets>>;
  eras: typeof SYLLABUS_ERAS;
  /** Where this page started, echoed back so a client cannot append a stale page twice. */
  offset: number;
  /** Whether another page exists. Drives the browser's infinite scroll. */
  hasMore: boolean;
}

export interface StudentContext {
  yearLevel: string | null;
  enrolledSubjectSlugs: readonly string[];
  standings: RecommendationContext["standings"];
}

/**
 * How many rows relevance ranks before paging.
 *
 * Relevance is the one ordering SQL cannot produce — the score depends on this student's enrolment
 * and attempt history — so it is computed over a candidate window instead. The window is newest
 * first, which is already close to the answer, and it is a hard ceiling rather than a page size:
 * a student who scrolls past it has left the region where personalised ordering means anything.
 */
const RELEVANCE_CANDIDATES = 1_200;

export async function browse(
  userId: string,
  query: BrowseQuery,
  student: StudentContext,
): Promise<BrowseResult> {
  const [saves, attempts, facets] = await Promise.all([
    repository.listSaves(userId),
    library.listAttempts(userId, 500),
    repository.loadFacets(query.yearLevel),
  ]);

  const savedPaperIds = new Set(saves.map((save) => save.paperId));
  const attemptedPaperIds = new Set(attempts.map((attempt) => attempt.paperId));
  const currentYear = new Date().getFullYear();

  // An era and a year range describe the same constraint, so it is resolved to a range before the
  // query is built. Leaving era to the in-memory pass meant SQL paged over rows the filter then
  // removed, which puts holes in every page after the first.
  const range = resolveYearRange(
    { yearFrom: query.yearFrom ?? null, yearTo: query.yearTo ?? null, syllabusEraId: query.era ?? null },
    SYLLABUS_ERAS,
  );

  const sqlQuery: BrowseQuery = {
    ...query,
    yearFrom: range.from ?? undefined,
    yearTo: range.to ?? undefined,
  };

  const filters: PaperFilters = {
    yearLevel: query.yearLevel,
    subjectSlugs: query.subjects,
    categories: query.categories as PaperFilters["categories"],
    schools: query.schools,
    yearFrom: range.from,
    yearTo: range.to,
    difficultyBands: query.difficulty as PaperFilters["difficultyBands"],
    tagIds: query.tags,
    requireSolutions: query.requireSolutions,
    savedOnly: query.savedOnly,
    // Search is deliberately absent. Postgres matches a stemmed, weighted `search_vector`; the
    // in-memory version is a substring test. Running both drops rows the database correctly
    // matched — "histories" against "history" — and, on a paged listing, that reads as gaps.
  };

  const relevance: RelevanceContext = {
    enrolledSubjectSlugs: new Set(student.enrolledSubjectSlugs),
    yearLevel: student.yearLevel,
    attemptedPaperIds,
    savedPaperIds,
    currentYear,
    eras: SYLLABUS_ERAS,
  };

  const paperIds = restrictedPaperIds(query, saves);
  const difficultyRanks = difficultyRanksFor(query.difficulty);

  // An empty restriction is "no saved papers here", not "no restriction" — a starred view with
  // nothing starred must return nothing rather than the whole catalogue.
  if (paperIds !== null && paperIds.length === 0) {
    return { papers: [], recommendations: [], savedPaperIds: [...savedPaperIds], facets, eras: SYLLABUS_ERAS, offset: query.offset, hasMore: false };
  }

  /**
   * Tag filtering is the one narrowing still done in memory — tags are jsonb objects rather than a
   * column — so a tagged query falls back to ranking a candidate window, exactly like relevance.
   * Every other query lets SQL both order and page, which is what makes the sorts honest.
   */
  const inMemory = query.sort === "relevance" || (query.tags?.length ?? 0) > 0;

  if (inMemory) {
    const candidates = await repository.findPapers(sqlQuery, {
      limit: RELEVANCE_CANDIDATES,
      offset: 0,
      paperIds,
      difficultyRanks,
    });

    const ordered = sortPapers(
      filterPapers(candidates, filters, SYLLABUS_ERAS, savedPaperIds),
      query.sort,
      relevance,
    );

    return {
      papers: ordered.slice(query.offset, query.offset + query.limit),
      recommendations: recommendationsFor(candidates, student, attemptedPaperIds, savedPaperIds, currentYear),
      savedPaperIds: [...savedPaperIds],
      facets,
      eras: SYLLABUS_ERAS,
      offset: query.offset,
      hasMore: ordered.length > query.offset + query.limit,
    };
  }

  // One row past the page, so "is there more" is answered without a second count query.
  const page = await repository.findPapers(sqlQuery, {
    limit: query.limit + 1,
    offset: query.offset,
    paperIds,
    difficultyRanks,
  });

  const hasMore = page.length > query.limit;

  return {
    // No second pass: SQL applied every narrowing this query asked for, and re-filtering a page it
    // already sized could only remove rows and leave the listing with holes in it.
    papers: page.slice(0, query.limit),
    // Recommendations answer "what should I sit next", so they deliberately ignore the student's
    // current filter — and they only belong on the first page of a listing.
    recommendations: query.offset > 0
      ? []
      : recommendationsFor(page, student, attemptedPaperIds, savedPaperIds, currentYear),
    savedPaperIds: [...savedPaperIds],
    facets,
    eras: SYLLABUS_ERAS,
    offset: query.offset,
    hasMore,
  };
}

function recommendationsFor(
  papers: readonly PastPaper[],
  student: StudentContext,
  attemptedPaperIds: ReadonlySet<string>,
  savedPaperIds: ReadonlySet<string>,
  currentYear: number,
): Recommendation[] {
  return pickForYou(papers, {
    yearLevel: student.yearLevel,
    enrolledSubjectSlugs: student.enrolledSubjectSlugs,
    standings: student.standings,
    attemptedPaperIds,
    savedPaperIds,
    currentYear,
    eras: SYLLABUS_ERAS,
  });
}

/**
 * The id set a saved, folder or downloaded view is narrowed to, or null for the whole catalogue.
 *
 * Folder membership and cache state live on the student's own save rows rather than on the
 * catalogue, so they are resolved to ids here and handed to SQL. Doing it the other way — fetching
 * a page and dropping rows that are not in the folder — produces a folder view that shows three
 * papers on a page of sixty.
 */
function restrictedPaperIds(query: BrowseQuery, saves: readonly repository.PaperSave[]): string[] | null {
  if (!query.savedOnly && !query.folderId && !query.downloadedOnly) return null;

  return saves
    .filter((save) => (query.folderId ? save.folderId === query.folderId : true))
    // `storagePath` is only set once the document has actually been fetched, which is what makes
    // it the honest answer to "have I downloaded this" rather than "have I starred it".
    .filter((save) => (query.downloadedOnly ? save.storagePath !== null : true))
    .map((save) => save.paperId);
}

/** Selected bands as the ranks the generated column stores. */
function difficultyRanksFor(bands: readonly string[] | undefined): number[] {
  const order: Record<string, number> = { gentle: 0, standard: 1, solid: 2, hard: 3, brutal: 4 };
  return (bands ?? []).flatMap((band) => (band in order ? [order[band]] : []));
}

/**
 * Saves a paper, and fetches it if we are allowed to.
 *
 * The save is recorded first and the download attempted second, deliberately: a student who
 * starred a paper has starred it whether or not a distant server was reachable, and a failed fetch
 * is recorded on the row rather than thrown away, so the UI can offer a retry or a link out.
 */
export async function savePaper(
  userId: string,
  input: { paperId: string; folderId?: string | null; starred?: boolean; note?: string; download: boolean },
): Promise<{ save: library.PaperAttempt | repository.PaperSave; downloaded: boolean; referralUrl: string | null }> {
  const paper = await repository.findPaper(input.paperId);
  const existing = (await repository.listSaves(userId)).find((save) => save.paperId === input.paperId);

  const save = await repository.upsertSave(userId, input);
  if (!existing) await repository.adjustPaperCounter(input.paperId, "save_count", 1);

  const resource = fetchableResource(paper);
  if (!input.download || !resource) {
    return {
      save,
      downloaded: false,
      // Nothing fetchable means the publisher delivers it themselves; the student is sent there.
      referralUrl: resource ? null : paper.resources[0]?.url ?? paper.sourceUrl,
    };
  }

  try {
    // A corpus paper is already on this machine; only a URL resource is an outbound request.
    const document = isCorpusResource(resource)
      ? await readCorpusDocument(resource.url)
      : await fetchPaperDocument(resource.url);
    const path = documentStoragePath(userId, input.paperId);
    await storeDocument(path, document.bytes);
    await repository.recordCachedDocument(userId, input.paperId, { storagePath: path, bytes: document.bytes.length });
    await enrichFromDocument(paper, document.bytes);
    return { save: { ...save, storagePath: path }, downloaded: true, referralUrl: null };
  } catch (error) {
    const message = error instanceof PastPapersError ? error.message : "Could not download that paper.";
    await repository.recordCachedDocument(userId, input.paperId, { error: message });
    return { save, downloaded: false, referralUrl: paper.sourceUrl };
  }
}

export async function unsavePaper(userId: string, paperId: string): Promise<void> {
  const existing = (await repository.listSaves(userId)).find((save) => save.paperId === paperId);
  await repository.deleteSave(userId, paperId);
  if (existing) {
    await repository.adjustPaperCounter(paperId, "save_count", -1);
    await removeDocument(documentStoragePath(userId, paperId));
  }
}

/**
 * Reads the paper's own cover page and upgrades the catalogue row.
 *
 * Runs once, the first time anybody downloads a given paper: the document is the best authority on
 * its own working time, and until someone fetches it the row can only carry the official course
 * allowance. A failure here is silent because the timing fallback is already correct enough to sit
 * the paper with.
 */
async function enrichFromDocument(paper: PastPaper, bytes: Uint8Array): Promise<void> {
  // Keyed on provenance, not on whether the fields are populated. Both now arrive pre-filled from
  // the listing — the course's official allowance and total — so testing for null would mean the
  // cover page was never read and the assumption stood forever.
  if (paper.durationSource === "document" && paper.marksSource === "document") return;

  try {
    const text = await extractCoverText(bytes);
    const timing = detectPaperTiming(text, paper.subjectSlug);
    const marks = detectTotalMarks(text);

    if (timing.source !== "document" && marks === null) return;
    if (!supabaseAdmin) return;

    await supabaseAdmin.from("past_papers").update({
      ...(timing.source === "document"
        ? {
          duration_minutes: timing.workingMinutes,
          reading_minutes: timing.readingMinutes,
          duration_source: "document",
        }
        : {}),
      ...(marks !== null ? { total_marks: marks, marks_source: "document" } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", paper.id);
  } catch {
    // The course allowance already in the row is a usable fallback; a parse failure is not worth
    // failing the student's save over.
  }
}

/**
 * Recomputes a paper's difficulty from whatever evidence now exists.
 *
 * Called after an attempt finishes, which is the only moment the cohort signal changes.
 */
export async function refreshDifficulty(paperId: string): Promise<void> {
  const paper = await repository.findPaper(paperId);
  const cohort = await library.loadCohortSignal(paperId);

  const era = paper.year !== null ? eraForYear(SYLLABUS_ERAS, paper.year, paper.subjectSlug) : null;
  const difficulty = assessDifficulty({
    cohort,
    curated: null,
    structural: {
      marksPerMinute: paper.totalMarks !== null && paper.durationMinutes
        ? paper.totalMarks / paper.durationMinutes
        : null,
      official: paper.category === "hsc",
      schoolTier: schoolTierFor(paper.school),
      currentSyllabus: era?.endYear === null,
    },
  });

  if (!difficulty || !supabaseAdmin) return;
  await supabaseAdmin.from("past_papers").update({ difficulty }).eq("id", paperId);
}

/**
 * Reputation tier for a school that sets trials.
 *
 * Only the top selective schools are named, and only because their trials being pitched above the
 * HSC is the single most consistently reported fact about NSW trial difficulty. It is a weak
 * signal about any individual paper, weighted accordingly in `difficulty.ts`, and it says nothing
 * about a school's students.
 */
const SELECTIVE_TOP = ["james ruse", "north sydney boys", "sydney grammar", "baulkham hills", "girraween", "hornsby girls", "sydney boys", "sydney girls", "normanhurst boys", "north sydney girls"];

function schoolTierFor(school: string | null): SchoolTier | null {
  if (!school) return null;
  const name = school.toLowerCase();
  if (SELECTIVE_TOP.some((entry) => name.includes(entry))) return "selective-top";
  return "general";
}

// --- Storage -------------------------------------------------------------------------------

async function storeDocument(path: string, bytes: Uint8Array): Promise<void> {
  if (!supabaseAdmin) {
    throw new PastPapersError("PAST_PAPERS_UNAVAILABLE", "Past papers storage is not configured.", 503);
  }

  const { error } = await supabaseAdmin.storage
    .from(PAST_PAPER_STORAGE_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });

  if (error) throw new PastPapersError("PAST_PAPER_STORE_FAILED", "Could not store that paper.", 500);
}

async function removeDocument(path: string): Promise<void> {
  if (!supabaseAdmin) return;
  // A failed cleanup leaves an orphaned object, which retention handles; it must not fail the
  // student's unsave.
  await supabaseAdmin.storage.from(PAST_PAPER_STORAGE_BUCKET).remove([path]).catch(() => undefined);
}

export async function readDocument(userId: string, paperId: string): Promise<Blob> {
  if (!supabaseAdmin) {
    throw new PastPapersError("PAST_PAPERS_UNAVAILABLE", "Past papers storage is not configured.", 503);
  }

  // The owner-scoped path is itself the authorisation check: a student can only name their own.
  const { data, error } = await supabaseAdmin.storage
    .from(PAST_PAPER_STORAGE_BUCKET)
    .download(documentStoragePath(userId, paperId));

  if (error || !data) {
    throw new PastPapersError("PAST_PAPER_NOT_CACHED", "Save this paper to read it here.", 404);
  }
  return data;
}
