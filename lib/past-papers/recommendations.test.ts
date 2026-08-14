import { describe, expect, test } from "vitest";

import type { PastPaper } from "./domain.ts";
import { pickForYou, type RecommendationContext } from "./recommendations.ts";
import { SYLLABUS_ERAS } from "./taxonomy.ts";

const paper = (overrides: Partial<PastPaper> = {}): PastPaper => ({
  id: "p1",
  sourceSlug: "nesa",
  externalKey: "k",
  yearLevel: "yr12",
  category: "hsc",
  subject: "Physics",
  subjectSlug: "physics",
  school: null,
  year: 2024,
  title: "2024 HSC",
  documentKind: "paper",
  resources: [],
  hasSolutions: true,
  syllabusEraId: "nsw-current",
  durationMinutes: 180,
  readingMinutes: 5,
  durationSource: "subject-default",
  totalMarks: 100,
  marksSource: "subject-default",
  difficulty: null,
  tags: [],
  sourceUrl: "https://example.invalid",
  indexedAt: "2026-01-01T00:00:00.000Z",
  saveCount: 0,
  attemptCount: 0,
  ...overrides,
});

const context = (overrides: Partial<RecommendationContext> = {}): RecommendationContext => ({
  yearLevel: "yr12",
  enrolledSubjectSlugs: ["physics", "chemistry"],
  standings: [],
  attemptedPaperIds: new Set(),
  savedPaperIds: new Set(),
  currentYear: 2026,
  eras: SYLLABUS_ERAS,
  ...overrides,
});

describe("eligibility", () => {
  test("never recommends a subject the student does not take", () => {
    const papers = [paper({ id: "a", subjectSlug: "ancient-history", saveCount: 9999 })];
    expect(pickForYou(papers, context())).toHaveLength(0);
  });

  test("never recommends an answer document", () => {
    const papers = [paper({ id: "a", documentKind: "marking_guidelines" })];
    expect(pickForYou(papers, context())).toHaveLength(0);
  });

  test("never recommends a paper already attempted", () => {
    const papers = [paper({ id: "a" })];
    expect(pickForYou(papers, context({ attemptedPaperIds: new Set(["a"]) }))).toHaveLength(0);
  });

  test("never recommends another year level's paper", () => {
    const papers = [paper({ id: "a", yearLevel: "yr11" })];
    expect(pickForYou(papers, context())).toHaveLength(0);
  });
});

describe("scoring", () => {
  test("prefers a current-syllabus paper over an older one", () => {
    const picks = pickForYou([
      paper({ id: "old", year: 2012 }),
      paper({ id: "new", year: 2024 }),
    ], context());

    expect(picks[0].paper.id).toBe("new");
  });

  test("prefers a paper whose answers exist", () => {
    const picks = pickForYou([
      paper({ id: "no-answers", hasSolutions: false }),
      paper({ id: "answers", hasSolutions: true }),
    ], context());

    expect(picks[0].paper.id).toBe("answers");
  });

  test("gives every pick a reason", () => {
    const picks = pickForYou([paper({ id: "a" })], context());
    expect(picks[0].reason.length).toBeGreaterThan(0);
  });

  test("surfaces a subject with no attempts, and says so", () => {
    const picks = pickForYou([
      paper({ id: "phys", subjectSlug: "physics" }),
      paper({ id: "chem", subject: "Chemistry", subjectSlug: "chemistry" }),
    ], context({
      standings: [
        { subjectSlug: "physics", retention: 0.95, reviewCount: 200, attempts: 6, meanRating: 3 },
        { subjectSlug: "chemistry", retention: null, reviewCount: 0, attempts: 0, meanRating: null },
      ],
    }));

    expect(picks[0].paper.id).toBe("chem");
    expect(picks[0].reason).toContain("not sat a paper in this subject yet");
  });

  test("treats a thin review history as unknown rather than as weakness", () => {
    const thin = pickForYou([paper({ id: "a" })], context({
      standings: [{ subjectSlug: "physics", retention: 0.2, reviewCount: 3, attempts: 1, meanRating: 3 }],
    }));
    const none = pickForYou([paper({ id: "a" })], context({
      standings: [{ subjectSlug: "physics", retention: null, reviewCount: 0, attempts: 1, meanRating: 3 }],
    }));

    // Three reviews at 20% must not score as a crisis; it must score as no information.
    expect(thin[0].score).toBeCloseTo(none[0].score, 5);
  });

  test("calls out slipped recall when there is enough review history to say so", () => {
    const picks = pickForYou([paper({ id: "a" })], context({
      standings: [{ subjectSlug: "physics", retention: 0.4, reviewCount: 150, attempts: 3, meanRating: 3 }],
    }));

    expect(picks[0].reason).toContain("recall");
  });

  test("pitches a struggling student below a comfortable one", () => {
    const papers = [
      paper({ id: "gentle", difficulty: { band: "gentle", confidence: 0.9, rationale: [], sources: [] } }),
      paper({ id: "brutal", difficulty: { band: "brutal", confidence: 0.9, rationale: [], sources: [] } }),
    ];

    const struggling = pickForYou(papers, context({
      standings: [{ subjectSlug: "physics", retention: 0.3, reviewCount: 150, attempts: 2, meanRating: 4.5 }],
    }));
    const comfortable = pickForYou(papers, context({
      standings: [{ subjectSlug: "physics", retention: 0.95, reviewCount: 150, attempts: 4, meanRating: 1.5 }],
    }));

    expect(struggling[0].paper.id).toBe("gentle");
    expect(comfortable[0].paper.id).toBe("brutal");
  });
});

describe("diversity", () => {
  test("shows every enrolled subject before any subject takes a second slot", () => {
    const papers = [
      ...Array.from({ length: 8 }, (_, index) =>
        paper({ id: `phys-${index}`, subjectSlug: "physics", saveCount: 1000 })),
      paper({ id: "chem-0", subject: "Chemistry", subjectSlug: "chemistry" }),
    ];

    const picks = pickForYou(papers, context(), 4);
    expect(picks.slice(0, 2).map((pick) => pick.paper.subjectSlug)).toContain("chemistry");
  });

  test("splits the row evenly when two subjects both have plenty of papers", () => {
    const papers = Array.from({ length: 20 }, (_, index) =>
      paper({ id: `phys-${index}`, subjectSlug: "physics", saveCount: 1000 }));
    const chem = Array.from({ length: 20 }, (_, index) =>
      paper({ id: `chem-${index}`, subject: "Chemistry", subjectSlug: "chemistry" }));

    const picks = pickForYou([...papers, ...chem], context(), 12);
    const physicsCount = picks.filter((pick) => pick.paper.subjectSlug === "physics").length;

    // A subject with more papers and far more saves must not be able to buy extra slots.
    expect(physicsCount).toBe(6);
  });

  test("keeps the split even across four subjects", () => {
    const subjects = ["physics", "chemistry", "biology", "maths-advanced"];
    const papers = subjects.flatMap((slug) =>
      Array.from({ length: 10 }, (_, index) => paper({ id: `${slug}-${index}`, subjectSlug: slug })));

    const picks = pickForYou(papers, context({ enrolledSubjectSlugs: subjects }), 12);
    const counts = subjects.map((slug) =>
      picks.filter((pick) => pick.paper.subjectSlug === slug).length);

    expect(counts).toEqual([3, 3, 3, 3]);
  });

  test("still fills the row when only one subject has papers", () => {
    const papers = Array.from({ length: 20 }, (_, index) =>
      paper({ id: `phys-${index}`, subjectSlug: "physics" }));

    expect(pickForYou(papers, context(), 12)).toHaveLength(12);
  });

  test("never repeats a paper", () => {
    const papers = Array.from({ length: 30 }, (_, index) =>
      paper({ id: `phys-${index}`, subjectSlug: "physics" }));
    const picks = pickForYou(papers, context(), 12);

    expect(new Set(picks.map((pick) => pick.paper.id)).size).toBe(picks.length);
  });
});
