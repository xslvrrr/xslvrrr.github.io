/**
 * NSW curriculum facts the index depends on: which years belong to which syllabus, and how long
 * each paper is actually meant to take.
 *
 * These are reference data, not heuristics. Everything here is checkable against a NESA document,
 * and anything that is a guess belongs in `enrichment.ts` instead. The split matters because the
 * timer defaults to these numbers, and a wrong working time silently trains a student to the wrong
 * pace for a year.
 */

import type { SyllabusEra } from "./domain.ts";

/**
 * Syllabus eras for NSW.
 *
 * The staged rollout is real and messy: the science courses changed for the 2019 HSC, Mathematics
 * Standard for 2019, and Advanced/Extension mathematics for 2020. A single site-wide "new
 * syllabus" cutoff would mislabel roughly a decade of maths papers, so subject-scoped eras
 * override the catch-all for the years they cover.
 *
 * `endYear: null` marks the era still running. The trailing placeholder era has no papers yet and
 * stays hidden until one lands inside it — see `visibleSyllabusEras`.
 */
export const SYLLABUS_ERAS: readonly SyllabusEra[] = [
  {
    id: "nsw-legacy",
    label: "Legacy syllabus",
    description: "Pre-2001 prescriptions. Useful for extra questions, not for format practice.",
    startYear: 1990,
    endYear: 2000,
    subjectSlugs: [],
  },
  {
    id: "nsw-2001",
    label: "2001-2018 syllabus",
    description: "The long-running prescriptions replaced by the current courses.",
    startYear: 2001,
    endYear: 2018,
    subjectSlugs: [],
  },
  {
    id: "nsw-current",
    label: "Current syllabus",
    description: "Prescriptions first examined in 2019. Matches the exam you will sit.",
    startYear: 2019,
    endYear: null,
    subjectSlugs: [],
  },
  {
    id: "nsw-current-maths-advanced",
    label: "Current syllabus (Mathematics)",
    description: "Advanced and Extension mathematics changed a year later than the sciences.",
    startYear: 2020,
    endYear: null,
    subjectSlugs: ["maths", "maths-advanced", "maths-ext-1", "maths-ext-2", "mathematics"],
  },
  {
    id: "nsw-2001-maths-advanced",
    label: "2001-2019 syllabus (Mathematics)",
    description: "The 2U/3U/4U courses examined for the last time in 2019.",
    startYear: 2001,
    endYear: 2019,
    subjectSlugs: ["maths", "maths-advanced", "maths-ext-1", "maths-ext-2", "mathematics"],
  },
  {
    id: "nsw-next",
    label: "New syllabus",
    description: "The next set of prescriptions. Appears here once papers exist for it.",
    startYear: 2027,
    endYear: null,
    subjectSlugs: [],
  },
];

/**
 * Official HSC working and reading times, in minutes.
 *
 * Only used when a paper does not state its own allowance. A real paper's cover page is always the
 * better authority — schools shorten trials, and multi-paper courses like English differ per
 * paper — so `detectPaperTiming` reads the document first and falls back here.
 */
interface SubjectTiming {
  workingMinutes: number;
  readingMinutes: number;
  /** Set when the course is examined across more than one paper with different allowances. */
  note?: string;
}

export const SUBJECT_TIMINGS: Readonly<Record<string, SubjectTiming>> = {
  "agriculture": { workingMinutes: 180, readingMinutes: 5 },
  "ancient-history": { workingMinutes: 180, readingMinutes: 5 },
  "biology": { workingMinutes: 180, readingMinutes: 5 },
  "business-studies": { workingMinutes: 180, readingMinutes: 5 },
  "chemistry": { workingMinutes: 180, readingMinutes: 5 },
  "earth-and-environmental-science": { workingMinutes: 180, readingMinutes: 5 },
  "economics": { workingMinutes: 180, readingMinutes: 5 },
  "engineering-studies": { workingMinutes: 180, readingMinutes: 5 },
  "investigating-science": { workingMinutes: 180, readingMinutes: 5 },
  "legal-studies": { workingMinutes: 180, readingMinutes: 5 },
  "modern-history": { workingMinutes: 180, readingMinutes: 5 },
  "pdhpe": { workingMinutes: 180, readingMinutes: 5 },
  "physics": { workingMinutes: 180, readingMinutes: 5 },
  "society-and-culture": { workingMinutes: 120, readingMinutes: 5 },
  "software": { workingMinutes: 180, readingMinutes: 5 },
  "software-engineering": { workingMinutes: 180, readingMinutes: 5 },
  "ipt": { workingMinutes: 180, readingMinutes: 5 },
  "visual-arts": { workingMinutes: 90, readingMinutes: 5 },
  "history-extension": { workingMinutes: 120, readingMinutes: 10 },
  "studies-of-religion": {
    workingMinutes: 180,
    readingMinutes: 5,
    note: "Studies of Religion I is a 90 minute paper; II is 180.",
  },
  // The two courses are separate papers with separate allowances, and THSC lists them separately
  // (`trialpapers_sor1.html`, `trialpapers_sor2.html`), so each gets its own entry rather than
  // inheriting the umbrella's 180.
  "studies-of-religion-1": { workingMinutes: 90, readingMinutes: 5 },
  "studies-of-religion-2": { workingMinutes: 180, readingMinutes: 5 },
  "maths": { workingMinutes: 180, readingMinutes: 10 },
  "maths-advanced": { workingMinutes: 180, readingMinutes: 10 },
  "maths-ext-1": { workingMinutes: 120, readingMinutes: 10 },
  "maths-ext-2": { workingMinutes: 180, readingMinutes: 10 },
  "maths-standard": { workingMinutes: 150, readingMinutes: 10 },
  "english": {
    workingMinutes: 120,
    readingMinutes: 10,
    note: "Paper 1 is 90 minutes, Paper 2 is 120. Detected from the paper where possible.",
  },
  "english-ext-1": { workingMinutes: 120, readingMinutes: 10 },
  "english-ext-2": { workingMinutes: 120, readingMinutes: 10 },
};

/**
 * Subject aliases. THSC files several distinct courses into one folder (all three maths levels
 * live under `Maths/`), so the folder name alone cannot identify the course — the paper title has
 * to be consulted too.
 */
export const SUBJECT_ALIASES: Readonly<Record<string, string>> = {
  "mathematics": "maths",
  "mathematics-advanced": "maths-advanced",
  "mathematics-extension-1": "maths-ext-1",
  "mathematics-extension-2": "maths-ext-2",
  "mathematics-standard": "maths-standard",
  "standard-maths": "maths-standard",
  "maths-2u": "maths-advanced",
  "maths-3u": "maths-ext-1",
  "maths-4u": "maths-ext-2",
  "eng-adv": "english-advanced",
  "english-advanced": "english-advanced",
  "english-standard": "english-standard",
  "english-ext-1": "english-ext-1",
  "english-ext-2": "english-ext-2",
  "lote": "languages",
  "earth-and-environment-science": "earth-and-environmental-science",
  // THSC folder names that differ from the canonical slug.
  "ipt": "ipt",
  "software": "software",
  "society-culture": "society-and-culture",
  "earth-environmental-science": "earth-and-environmental-science",
};

/**
 * Subject folders that hold more than one course, and the markers that separate them.
 *
 * The folder alone cannot identify the course for any of these, so the paper's title and the
 * listing filename are read together. Order matters within a subject: "extension 2" has to be
 * tested before "extension".
 */
const COURSE_PATTERNS: Readonly<Record<string, readonly (readonly [RegExp, string])[]>> = {
  maths: [
    [/\bext(ension)?\s*2\b|\b4u\b/, "maths-ext-2"],
    [/\bext(ension)?\s*1\b|\b3u\b/, "maths-ext-1"],
    [/\bstandard\b|\bgeneral\b/, "maths-standard"],
    [/\badvanced\b|\b2u\b/, "maths-advanced"],
  ],
  english: [
    [/\bext(ension)?\s*2\b/, "english-ext-2"],
    [/\bext(ension)?\s*1\b/, "english-ext-1"],
    [/\badvanced\b/, "english-advanced"],
    [/\bstandard\b/, "english-standard"],
  ],
  "studies-of-religion": [
    [/\bstudies of religion 2\b|\bsor\s*2\b|\bsor\s*ii\b/, "studies-of-religion-2"],
    [/\bstudies of religion 1\b|\bsor\s*1\b|\bsor\s*i\b/, "studies-of-religion-1"],
  ],
  // Languages are examined as separate courses at three levels, and THSC files all three under the
  // language's own folder.
  japanese: languageCourses("japanese"),
  latin: languageCourses("latin"),
  french: languageCourses("french"),
  german: languageCourses("german"),
  italian: languageCourses("italian"),
  spanish: languageCourses("spanish"),
  korean: languageCourses("korean"),
  arabic: languageCourses("arabic"),
  chinese: languageCourses("chinese"),
};

function languageCourses(language: string): readonly (readonly [RegExp, string])[] {
  return [
    [/\bextension\b/, `${language}-extension`],
    [/\bcontinuers\b/, `${language}-continuers`],
    [/\bbeginners\b/, `${language}-beginners`],
  ];
}

export function canonicalSubjectSlug(slug: string): string {
  return SUBJECT_ALIASES[slug] ?? slug;
}

/**
 * Splits a multi-course folder into the specific course a paper belongs to.
 *
 * Returns the folder slug unchanged when nothing carries a level marker, which is the right answer
 * for a school trial simply named "Barker 2019". The caller passes the listing filename's course
 * marker alongside the title, because for a school trial the filename is the only place the course
 * is ever stated — `yr12/Maths/trialpapers_extension2.html` is a 4U listing whose rows say nothing.
 */
export function refineSubjectSlug(folderSlug: string, title: string): string {
  const base = canonicalSubjectSlug(folderSlug);
  const patterns = COURSE_PATTERNS[base];
  if (!patterns) return base;

  const text = title.toLowerCase();
  return patterns.find(([pattern]) => pattern.test(text))?.[1] ?? base;
}

/**
 * Falls back through the alias chain so `english-advanced` still finds the `english` timing.
 *
 * Language courses are deliberately absent from the table rather than approximated: their written
 * papers vary by level and carry an oral component the timer knows nothing about, and an invented
 * allowance is worse than none.
 */
export function timingForSubject(subjectSlug: string): SubjectTiming | null {
  const direct = SUBJECT_TIMINGS[subjectSlug];
  if (direct) return direct;
  const root = subjectSlug.replace(/-(advanced|standard|ext-\d)$/, "");
  return SUBJECT_TIMINGS[root] ?? null;
}

/**
 * Official HSC mark totals, in the same spirit as the timings above and under the same rule: only
 * courses whose single written paper has one published total appear here.
 *
 * Courses examined across several papers with different totals — English and its extensions,
 * Studies of Religion I versus II, Visual Arts with its submitted body of work — are deliberately
 * absent. A per-paper total for those is a fact about the individual paper, which means it has to
 * come from the paper's own cover page or from its listing title, never from the course.
 *
 * A school trial is not bound by any of this. A trial's total is offered as a prior and labelled
 * as such, and the document's own total replaces it the first time anybody downloads the paper.
 */
export const SUBJECT_TOTAL_MARKS: Readonly<Record<string, number>> = {
  "agriculture": 100,
  "ancient-history": 100,
  "biology": 100,
  "business-studies": 100,
  "chemistry": 100,
  "earth-and-environmental-science": 100,
  "economics": 100,
  "engineering-studies": 100,
  "investigating-science": 100,
  "legal-studies": 100,
  "modern-history": 100,
  "pdhpe": 100,
  "physics": 100,
  "software": 100,
  "software-engineering": 100,
  "ipt": 100,
  "maths-advanced": 100,
  "maths-ext-1": 70,
  "maths-ext-2": 100,
  "maths-standard": 100,
};

/** The course's official total, or null when the course has no single answer. */
export function marksForSubject(subjectSlug: string): number | null {
  return SUBJECT_TOTAL_MARKS[subjectSlug] ?? null;
}
