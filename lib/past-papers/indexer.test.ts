import { describe, expect, test } from "vitest";

import { indexThsc, parseThscTree } from "./indexer.ts";

const SUBJECT_INDEX = `<div><a href="Physics/"><span>Physics</span></a></div>`;

const HSC_LISTING = `
<table class="listing"><tbody>
<tr class="content"><td>Note: some materials are from old syllabus prescriptions.</td></tr>
<tr><td>2023<br /><span class="content">
<a href="#v" onclick="pdf(this, 6520)">2023 HSC</a><br />
<a href="#v" onclick="pdf(this, 6520)">2023 Marking Guidelines</a>
</span></td></tr>
<tr><td>2010<br /><span class="content">
<a href="#v" onclick="pdf(this, 6520)">2010 HSC</a>
</span></td></tr>
</tbody></table>`;

const TRIAL_LISTING = `
<table class="listing"><tbody>
<tr><td>James Ruse<br /><span class="content">
<a href="#v" onClick="pdf(this, 6528)">James Ruse 2022 w. sol</a><br />
<a href="#v" onClick="pdf(this, 6528)">James Ruse 2021</a>
</span></td></tr>
</tbody></table>`;

const RESOURCES = `\uFEFF{
  "2023 HSC": [
    { "display": "NESA (official)", "url": "https://educationstandards.nsw.edu.au/physics-2023.pdf", "default": true }
  ]
}`;

function fixtureFetch(overrides: Record<string, string | null> = {}) {
  const calls: string[] = [];
  const fetchText = async (url: string): Promise<string | null> => {
    calls.push(url);
    for (const [fragment, body] of Object.entries(overrides)) {
      if (url.includes(fragment)) return body;
    }
    if (url.endsWith("yr12/index.html")) return SUBJECT_INDEX;
    if (url.includes("Physics/hscpapers.html")) return HSC_LISTING;
    if (url.includes("Physics/trialpapers.html")) return TRIAL_LISTING;
    if (url.includes("index/6520.json")) return RESOURCES;
    return null;
  };
  return { fetchText, calls };
}

describe("parseThscTree", () => {
  test("keeps only listing pages inside a year level", () => {
    const listings = parseThscTree(JSON.stringify({
      tree: [
        { path: "yr12/Maths/hscpapers_advanced.html", type: "blob" },
        { path: "yr12/LOTE/Japanese/index.html", type: "blob" },
        { path: "yr12/index.html", type: "blob" },
        { path: "index/6520.json", type: "blob" },
        { path: "yr12/Maths", type: "tree" },
      ],
    }));

    expect(listings).toEqual([
      { yearLevel: "yr12", subjectPath: "Maths", filename: "hscpapers_advanced.html" },
    ]);
  });

  test("returns null on a body that is not a tree, so the walk can degrade", () => {
    expect(parseThscTree("{ not json")).toBeNull();
    expect(parseThscTree(JSON.stringify({ message: "API rate limit exceeded" }))).toBeNull();
  });
});

describe("indexThsc", () => {
  test("walks a year level into catalogue rows", async () => {
    const { fetchText } = fixtureFetch();
    const result = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    expect(result.sourceSlug).toBe("thsc");
    expect(result.papers).toHaveLength(5);
    expect(result.papers.map((paper) => paper.title)).toEqual([
      "2023 HSC",
      "2023 Marking Guidelines",
      "2010 HSC",
      "James Ruse 2022 w. sol",
      "James Ruse 2021",
    ]);
  });

  test("resolves an official URL to a directly fetchable resource", async () => {
    const { fetchText } = fixtureFetch();
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });
    const hsc = papers.find((paper) => paper.title === "2023 HSC");

    expect(hsc?.resources[0]).toMatchObject({ accessMode: "direct", official: true });
  });

  test("falls back to a referral when a view number has no resource file", async () => {
    const { fetchText } = fixtureFetch();
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });
    const trial = papers.find((paper) => paper.title === "James Ruse 2021");

    expect(trial?.resources[0]).toMatchObject({ accessMode: "referral" });
    expect(trial?.resources[0].url).toContain("/s/v/6528/");
  });

  test("marks a paper as having solutions when a companion guidelines row exists", async () => {
    const { fetchText } = fixtureFetch();
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    expect(papers.find((paper) => paper.title === "2023 HSC")?.hasSolutions).toBe(true);
    // 2010 has no companion in the fixture.
    expect(papers.find((paper) => paper.title === "2010 HSC")?.hasSolutions).toBe(false);
  });

  test("counts a bundled `w. sol` trial as having solutions without a companion row", async () => {
    const { fetchText } = fixtureFetch();
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });
    const bundled = papers.find((paper) => paper.title === "James Ruse 2022 w. sol");

    expect(bundled).toMatchObject({ documentKind: "paper", bundledSolutions: true, hasSolutions: true });
  });

  test("assigns the syllabus era each paper's year falls in", async () => {
    const { fetchText } = fixtureFetch();
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    expect(papers.find((paper) => paper.title === "2023 HSC")?.syllabusEraId).toBe("nsw-current");
    expect(papers.find((paper) => paper.title === "2010 HSC")?.syllabusEraId).toBe("nsw-2001");
  });

  test("seeds the official course allowance and says it was not read from the paper", async () => {
    const { fetchText } = fixtureFetch();
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    expect(papers[0]).toMatchObject({
      durationMinutes: 180,
      readingMinutes: 5,
      durationSource: "subject-default",
    });
  });

  test("fetches each view number's resource file once, not once per row", async () => {
    const { fetchText, calls } = fixtureFetch();
    await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    expect(calls.filter((url) => url.includes("index/6520.json"))).toHaveLength(1);
  });

  test("leaves a junior paper without an HSC era or an HSC allowance", async () => {
    const { fetchText } = fixtureFetch({
      "yr10/index.html": SUBJECT_INDEX,
      "Physics/trialpapers.html": null,
      "Physics/hscpapers.html": null,
      "Physics/assessment-tasks.html": TRIAL_LISTING,
    });
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr10"], delayMs: 0 });

    expect(papers.length).toBeGreaterThan(0);
    // A three-hour HSC allowance on a junior assessment would start the timer at roughly double.
    expect(papers[0]).toMatchObject({
      yearLevel: "yr10",
      syllabusEraId: null,
      durationMinutes: null,
      durationSource: "unknown",
    });
  });

  test("continues past a year level with no index page and records it", async () => {
    const { fetchText } = fixtureFetch();
    const result = await indexThsc({ fetchText, yearLevels: ["yr9", "yr12"], delayMs: 0 });

    expect(result.warnings).toContain("No index page for yr9");
    expect(result.papers.length).toBeGreaterThan(0);
  });

  test("produces a unique key per row so a re-run updates rather than duplicates", async () => {
    const { fetchText } = fixtureFetch();
    const first = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });
    const second = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    const keys = first.papers.map((paper) => paper.externalKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(second.papers.map((paper) => paper.externalKey)).toEqual(keys);
  });

  test("survives a malformed resource file by falling back to a referral", async () => {
    const { fetchText } = fixtureFetch({ "index/6520.json": "{ not json" });
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    expect(papers[0].resources[0].accessMode).toBe("referral");
  });

  test("keeps a junior yearly out of the trial category", async () => {
    const tree = JSON.stringify({ tree: [{ path: "yr9/Maths/yr9papers.html", type: "blob" }] });
    const { fetchText } = fixtureFetch({ "api.github.com": tree, "yr9papers.html": TRIAL_LISTING });
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr9"], delayMs: 0 });

    expect(papers[0]).toMatchObject({ yearLevel: "yr9", category: "yearly", school: "James Ruse" });
  });

  test("records a listing it could read but could not parse", async () => {
    const { fetchText } = fixtureFetch({ "Physics/hscpapers.html": "<table></table>" });
    const result = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    expect(result.warnings.some((warning) => warning.includes("hscpapers.html"))).toBe(true);
  });
  test("fills a senior paper's marks from the course total and labels the source", async () => {
    const { fetchText } = fixtureFetch();
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    const paper = papers.find((entry) => entry.title === "2023 HSC");
    expect(paper?.totalMarks).toBe(100);
    expect(paper?.marksSource).toBe("subject-default");
  });

  test("leaves a marking guidelines document with no total of its own", async () => {
    const { fetchText } = fixtureFetch();
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    const guidelines = papers.find((entry) => entry.title === "2023 Marking Guidelines");
    expect(guidelines?.totalMarks).toBeNull();
    expect(guidelines?.marksSource).toBe("unknown");
  });

  test("reads every listing the tree names, including nested and per-course pages", async () => {
    const tree = JSON.stringify({
      tree: [
        { path: "yr12/Maths/hscpapers_extension2.html", type: "blob" },
        { path: "yr12/LOTE/Japanese/trialpapers_continuers.html", type: "blob" },
        { path: "yr12/Physics/index.html", type: "blob" },
        { path: "yr12/Physics", type: "tree" },
        { path: "styles.css", type: "blob" },
      ],
    });
    const { fetchText, calls } = fixtureFetch({
      "api.github.com": tree,
      "hscpapers_extension2.html": HSC_LISTING,
      "trialpapers_continuers.html": TRIAL_LISTING,
    });
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    // The old walk asked for five fixed filenames per top-level folder, so neither of these pages
    // was ever requested.
    expect(papers.map((paper) => paper.subjectSlug)).toContain("maths-ext-2");
    expect(papers.map((paper) => paper.subject)).toContain("Japanese");
    // An index page is not a listing, and a repository file outside a year level is not either.
    expect(calls.some((url) => url.endsWith("Physics/index.html"))).toBe(false);
    expect(calls.some((url) => url.endsWith("styles.css"))).toBe(false);
  });

  test("falls back to the year index pages when the tree cannot be read", async () => {
    const { fetchText } = fixtureFetch({ "api.github.com": null });
    const result = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    expect(result.warnings.some((warning) => warning.includes("repository tree"))).toBe(true);
    expect(result.papers.length).toBeGreaterThan(0);
  });

  test("fetches a shared resource file once across the whole run", async () => {
    const tree = JSON.stringify({
      tree: [
        { path: "yr12/Physics/hscpapers.html", type: "blob" },
        { path: "yr11/Physics/prelimpapers.html", type: "blob" },
      ],
    });
    const { fetchText, calls } = fixtureFetch({
      "api.github.com": tree,
      "prelimpapers.html": HSC_LISTING,
    });
    await indexThsc({ fetchText, yearLevels: ["yr11", "yr12"], delayMs: 0 });

    expect(calls.filter((url) => url.includes("index/6520.json"))).toHaveLength(1);
  });

  test("prefers a total stated in the listing title over the course default", async () => {
    const listing = `
<table class="listing"><tbody>
<tr><td>Ruse<br /><span class="content">
<a href="#v" onclick="pdf(this, 6528)">Ruse 2022 Trial (84 marks)</a>
</span></td></tr>
</tbody></table>`;
    const { fetchText } = fixtureFetch({ "Physics/trialpapers.html": listing });
    const { papers } = await indexThsc({ fetchText, yearLevels: ["yr12"], delayMs: 0 });

    const trial = papers.find((entry) => entry.title.startsWith("Ruse 2022"));
    expect(trial?.totalMarks).toBe(84);
    expect(trial?.marksSource).toBe("title");
  });
});
