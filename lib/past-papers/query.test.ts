import { describe, expect, test } from "vitest";

import type { PastPaper } from "./domain.ts";
import {
  filterPapers,
  relevanceScore,
  resolveYearRange,
  schoolsIn,
  sortPapers,
  yearsIn,
  type RelevanceContext,
} from "./query.ts";
import { SYLLABUS_ERAS } from "./taxonomy.ts";

const paper = (overrides: Partial<PastPaper> = {}): PastPaper => ({
  id: overrides.id ?? "p1",
  sourceSlug: "nesa",
  externalKey: "k",
  yearLevel: "yr12",
  category: "hsc",
  subject: "Physics",
  subjectSlug: "physics",
  school: null,
  year: 2023,
  title: "2023 HSC",
  documentKind: "paper",
  resources: [],
  hasSolutions: true,
  syllabusEraId: "nsw-current",
  durationMinutes: 180,
  readingMinutes: 5,
  durationSource: "subject-default",
  totalMarks: 100,
  difficulty: null,
  tags: [],
  sourceUrl: "https://example.invalid",
  indexedAt: "2026-01-01T00:00:00.000Z",
  saveCount: 0,
  attemptCount: 0,
  ...overrides,
} as PastPaper);

const context = (overrides: Partial<RelevanceContext> = {}): RelevanceContext => ({
  enrolledSubjectSlugs: new Set(["physics"]),
  yearLevel: "yr12",
  attemptedPaperIds: new Set(),
  savedPaperIds: new Set(),
  currentYear: 2026,
  eras: SYLLABUS_ERAS,
  ...overrides,
});

describe("resolveYearRange", () => {
  test("an era overrides a manual range so the two controls cannot disagree", () => {
    const range = resolveYearRange(
      { syllabusEraId: "nsw-2001", yearFrom: 1990, yearTo: 2030 },
      SYLLABUS_ERAS
    );

    expect(range).toEqual({ from: 2001, to: 2018 });
  });

  test("an open-ended era leaves the upper bound unset", () => {
    expect(resolveYearRange({ syllabusEraId: "nsw-current" }, SYLLABUS_ERAS).to).toBeNull();
  });

  test("falls back to the manual range when no era is chosen", () => {
    expect(resolveYearRange({ yearFrom: 2015, yearTo: 2020 }, SYLLABUS_ERAS)).toEqual({ from: 2015, to: 2020 });
  });
});

describe("filterPapers", () => {
  const papers = [
    paper({ id: "hsc-2023", year: 2023 }),
    paper({ id: "hsc-2010", year: 2010, syllabusEraId: "nsw-2001" }),
    paper({ id: "guide", documentKind: "marking_guidelines", title: "2023 Marking Guidelines" }),
    paper({ id: "trial", category: "trial", school: "James Ruse", year: 2022, hasSolutions: false }),
    paper({ id: "undated", year: null }),
    paper({ id: "chem", subject: "Chemistry", subjectSlug: "chemistry" }),
  ];

  test("narrows by subject", () => {
    const result = filterPapers(papers, { subjectSlugs: ["chemistry"] }, SYLLABUS_ERAS);
    expect(result.map((entry) => entry.id)).toEqual(["chem"]);
  });

  test("papers-only hides answer-bearing documents", () => {
    const ids = filterPapers(papers, { papersOnly: true }, SYLLABUS_ERAS).map((entry) => entry.id);
    expect(ids).not.toContain("guide");
  });

  test("excludes undated resources from a year range rather than keeping them", () => {
    const ids = filterPapers(papers, { yearFrom: 2000, yearTo: 2030 }, SYLLABUS_ERAS).map((entry) => entry.id);
    expect(ids).not.toContain("undated");
  });

  test("keeps undated resources when no year constraint is set", () => {
    const ids = filterPapers(papers, {}, SYLLABUS_ERAS).map((entry) => entry.id);
    expect(ids).toContain("undated");
  });

  test("an era filter narrows to that era's years", () => {
    const ids = filterPapers(papers, { syllabusEraId: "nsw-2001" }, SYLLABUS_ERAS).map((entry) => entry.id);
    expect(ids).toEqual(["hsc-2010"]);
  });

  test("requires every search term to match, so two terms narrow", () => {
    expect(filterPapers(papers, { search: "ruse 2022" }, SYLLABUS_ERAS).map((e) => e.id)).toEqual(["trial"]);
    expect(filterPapers(papers, { search: "ruse 1999" }, SYLLABUS_ERAS)).toHaveLength(0);
  });

  test("solutions filter drops papers without them", () => {
    const ids = filterPapers(papers, { requireSolutions: true }, SYLLABUS_ERAS).map((entry) => entry.id);
    expect(ids).not.toContain("trial");
  });

  test("saved-only consults the supplied save set", () => {
    const ids = filterPapers(papers, { savedOnly: true }, SYLLABUS_ERAS, new Set(["trial"])).map((e) => e.id);
    expect(ids).toEqual(["trial"]);
  });

  test("tag filter requires every requested tag, not any", () => {
    const tagged = paper({
      id: "tagged",
      tags: [{ id: "long-response", label: "Long response", group: "format" }],
    });
    expect(filterPapers([tagged], { tagIds: ["long-response"] }, SYLLABUS_ERAS)).toHaveLength(1);
    expect(filterPapers([tagged], { tagIds: ["long-response", "calculus"] }, SYLLABUS_ERAS)).toHaveLength(0);
  });
});

describe("relevanceScore", () => {
  test("an enrolled subject outranks a better paper in a subject not taken", () => {
    const enrolled = paper({ id: "a", year: 2015, subjectSlug: "physics" });
    const notTaken = paper({ id: "b", year: 2025, subjectSlug: "ancient-history", saveCount: 500 });

    expect(relevanceScore(enrolled, context())).toBeGreaterThan(relevanceScore(notTaken, context()));
  });

  test("a current-syllabus paper outranks an older one in the same subject", () => {
    const current = paper({ id: "a", year: 2023 });
    const legacy = paper({ id: "b", year: 2010 });

    expect(relevanceScore(current, context())).toBeGreaterThan(relevanceScore(legacy, context()));
  });

  test("marking guidelines are pushed well below the papers they belong to", () => {
    const exam = paper({ id: "a" });
    const guide = paper({ id: "b", documentKind: "marking_guidelines" });

    expect(relevanceScore(guide, context())).toBeLessThan(relevanceScore(exam, context()));
  });

  test("an already-attempted paper drops behind an untried equal", () => {
    const untried = paper({ id: "a" });
    const attempted = paper({ id: "b" });

    expect(relevanceScore(attempted, context({ attemptedPaperIds: new Set(["b"]) })))
      .toBeLessThan(relevanceScore(untried, context()));
  });

  test("popularity is logarithmic, so a runaway paper cannot freeze the top of the list", () => {
    const modest = paper({ id: "a", saveCount: 10 });
    const huge = paper({ id: "b", saveCount: 10_000 });

    // Ten thousand saves is worth under twenty points, less than a syllabus-era mismatch.
    expect(relevanceScore(huge, context()) - relevanceScore(modest, context())).toBeLessThan(20);
  });
});

describe("sortPapers", () => {
  const papers = [
    paper({ id: "old", year: 2005 }),
    paper({ id: "new", year: 2024 }),
    paper({ id: "unrated", year: 2015 }),
    paper({
      id: "brutal",
      year: 2016,
      difficulty: { band: "brutal", confidence: 0.8, rationale: [], sources: [] },
    }),
    paper({
      id: "gentle",
      year: 2017,
      difficulty: { band: "gentle", confidence: 0.8, rationale: [], sources: [] },
    }),
  ];

  test("sorts by year in both directions", () => {
    expect(sortPapers(papers, "year-desc", context())[0].id).toBe("new");
    expect(sortPapers(papers, "year-asc", context())[0].id).toBe("old");
  });

  test("sorts by difficulty and keeps unrated papers off both extremes", () => {
    const ascending = sortPapers(papers, "difficulty-asc", context()).map((entry) => entry.id);

    expect(ascending[0]).toBe("gentle");
    expect(ascending[ascending.length - 1]).toBe("brutal");
    expect(ascending.indexOf("unrated")).toBeGreaterThan(0);
    expect(ascending.indexOf("unrated")).toBeLessThan(ascending.length - 1);
  });

  test("does not mutate the input", () => {
    const input = [...papers];
    sortPapers(input, "year-asc", context());
    expect(input.map((entry) => entry.id)).toEqual(papers.map((entry) => entry.id));
  });

  test("school sort puts official papers last rather than first", () => {
    const mixed = [paper({ id: "official", school: null }), paper({ id: "ruse", school: "James Ruse" })];
    expect(sortPapers(mixed, "school", context()).map((entry) => entry.id)).toEqual(["ruse", "official"]);
  });
});

describe("facets", () => {
  test("collects distinct schools and years", () => {
    const papers = [
      paper({ id: "a", school: "Ruse", year: 2020 }),
      paper({ id: "b", school: "Abbotsleigh", year: 2020 }),
      paper({ id: "c", school: null, year: 2019 }),
    ];

    expect(schoolsIn(papers)).toEqual(["Abbotsleigh", "Ruse"]);
    expect(yearsIn(papers)).toEqual([2019, 2020]);
  });
});
