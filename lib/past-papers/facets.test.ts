import { describe, expect, test } from "vitest";

import { normaliseFacets } from "./repository.ts";

/**
 * The filter row is built from these. It used to be folded from a plain select, which PostgREST
 * caps at 1,000 rows without saying so — the browser showed 7 of 106 subjects and 59 of 574
 * schools, with counts an order of magnitude short, and looked entirely plausible doing it.
 */
describe("normaliseFacets", () => {
  const payload = {
    subjects: [
      { slug: "physics", label: "Physics", count: 314 },
      { slug: "maths-ext-2", label: "Mathematics Extension 2", count: 1149 },
    ],
    schools: ["Abbotsleigh", "James Ruse"],
    years: [1990, 2025],
  };

  test("reads the aggregate the database returns", () => {
    expect(normaliseFacets(payload)).toEqual({
      subjects: [
        { slug: "physics", label: "Physics", count: 314 },
        { slug: "maths-ext-2", label: "Mathematics Extension 2", count: 1149 },
      ],
      schools: ["Abbotsleigh", "James Ruse"],
      years: [1990, 2025],
    });
  });

  test("accepts a count arriving as a string, which is how bigint serialises", () => {
    const [subject] = normaliseFacets({ subjects: [{ slug: "physics", count: "314" }] }).subjects;
    expect(subject).toEqual({ slug: "physics", label: "physics", count: 314 });
  });

  test("drops entries it cannot use rather than the whole filter row", () => {
    const facets = normaliseFacets({
      subjects: [{ label: "no slug" }, { slug: "physics", label: "Physics", count: 1 }],
      schools: ["Ascham", "", 42],
      years: [2001, "not a year"],
    });

    expect(facets.subjects).toHaveLength(1);
    expect(facets.schools).toEqual(["Ascham"]);
    expect(facets.years).toEqual([2001]);
  });

  test("survives an empty or malformed payload", () => {
    const empty = { subjects: [], schools: [], years: [] };
    expect(normaliseFacets(null)).toEqual(empty);
    expect(normaliseFacets("nonsense")).toEqual(empty);
    expect(normaliseFacets({})).toEqual(empty);
  });
});
