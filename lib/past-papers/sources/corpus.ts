/**
 * The local scraped corpus.
 *
 * A manifest produced by the scraper CLI, mapping each paper to a file already on disk. This is
 * now the primary source: the catalogue describes documents we hold rather than documents we would
 * have to go and ask another site for, which is what makes the download button, the reader, the
 * timer and everything downstream of them work on more than a handful of papers.
 *
 * Manifest shape, keyed by the scraper's own dedup uid:
 *
 *   "physics|2023|hsc|NESA||https://…/2023-hsc-physics.pdf": "downloads/physics/hsc/2023_…pdf"
 *
 * The key is `subject|year|paper_type|source|school|url`, matching `Paper.uid()` in
 * `scrapers/base.py`. It is parsed rather than trusted: `url` can itself contain a `|`, so the
 * split is bounded to five separators and the remainder is the URL.
 *
 * A value is either that path or an object carrying it plus what the uid cannot express — the year
 * level a paper was sat at, and the category of the listing it came from. The uid predates junior
 * coverage and cannot be extended without invalidating every entry already downloaded, so the
 * metadata rides alongside instead and a bare string is still read as a Year 12 paper.
 */

import {
  PAPER_CATEGORIES,
  PAPER_YEAR_LEVELS,
  type PaperCategory,
  type PaperDocumentKind,
  type PaperResource,
  type PaperYearLevel,
  subjectSlugOf,
} from "../domain.ts";

export const CORPUS_SOURCE_SLUG = "corpus";

export interface CorpusEntry {
  subjectKey: string;
  year: number | null;
  paperType: string;
  source: string;
  school: string | null;
  url: string;
  /** Path relative to the corpus root, exactly as the manifest records it. */
  localPath: string;
  /** Stated by the scraper. Null for an entry downloaded before junior coverage existed. */
  yearLevel: PaperYearLevel | null;
  /** The listing's own category, which outranks the one inferred from `paperType`. */
  category: PaperCategory | null;
  /** Display name the scraper used, when it knows one the subject table does not. */
  subjectName: string | null;
  /** What the source calls this document, which is what tells two papers of a kind apart. */
  document: string | null;
}

/**
 * Scraper subject keys onto catalogue subject slugs and display names.
 *
 * The scraper uses its own vocabulary (`maths_extension1`), and the catalogue already has a
 * canonical one shared with the syllabus and timing tables. Mapping here keeps the scraper free to
 * rename its keys without breaking the eras or the exam allowances.
 */
const SUBJECTS: Readonly<Record<string, { slug: string; name: string }>> = {
  // Sciences
  physics: { slug: "physics", name: "Physics" },
  chemistry: { slug: "chemistry", name: "Chemistry" },
  biology: { slug: "biology", name: "Biology" },
  earth_science: { slug: "earth-and-environmental-science", name: "Earth and Environmental Science" },
  investigating_science: { slug: "investigating-science", name: "Investigating Science" },
  psychology: { slug: "psychology", name: "Psychology" },
  agriculture: { slug: "agriculture", name: "Agriculture" },

  // Mathematics
  maths_extension1: { slug: "maths-ext-1", name: "Mathematics Extension 1" },
  maths_extension2: { slug: "maths-ext-2", name: "Mathematics Extension 2" },
  maths_advanced: { slug: "maths-advanced", name: "Mathematics Advanced" },
  maths_standard: { slug: "maths-standard", name: "Mathematics Standard" },
  maths_standard1: { slug: "maths-standard", name: "Mathematics Standard 1" },
  maths_standard2: { slug: "maths-standard", name: "Mathematics Standard 2" },
  maths_competitions: { slug: "maths-competitions", name: "Mathematics Competitions" },

  // English
  english_advanced: { slug: "english-advanced", name: "English Advanced" },
  english_standard: { slug: "english-standard", name: "English Standard" },
  english_extension1: { slug: "english-ext-1", name: "English Extension 1" },
  english_extension2: { slug: "english-ext-2", name: "English Extension 2" },
  english_esl: { slug: "english-eal-d", name: "English EAL/D" },

  // Humanities
  economics: { slug: "economics", name: "Economics" },
  business_studies: { slug: "business-studies", name: "Business Studies" },
  legal_studies: { slug: "legal-studies", name: "Legal Studies" },
  modern_history: { slug: "modern-history", name: "Modern History" },
  ancient_history: { slug: "ancient-history", name: "Ancient History" },
  history_extension: { slug: "history-extension", name: "History Extension" },
  geography: { slug: "geography", name: "Geography" },
  society_culture: { slug: "society-and-culture", name: "Society and Culture" },
  studies_of_religion1: { slug: "studies-of-religion-1", name: "Studies of Religion I" },
  studies_of_religion2: { slug: "studies-of-religion-2", name: "Studies of Religion II" },

  // Technologies
  software_design: { slug: "software", name: "Software Design and Development" },
  information_processes: { slug: "ipt", name: "Information Processes and Technology" },
  design_technology: { slug: "design-and-technology", name: "Design and Technology" },
  textiles_design: { slug: "textiles-and-design", name: "Textiles and Design" },
  industrial_technology: { slug: "industrial-technology", name: "Industrial Technology" },
  engineering_studies: { slug: "engineering-studies", name: "Engineering Studies" },

  // PDHPE and creative arts
  pdhpe: { slug: "pdhpe", name: "PDHPE" },
  music1: { slug: "music-1", name: "Music 1" },
  music2: { slug: "music-2", name: "Music 2" },
  visual_arts: { slug: "visual-arts", name: "Visual Arts" },
  drama: { slug: "drama", name: "Drama" },
  dance: { slug: "dance", name: "Dance" },

  // Languages. Levels are separate courses and separate papers, so they are separate subjects.
  japanese: { slug: "japanese-continuers", name: "Japanese Continuers" },
  japanese_beginners: { slug: "japanese-beginners", name: "Japanese Beginners" },
  japanese_extension: { slug: "japanese-extension", name: "Japanese Extension" },
  latin: { slug: "latin-continuers", name: "Latin Continuers" },
  latin_extension: { slug: "latin-extension", name: "Latin Extension" },
  french: { slug: "french-continuers", name: "French Continuers" },
  german: { slug: "german-continuers", name: "German Continuers" },
  italian: { slug: "italian-continuers", name: "Italian Continuers" },
  spanish: { slug: "spanish-continuers", name: "Spanish Continuers" },
  korean: { slug: "korean-continuers", name: "Korean Continuers" },
  arabic: { slug: "arabic-continuers", name: "Arabic Continuers" },
  chinese_standard: { slug: "chinese-in-context", name: "Chinese in Context" },

  // Junior. Not HSC courses, which is why they are keyed by their year level: a Year 9 maths
  // yearly and a Year 12 Extension 2 trial must never land under one subject.
  yr9_maths: { slug: "junior-maths", name: "Mathematics (Year 9)" },
  yr10_maths: { slug: "junior-maths", name: "Mathematics (Year 10)" },
  yr10_science: { slug: "junior-science", name: "Science (Year 10)" },
};

/**
 * Scraper paper types onto the catalogue's category and document kind.
 *
 * These are two separate facts that the scraper folds into one field. `marking` is a document kind
 * attached to an official paper, not a category of its own, and keeping them apart is what stops a
 * marking guideline being offered as something to sit under a timer.
 */
const PAPER_TYPES: Readonly<Record<string, { category: PaperCategory; kind: PaperDocumentKind }>> = {
  hsc: { category: "hsc", kind: "paper" },
  trial: { category: "trial", kind: "paper" },
  internal: { category: "assessment", kind: "paper" },
  prelim: { category: "prelim", kind: "paper" },
  yearly: { category: "yearly", kind: "paper" },
  // The category here is only a default. A marking guideline published beside a Year 11
  // preliminary paper belongs in `prelim`, and the scraper says so in the entry's own metadata.
  marking: { category: "hsc", kind: "marking_guidelines" },
  sample: { category: "hsc", kind: "sample_answers" },
  // NESA's "Notes from the Marking Centre": the examiners' report on how the cohort answered.
  // Answer-bearing, so it must never be offered as something to sit under a timer.
  feedback: { category: "hsc", kind: "marking_feedback" },
  solutions: { category: "hsc", kind: "solutions" },
  notes: { category: "other", kind: "notes" },
};

const YEAR_LEVELS = new Set<string>(PAPER_YEAR_LEVELS);
const CATEGORIES = new Set<string>(PAPER_CATEGORIES);

export function parseManifest(manifest: Record<string, unknown>): CorpusEntry[] {
  const entries: CorpusEntry[] = [];

  for (const [uid, value] of Object.entries(manifest)) {
    const record = readManifestValue(value);
    if (!record) continue;

    // Bounded to five splits: a URL may legitimately contain `|`, and an unbounded split would
    // truncate it and produce a resource pointing nowhere.
    const parts = splitBounded(uid, "|", 5);
    if (parts.length < 6) continue;

    const [subjectKey, yearText, paperType, source, school] = parts;
    const url = parts[5];
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;

    entries.push({
      subjectKey,
      year,
      paperType,
      source: source || "Unknown",
      school: school || null,
      url,
      ...record,
    });
  }

  return entries;
}

/**
 * Reads a manifest value in either shape.
 *
 * Every field beyond the path is optional and validated against the vocabulary rather than
 * trusted: the manifest is generated locally, but it decides what the catalogue claims about a
 * paper, and a stale scraper writing `year_level: "yr13"` should lose that one field rather than
 * fail the row or reach the database.
 */
function readManifestValue(
  value: unknown,
): Pick<CorpusEntry, "localPath" | "yearLevel" | "category" | "subjectName" | "document"> | null {
  if (typeof value === "string") {
    return value
      ? { localPath: value, yearLevel: null, category: null, subjectName: null, document: null }
      : null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const localPath = typeof record.path === "string" ? record.path : "";
  if (!localPath) return null;

  const yearLevel = typeof record.year_level === "string" && YEAR_LEVELS.has(record.year_level)
    ? record.year_level as PaperYearLevel
    : null;
  const category = typeof record.category === "string" && CATEGORIES.has(record.category)
    ? record.category as PaperCategory
    : null;
  const subjectName = typeof record.subject === "string" && record.subject.trim()
    ? record.subject.trim()
    : null;
  const document = typeof record.document === "string" && record.document.trim()
    ? record.document.trim()
    : null;

  return { localPath, yearLevel, category, subjectName, document };
}

/**
 * What distinguishes this document from the others of its kind in the same year.
 *
 * The scraper states it. For an entry written before it did, the filename carries it: the local
 * name is built from the same label plus a digest, and it is unique per document either way.
 */
function documentKeyOf(entry: CorpusEntry): string {
  if (entry.document) return entry.document;
  return entry.localPath.split("/").pop()?.replace(/\.pdf$/i, "") ?? entry.localPath;
}

function splitBounded(value: string, separator: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = value;
  for (let index = 0; index < limit; index += 1) {
    const at = rest.indexOf(separator);
    if (at === -1) break;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at + separator.length);
  }
  parts.push(rest);
  return parts;
}

export interface CorpusPaper {
  externalKey: string;
  yearLevel: PaperYearLevel;
  category: PaperCategory;
  subject: string;
  subjectSlug: string;
  school: string | null;
  year: number | null;
  title: string;
  documentKind: PaperDocumentKind;
  resources: PaperResource[];
  localPath: string;
  sourceUrl: string;
}

/**
 * Turns a manifest entry into a catalogue row.
 *
 * Every paper here is held locally, so its primary resource is always `direct` — there is no
 * referral path any more, and nothing in the browser sends a student to another site.
 */
export function toCorpusPaper(entry: CorpusEntry): CorpusPaper | null {
  const mapped = SUBJECTS[entry.subjectKey];
  const subject = mapped
    ?? {
      slug: subjectSlugOf(entry.subjectKey.replace(/_/g, " ")),
      name: entry.subjectName ?? titleCase(entry.subjectKey),
    };
  const type = PAPER_TYPES[entry.paperType];
  if (!type) return null;

  const resources: PaperResource[] = [{
    display: entry.source === "NESA" ? "NESA (official)" : entry.source,
    // The local path, not a URL. The pdf route resolves it against the corpus root; nothing about
    // a student's request ever reaches the original host.
    url: entry.localPath,
    accessMode: "direct",
    preferred: true,
    official: entry.source === "NESA",
  }];

  return {
    // Keyed on the manifest uid's stable parts rather than the URL, so a re-scrape that finds the
    // same paper at a new URL updates the row instead of duplicating it — plus the document's own
    // name, without which one school's paper and that same paper with solutions share a key and
    // the second silently replaces the first. That cost 910 documents their catalogue row.
    externalKey: [
      entry.subjectKey,
      entry.year ?? "",
      entry.paperType,
      entry.source,
      entry.school ?? "",
      documentKeyOf(entry),
    ]
      .join("::")
      .toLowerCase(),
    // The scraper states the year level it found the paper under. Absent, the entry predates
    // junior coverage, when every subject scraped was a senior course.
    yearLevel: entry.yearLevel ?? (entry.paperType === "internal" ? "yr11" : "yr12"),
    // The listing's own category beats the one inferred from the paper type, which cannot tell a
    // Year 11 preliminary marking guideline from an HSC one.
    category: entry.category ?? type.category,
    subject: subject.name,
    subjectSlug: subject.slug,
    school: entry.school,
    year: entry.year,
    title: buildTitle(entry, subject.name, type.kind),
    documentKind: type.kind,
    resources,
    localPath: entry.localPath,
    sourceUrl: entry.url,
  };
}

/**
 * A title a student would recognise.
 *
 * Built rather than taken from the filename: the scraper's filenames carry underscores, the source
 * name and the paper type, none of which belong in a card heading.
 */
function buildTitle(entry: CorpusEntry, subjectName: string, kind: PaperDocumentKind): string {
  const parts: string[] = [];
  if (entry.year !== null) parts.push(String(entry.year));
  // Whoever set the paper: the school, or NESA for anything sitting in the official HSC
  // category. Keyed on the category rather than a list of paper types, so a document kind added
  // later cannot quietly lose the "HSC" that tells a student what they are looking at.
  if (entry.school) parts.push(entry.school);
  else if ((entry.category ?? PAPER_TYPES[entry.paperType]?.category) === "hsc") parts.push("HSC");
  parts.push(subjectName);

  // What the document is wins over which listing it came from: a marking guideline found on a
  // trial page is still a marking guideline.
  if (kind === "marking_guidelines") parts.push("Marking Guidelines");
  else if (kind === "sample_answers") parts.push("Sample Answers");
  else if (kind === "marking_feedback") parts.push("Notes from the Marking Centre");
  else if (kind === "solutions") parts.push("Solutions");
  else if (entry.paperType === "trial") parts.push("Trial");
  else if (entry.paperType === "internal") parts.push("Assessment");
  else if (entry.paperType === "prelim") parts.push("Preliminary");
  else if (entry.paperType === "yearly") parts.push("Yearly");

  return parts.join(" ");
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

/**
 * Whether a manifest path is safe to resolve against the corpus root.
 *
 * The manifest is generated locally, but it is still a file that decides which path the server
 * opens, so it is treated as untrusted input. Anything absolute, anything containing a traversal
 * segment, and anything that is not a PDF is refused outright.
 */
export function isSafeCorpusPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.includes("\0")) return false;
  if (/(^|[/\\])\.\.([/\\]|$)/.test(path)) return false;
  if (/^[a-z]:/i.test(path)) return false;
  return path.toLowerCase().endsWith(".pdf");
}
