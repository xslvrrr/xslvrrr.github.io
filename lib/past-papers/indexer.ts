/**
 * Builds the catalogue from a source.
 *
 * Server-only, and deliberately slow. Indexing walks another project's repository, so it runs on a
 * cadence measured in days rather than on request, it fetches through an injected `fetchText` so
 * the whole walk can be tested against captured fixtures, and it never downloads a document — the
 * output is rows describing where papers can be found, not the papers.
 *
 * The walk is resumable in the sense that matters: every row carries a stable `externalKey`, so a
 * partial run followed by a complete one converges rather than duplicating. A source that fails
 * halfway leaves the rows it did produce, which is better than an all-or-nothing index that is
 * empty whenever one subject page changes shape.
 */

import {
  eraForYear,
  type PaperCategory,
  type PaperResource,
  type PaperYearLevel,
  PAPER_YEAR_LEVELS,
} from "./domain.ts";
import { marksForSubject, SYLLABUS_ERAS, timingForSubject } from "./taxonomy.ts";
import {
  buildThscCatalogue,
  categoryForListingFile,
  parseThscListing,
  parseThscSubjectFolders,
  parseTotalMarks,
  resolveThscResources,
  thscRawUrl,
  THSC_SOURCE_SLUG,
  type ThscCatalogueEntry,
} from "./sources/thsc.ts";

/** One row ready to be written to `past_papers`. */
export interface IndexedPaper {
  sourceSlug: string;
  externalKey: string;
  yearLevel: PaperYearLevel;
  category: PaperCategory;
  subject: string;
  subjectSlug: string;
  school: string | null;
  year: number | null;
  title: string;
  documentKind: ThscCatalogueEntry["documentKind"];
  bundledSolutions: boolean;
  hasSolutions: boolean;
  resources: PaperResource[];
  sourceUrl: string;
  syllabusEraId: string | null;
  durationMinutes: number | null;
  readingMinutes: number | null;
  durationSource: "document" | "subject-default" | "unknown";
  totalMarks: number | null;
  marksSource: "document" | "title" | "subject-default" | "unknown";
}

export interface IndexRunResult {
  sourceSlug: string;
  papers: IndexedPaper[];
  /** Subject pages that could not be read. The run continues past them. */
  warnings: string[];
}

export interface IndexerOptions {
  /** Returns the body of a URL, or null when it does not exist. Injected for testing. */
  fetchText: (url: string) => Promise<string | null>;
  /** Restricts the walk, used by the incremental re-index and by tests. */
  yearLevels?: readonly PaperYearLevel[];
  /** Milliseconds between requests. Politeness, not correctness. */
  delayMs?: number;
  onProgress?: (message: string) => void;
}

/**
 * Listing filenames tried when the repository tree cannot be read.
 *
 * Only the unsuffixed names, because a blind walk cannot know that `yr12/Maths` splits its
 * listings four ways or that `yr12/LOTE` has subject folders inside it. This is the degraded path:
 * it keeps a run producing rows when GitHub's tree endpoint is unavailable, and it under-reports.
 */
const FALLBACK_LISTING_FILES = [
  "hscpapers.html",
  "trialpapers.html",
  "assessment-tasks.html",
  "prelimpapers.html",
  "yr9papers.html",
  "yr10papers.html",
  "papers.html",
];

/** One listing page to read: everything needed to fetch it and to say what it contains. */
export interface ThscListingRef {
  yearLevel: PaperYearLevel;
  /** Folder path under the year level. Nested for `LOTE/Japanese` and `Maths/Competitions`. */
  subjectPath: string;
  filename: string;
}

/** The repository tree, which names every listing page in one request. */
const THSC_TREE_URL =
  "https://api.github.com/repos/thsconline/s/git/trees/thsconline-website?recursive=1";

/**
 * Every listing page in the repository, by reading its tree.
 *
 * One request replaces both halves of the old guesswork: which subject folders exist (the year
 * index pages only link the top level, so `LOTE/Japanese` was invisible) and which listing files
 * each holds (the suffixed per-course listings — all of maths, English, Studies of Religion and
 * the languages — were never requested at all).
 *
 * Returns null rather than throwing when the tree cannot be read, so a run degrades to the walk
 * below instead of producing nothing.
 */
export function parseThscTree(json: string): ThscListingRef[] | null {
  const parsed = safeJson(json) as { tree?: unknown; truncated?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.tree)) return null;

  const levels = new Set<string>(PAPER_YEAR_LEVELS);
  const listings: ThscListingRef[] = [];

  for (const node of parsed.tree) {
    const entry = node as { path?: unknown; type?: unknown };
    if (entry.type !== "blob" || typeof entry.path !== "string") continue;

    const segments = entry.path.split("/");
    // A year level, at least one subject folder, and the file itself.
    if (segments.length < 3 || !levels.has(segments[0])) continue;

    const filename = segments[segments.length - 1];
    if (!categoryForListingFile(filename)) continue;

    listings.push({
      yearLevel: segments[0] as PaperYearLevel,
      subjectPath: segments.slice(1, -1).join("/"),
      filename,
    });
  }

  return listings;
}

/**
 * Walks THSC's published repository and produces catalogue rows.
 *
 * Reads `raw.githubusercontent.com` rather than the site, because the site's `robots.txt`
 * disallows crawling and the repository is the same content through a channel that does not.
 * See docs/past-papers-sources.md.
 */
export async function indexThsc(options: IndexerOptions): Promise<IndexRunResult> {
  const { fetchText, delayMs = 120, onProgress } = options;
  const yearLevels = options.yearLevels ?? PAPER_YEAR_LEVELS;
  const papers: IndexedPaper[] = [];
  const warnings: string[] = [];

  const discovered = await discoverListings(fetchText, yearLevels, warnings, onProgress);
  // Resource files are shared across subjects and year levels, so the cache spans the whole run
  // rather than one listing page — the old per-page cache refetched the same file repeatedly.
  const resourcesByView = new Map<number, unknown>();

  for (const listing of discovered) {
    const { yearLevel, subjectPath, filename } = listing;
    const category = categoryForListingFile(filename);
    if (!category) continue;

    await sleep(delayMs);
    const path = `${yearLevel}/${subjectPath}/${filename}`;
    const listingHtml = await fetchText(thscRawUrl(path));
    // A missing listing file is normal on the fallback path, which guesses filenames.
    if (!listingHtml) continue;

    const entries = buildThscCatalogue({
      yearLevel,
      subjectFolder: subjectPath,
      category,
      filename,
      entries: parseThscListing(listingHtml),
    });

    if (entries.length === 0) {
      warnings.push(`Read ${path} but found no entries`);
      continue;
    }

    // One resource file serves every document sharing a view number, so it is fetched once per
    // distinct number rather than once per row — a subject's whole trial listing is usually one.
    for (const viewNumber of new Set(entries.map((entry) => entry.viewNumber))) {
      if (resourcesByView.has(viewNumber)) continue;
      await sleep(delayMs);
      const json = await fetchText(thscRawUrl(`index/${viewNumber}.json`));
      resourcesByView.set(viewNumber, json ? safeJson(json) : null);
    }

    const solutionKeys = solutionCompanionKeys(entries);
    for (const entry of entries) {
      papers.push(toIndexedPaper(entry, resolveThscResources(resourcesByView.get(entry.viewNumber), entry), solutionKeys));
    }
  }

  return { sourceSlug: THSC_SOURCE_SLUG, papers, warnings };
}

/** Tree first, year index pages second. */
async function discoverListings(
  fetchText: IndexerOptions["fetchText"],
  yearLevels: readonly PaperYearLevel[],
  warnings: string[],
  onProgress?: (message: string) => void,
): Promise<ThscListingRef[]> {
  const wanted = new Set<string>(yearLevels);

  const treeJson = await fetchText(THSC_TREE_URL).catch(() => null);
  const fromTree = treeJson ? parseThscTree(treeJson) : null;
  if (fromTree && fromTree.length > 0) {
    const listings = fromTree.filter((listing) => wanted.has(listing.yearLevel));
    const subjects = new Set(listings.map((listing) => `${listing.yearLevel}/${listing.subjectPath}`));
    onProgress?.(`Repository tree: ${listings.length} listings across ${subjects.size} subject folders`);
    return listings;
  }

  warnings.push("Could not read the repository tree; falling back to the year index pages");
  const listings: ThscListingRef[] = [];

  for (const yearLevel of yearLevels) {
    const indexHtml = await fetchText(thscRawUrl(`${yearLevel}/index.html`));
    if (!indexHtml) {
      warnings.push(`No index page for ${yearLevel}`);
      continue;
    }

    const subjects = parseThscSubjectFolders(indexHtml);
    onProgress?.(`${yearLevel}: ${subjects.length} subjects`);
    for (const subjectPath of subjects) {
      for (const filename of FALLBACK_LISTING_FILES) {
        listings.push({ yearLevel, subjectPath, filename });
      }
    }
  }

  return listings;
}

/**
 * Which papers have answers available somewhere.
 *
 * A paper and its marking guidelines are separate rows that share a group and a year, so the
 * companion is found by that pairing rather than by a naming convention neither source guarantees.
 * A trial that bundles its own solutions counts without needing a companion at all.
 */
function solutionCompanionKeys(entries: readonly ThscCatalogueEntry[]): Set<string> {
  const withAnswers = new Set<string>();
  for (const entry of entries) {
    if (entry.documentKind === "paper" && !entry.bundledSolutions) continue;
    withAnswers.add(companionKey(entry));
  }
  return withAnswers;
}

function companionKey(entry: ThscCatalogueEntry): string {
  return `${entry.subjectSlug}::${entry.category}::${entry.school ?? ""}::${entry.year ?? ""}`;
}

function toIndexedPaper(
  entry: ThscCatalogueEntry,
  resources: PaperResource[],
  solutionKeys: ReadonlySet<string>
): IndexedPaper {
  // Syllabus eras and course allowances are both facts about the senior courses. A Year 9 or 10
  // school assessment sits under neither: it is not written to an HSC prescription, and stamping
  // it with a three-hour HSC allowance would start the timer at double a junior task's real
  // length. Both are left unset, and the working time is read off the document when it is opened.
  const senior = entry.yearLevel === "yr11" || entry.yearLevel === "yr12";
  const era = senior && entry.year !== null
    ? eraForYear(SYLLABUS_ERAS, entry.year, entry.subjectSlug)
    : null;
  const timing = senior ? timingForSubject(entry.subjectSlug) : null;

  // Marks follow the same ladder as timing, and for the same reason: a total the school stated in
  // its own listing is a fact about this paper, while the course total is only a prior. The prior
  // is offered for senior papers written to the HSC prescription and withheld from junior tasks
  // and from anything that is not a paper — a marking guidelines document has no total of its own.
  const titleMarks = parseTotalMarks(entry.title);
  const courseMarks = senior && entry.documentKind === "paper"
    ? marksForSubject(entry.subjectSlug)
    : null;

  return {
    sourceSlug: THSC_SOURCE_SLUG,
    externalKey: entry.externalKey,
    yearLevel: entry.yearLevel,
    category: entry.category,
    subject: entry.subject,
    subjectSlug: entry.subjectSlug,
    school: entry.school,
    year: entry.year,
    title: entry.title,
    documentKind: entry.documentKind,
    bundledSolutions: entry.bundledSolutions,
    hasSolutions: entry.bundledSolutions || solutionKeys.has(companionKey(entry)),
    resources,
    sourceUrl: entry.sourceUrl,
    syllabusEraId: era?.id ?? null,
    durationMinutes: timing?.workingMinutes ?? null,
    readingMinutes: timing?.readingMinutes ?? null,
    durationSource: timing ? "subject-default" : "unknown",
    totalMarks: titleMarks ?? courseMarks,
    marksSource: titleMarks !== null ? "title" : courseMarks !== null ? "subject-default" : "unknown",
  };
}

function safeJson(text: string): unknown {
  try {
    // THSC's index files are served with a UTF-8 BOM, which JSON.parse rejects.
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * The default fetcher.
 *
 * A 404 is a normal outcome — most subjects publish only some of the listing files — so it is
 * reported as `null` rather than thrown. Any other failure throws, because a network error
 * silently indistinguishable from "this page does not exist" would quietly shrink the catalogue.
 */
export function createIndexerFetch(timeoutMs = 20_000): IndexerOptions["fetchText"] {
  return async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: "text/plain, text/html, application/json",
          // GitHub's API refuses a request without one, and the tree endpoint is how the walk
          // learns which listings exist. Identifying the caller is also the polite half of using
          // a sanctioned channel rather than crawling the disallowed host.
          "user-agent": "Millennium past-papers indexer (+https://github.com/thsconline/s)",
        },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Index fetch failed (${response.status}) for ${url}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  };
}
