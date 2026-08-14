/**
 * THSC Online source adapter.
 *
 * Read this before changing anything here, because the constraints are unusual.
 *
 * THSC serves `https://thsconline.github.io/s/` and its `robots.txt` is a blanket
 * `User-agent: * / Disallow: /`. We therefore never crawl that host. The site is published from
 * the public repository `thsconline/s`, and this adapter reads that repository through the GitHub
 * API instead — a sanctioned, rate-limited, cacheable channel that the disallow directive does not
 * govern, and one that costs THSC nothing.
 *
 * What we take is the catalogue: the folder tree, subject names, groups, and paper titles. What we
 * do not take is the files. THSC delivers documents through a Google Apps Script endpoint behind a
 * hashed parameter. That is their access control and their bandwidth, their licence explicitly
 * excludes the Apps Script, and we do not call it — school trial papers resolve to a `referral`
 * resource that opens THSC's own viewer, with attribution. Official HSC papers resolve instead to
 * the NESA/Board of Studies URLs that THSC's own index files point at, so the common case never
 * touches THSC infrastructure at all.
 *
 * Licence terms 6, 7 and 9 additionally treat a substantial reproduction as needing informal
 * permission and restrict use to non-commercial education. This adapter is therefore off unless
 * `PAST_PAPERS_THSC_ENABLED` is set — see `docs/past-papers-sources.md`.
 */

import {
  type PaperCategory,
  type PaperDocumentKind,
  type PaperResource,
  type PaperYearLevel,
  subjectSlugOf,
} from "../domain.ts";
import { refineSubjectSlug } from "../taxonomy.ts";

export const THSC_SOURCE_SLUG = "thsc";
export const THSC_REPO_OWNER = "thsconline";
export const THSC_REPO_NAME = "s";
export const THSC_REPO_BRANCH = "thsconline-website";
export const THSC_SITE_ORIGIN = "https://thsconline.github.io";

/**
 * Listing pages, keyed by the stem the filename starts with.
 *
 * Matched as a prefix rather than by whole filename, because a subject folder that holds several
 * courses splits its listings by course: `hscpapers_extension2.html`, `trialpapers_paper2_standard.html`,
 * `prelimpapers_accelerated.html`, `trialpapers_sor1.html`. Reading only the bare names cost the
 * index every maths, English, Studies of Religion and languages listing on the site.
 *
 * Longest stem first so `assessment-tasks` is tested before anything that could prefix-match it.
 */
const CATEGORY_BY_STEM: readonly (readonly [string, PaperCategory])[] = [
  ["assessment-tasks", "assessment"],
  ["prelimpapers", "prelim"],
  ["trialpapers", "trial"],
  ["hscpapers", "hsc"],
  ["yr9papers", "yearly"],
  ["yr10papers", "yearly"],
  // Mathematics olympiad and competition archives, which sit under `Maths/Competitions/`.
  ["cp_", "other"],
  ["papers", "other"],
];

/**
 * Course markers a listing filename carries after its stem.
 *
 * The folder cannot identify the course — `yr12/Maths/` holds four of them — and neither can the
 * title, because a school trial is listed as "Barker 2019" and nothing more. The filename is the
 * only place the course is stated for those rows, so it is read here and handed to the subject
 * refinement as if it were part of the title.
 */
const COURSE_HINTS: Readonly<Record<string, string>> = {
  advanced: "advanced",
  general: "standard",
  standard: "standard",
  extension1: "extension 1",
  extension2: "extension 2",
  extension: "extension",
  paper1: "paper 1",
  paper2_advanced: "paper 2 advanced",
  paper2_standard: "paper 2 standard",
  sor1: "studies of religion 1",
  sor2: "studies of religion 2",
  continuers: "continuers",
  beginners: "beginners",
  // Year 11 students accelerating into the Year 12 course. It says nothing about which course,
  // so it deliberately maps to nothing rather than guessing a level.
  accelerated: "",
};

export interface ThscListingEntry {
  /** The `<td>` heading the entry sits under: a school for trials, a year for HSC papers. */
  group: string;
  title: string;
  /** THSC's internal view number, the key for its `index/{viewNumber}.json` resource file. */
  viewNumber: number;
}

export interface ThscCatalogueEntry {
  externalKey: string;
  yearLevel: PaperYearLevel;
  category: PaperCategory;
  subject: string;
  /** Folder path under the year level, `LOTE/Japanese` for a nested subject. */
  subjectPath: string;
  subjectSlug: string;
  school: string | null;
  year: number | null;
  title: string;
  documentKind: PaperDocumentKind;
  /** True when the document itself carries its answers, as most school trials do. */
  bundledSolutions: boolean;
  viewNumber: number;
  sourceUrl: string;
}

/**
 * A resource entry from `index/{viewNumber}.json`.
 *
 * The shape is loose upstream — some entries omit `type`, some use a site-relative `/s/em/...`
 * path — so every field is treated as optional and normalised rather than trusted.
 */
interface ThscIndexResource {
  display?: unknown;
  title?: unknown;
  url?: unknown;
  type?: unknown;
  default?: unknown;
}

export function thscListingUrl(yearLevel: PaperYearLevel, subjectPath: string, filename: string): string {
  const path = subjectPath.split("/").map(encodeURIComponent).join("/");
  return `${THSC_SITE_ORIGIN}/s/${yearLevel}/${path}/${filename}`;
}

export function thscRawUrl(path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${THSC_REPO_OWNER}/${THSC_REPO_NAME}/${THSC_REPO_BRANCH}/${encoded}`;
}

/** The page a student is sent to when we cannot serve a document ourselves. */
export function thscViewerUrl(viewNumber: number, title: string): string {
  return `${THSC_SITE_ORIGIN}/s/v/${viewNumber}/${encodeURIComponent(title)}`;
}

export function categoryForListingFile(filename: string): PaperCategory | null {
  const name = filename.toLowerCase();
  if (!name.endsWith(".html") || name === "index.html") return null;
  const stem = name.slice(0, -".html".length);
  return CATEGORY_BY_STEM.find(([prefix]) => stem.startsWith(prefix))?.[1] ?? null;
}

/**
 * The course a listing filename names, as text the subject refinement can read.
 *
 * Empty when the filename carries no course, which is the normal case for a single-course subject.
 */
export function courseHintForListingFile(filename: string): string {
  const stem = filename.toLowerCase().replace(/\.html$/, "");
  const separator = stem.indexOf("_");
  if (separator === -1) return "";
  const suffix = stem.slice(separator + 1);
  return COURSE_HINTS[suffix] ?? "";
}

/**
 * Pulls the subject folder names out of a year-level index page.
 *
 * Several display names map to one folder — "Maths (2U)", "Maths Ext 1" and "Standard Maths" all
 * link to `Maths/` — so folders are de-duplicated here and the specific course is recovered later
 * from each paper's own title.
 */
export function parseThscSubjectFolders(html: string): string[] {
  const folders = new Set<string>();
  // Subject tiles are the only anchors on this page whose href is a bare relative directory.
  const anchor = /<a\s+href="([^"#?/][^"]*?)\/"/gi;
  for (const match of html.matchAll(anchor)) {
    const folder = decodeHtmlEntities(match[1]).trim();
    if (!folder || folder.startsWith("..")) continue;
    folders.add(folder);
  }
  return [...folders].sort((a, b) => a.localeCompare(b));
}

/**
 * Pulls paper entries out of a listing page.
 *
 * The markup is generated and uniform: a `<tr><td>` whose first text node is the group heading,
 * followed by a `<span class="content">` holding one anchor per document, each carrying its view
 * number in an inline `pdf(this, NNNN)` handler. Rows tagged `class="content"` are prose notes
 * from the maintainers and carry no anchors of that shape, so they fall out naturally.
 */
export function parseThscListing(html: string): ThscListingEntry[] {
  const entries: ThscListingEntry[] = [];
  const rowPattern = /<tr(?![^>]*class=")[^>]*>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;

  for (const row of html.matchAll(rowPattern)) {
    const cell = row[1];
    const contentStart = cell.search(/<span\s+class="content">/i);
    if (contentStart === -1) continue;

    const group = stripTags(cell.slice(0, contentStart)).trim();
    if (!group) continue;

    const anchorPattern = /<a[^>]*onclick="pdf\(this,\s*(\d+)[^)]*\)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const anchor of cell.slice(contentStart).matchAll(anchorPattern)) {
      const title = stripTags(anchor[2]).trim();
      if (!title) continue;
      entries.push({ group, title, viewNumber: Number(anchor[1]) });
    }
  }

  return entries;
}

/**
 * Turns listing entries into catalogue rows.
 *
 * The group heading carries different meaning per category, which is the whole reason category is
 * a parameter rather than something inferred: on an HSC listing the group is the exam year, and on
 * a trial listing it is the school that set the paper.
 */
export function buildThscCatalogue(options: {
  yearLevel: PaperYearLevel;
  /** Folder path under the year level. `LOTE/Japanese` and `Maths/Competitions` are both real. */
  subjectFolder: string;
  category: PaperCategory;
  filename: string;
  entries: readonly ThscListingEntry[];
}): ThscCatalogueEntry[] {
  const { yearLevel, subjectFolder, category, filename, entries } = options;
  const subjectName = subjectNameFor(subjectFolder);
  const folderSlug = subjectSlugOf(subjectName);
  const courseHint = courseHintForListingFile(filename);
  const sourceUrl = thscListingUrl(yearLevel, subjectFolder, filename);

  return entries.map((entry) => {
    // A yearly, prelim, trial or assessment listing groups by school; only an official HSC listing
    // groups by year.
    const school = category === "hsc" ? null : normaliseSchool(entry.group);
    const year = parseYear(entry.title) ?? parseYear(entry.group);
    const documentKind = classifyDocument(entry.title);
    const subjectSlug = refineSubjectSlug(folderSlug, `${subjectName} ${courseHint} ${entry.title}`);

    return {
      // Keyed on everything that distinguishes one row from another on the page. The view number
      // alone is not unique: every document under one heading shares it, and two courses in one
      // folder share both the number and the group, so the filename is part of the key too.
      externalKey: [yearLevel, folderSlug, category, filename, entry.viewNumber, entry.group, entry.title]
        .join("::")
        .toLowerCase(),
      yearLevel,
      category,
      subject: subjectName,
      subjectPath: subjectFolder,
      subjectSlug,
      school,
      year,
      title: entry.title,
      documentKind,
      bundledSolutions: hasBundledSolutions(entry.title),
      viewNumber: entry.viewNumber,
      sourceUrl,
    };
  });
}

/**
 * Resolves a view number's resource list into links we can actually offer.
 *
 * An absolute `http(s)` URL off THSC's own host is a document some other publisher already serves
 * openly — overwhelmingly NESA and the Board of Studies archive — and is safe to fetch directly.
 * Anything site-relative points back into THSC's gated delivery, so it degrades to a referral that
 * opens their page rather than a URL we would fetch.
 */
export function resolveThscResources(
  raw: unknown,
  entry: Pick<ThscCatalogueEntry, "title" | "viewNumber">
): PaperResource[] {
  const fallback: PaperResource = {
    display: "THSC Online",
    url: thscViewerUrl(entry.viewNumber, entry.title),
    accessMode: "referral",
    preferred: true,
    official: false,
  };

  if (!raw || typeof raw !== "object") return [fallback];
  const byTitle = (raw as Record<string, unknown>)[entry.title];
  if (!Array.isArray(byTitle)) return [fallback];

  const resources = byTitle.flatMap((value): PaperResource[] => {
    const item = value as ThscIndexResource;
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url) return [];

    const isAbsolute = /^https?:\/\//i.test(url);
    const isThscHost = url.startsWith(THSC_SITE_ORIGIN);
    const direct = isAbsolute && !isThscHost;

    return [{
      display: typeof item.display === "string" && item.display.trim()
        ? item.display.trim()
        : direct ? "External copy" : "THSC Online",
      url: direct ? url : thscViewerUrl(entry.viewNumber, entry.title),
      accessMode: direct ? "direct" : "referral",
      preferred: item.default === true,
      official: direct && isOfficialHost(url),
    }];
  });

  if (resources.length === 0) return [fallback];
  // A direct copy is worth more than the source's own `default` flag, which optimises for THSC's
  // mirror rather than for whether we can show the document inline.
  return [...resources].sort((a, b) => {
    if (a.accessMode !== b.accessMode) return a.accessMode === "direct" ? -1 : 1;
    if (a.official !== b.official) return a.official ? -1 : 1;
    return Number(b.preferred) - Number(a.preferred);
  });
}

const OFFICIAL_HOSTS = [
  "boardofstudies.nsw.edu.au",
  "educationstandards.nsw.edu.au",
  "nesa.nsw.edu.au",
  "curriculum.nsw.edu.au",
];

export function isOfficialHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_HOSTS.some((official) => host === official || host.endsWith(`.${official}`));
  } catch {
    return false;
  }
}

/**
 * Reads the document type out of a title.
 *
 * Order matters: "2013 Marking Guidelines" and "Barker 2019 w. sol" both mention a paper, and the
 * answer-bearing marker has to win so a solutions document is never mistaken for the exam and
 * opened next to a running timer.
 */
export function classifyDocument(title: string): PaperDocumentKind {
  const text = title.toLowerCase();
  if (/marking\s*feedback|examiner'?s?\s*(report|feedback)/.test(text)) return "marking_feedback";
  if (/marking\s*guidelines?|marking\s*criteria/.test(text)) return "marking_guidelines";
  if (/sample\s*answers?|suggested\s*answers?/.test(text)) return "sample_answers";
  // Checked before the solutions branch. `w. sol` is THSC's marker for a paper that happens to
  // ship its solutions in the same file, not for a standalone answer document — reading it the
  // other way hides the exam from anyone filtering for papers, which is most of the trial listing.
  if (hasBundledSolutions(text)) return "paper";
  if (/\bsolutions?\b|\bworked\b|\banswers?\b/.test(text)) return "solutions";
  if (/\bnotes?\b|\bsummary\b|\bstudy\s*guide\b/.test(text)) return "notes";
  if (/\bhsc\b|\btrial\b|\bexam\b|\bpaper\b|\btask\b|\d{4}/.test(text)) return "paper";
  return "unknown";
}

/**
 * Whether a title advertises solutions inside the same document.
 *
 * This is what drives the "has solutions" filter for trial papers, where there is no separate
 * marking guidelines row to infer it from.
 */
export function hasBundledSolutions(title: string): boolean {
  return /\bw[./]?\s*sol(?:n|s|utions?)?\b|\bwith\s+solutions?\b|\(sol(?:n|s|utions?)?\)/i.test(title);
}

/**
 * A mark total stated in a listing title.
 *
 * THSC's own entries carry it often enough to be worth reading — "2019 Trial (100 marks)",
 * "Barker 2021 Task 3 - 55 marks". This is the same authority ladder timing uses, one rung down
 * from the document itself: the listing is what the school wrote about its own paper, so it beats
 * the course's official total but loses to the cover page once the paper is fetched.
 *
 * Requires the word "marks" adjacent to the number. Titles are full of bare numerals — years, task
 * numbers, paper numbers — and the largest one on a line is as often a year as a total.
 */
export function parseTotalMarks(title: string): number | null {
  const match = title.match(/(?:\(|\[|\b-\s*|\b)(\d{1,3})\s*marks?\b/i)
    ?? title.match(/\bmarks?\s*[:=]\s*(\d{1,3})\b/i);
  if (!match) return null;

  const marks = Number(match[1]);
  // A paper worth fewer than ten marks is a heading misread; more than 200 is a page count or a
  // stray year fragment.
  return marks >= 10 && marks <= 200 ? marks : null;
}

/**
 * A four-digit year inside a plausible range. Bounded on both ends so a mark total, a question
 * count, or a school's founding date in its own name cannot be read as an exam year.
 */
export function parseYear(text: string): number | null {
  const matches = text.match(/\b(19[89]\d|20[0-4]\d)\b/g);
  if (!matches) return null;
  // Later mentions win: "St Foo 1885 Trial 2019" is a 2019 paper.
  return Number(matches[matches.length - 1]);
}

/**
 * The subject a folder path names.
 *
 * A nested folder is named by its leaf: `LOTE/Japanese` is Japanese, and filing it under the
 * languages umbrella would collapse every language into one subject. The exception is a leaf that
 * names a kind of paper rather than a course — `Maths/Competitions` holds olympiad problems, which
 * are neither the Maths course nor a subject called "Competitions".
 */
export function subjectNameFor(subjectFolder: string): string {
  const segments = subjectFolder.split("/").filter(Boolean);
  const leaf = segments.at(-1) ?? subjectFolder;
  const parent = segments.at(-2);
  return parent && /^competitions$/i.test(leaf) ? `${parent} ${leaf}` : leaf;
}

/** Strips the year and solution markers a school heading sometimes carries. */
function normaliseSchool(group: string): string | null {
  const cleaned = group
    .replace(/\b(19[89]\d|20[0-4]\d)\b/g, "")
    .replace(/\bw\.?\s*sol\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || null;
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}
