import { describe, expect, test } from "vitest";

import { isSafeCorpusPath, parseManifest, toCorpusPaper } from "./corpus.ts";

/** Keys taken verbatim from the scraper's own manifest. */
const MANIFEST = {
  "physics|2023|hsc|NESA||https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2023-hsc-physics.pdf":
    "downloads/physics/hsc/2023_Physics_NESA_hsc.pdf",
  "physics|2023|marking|NESA||https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2023-hsc-physics-mg.pdf":
    "downloads/physics/marking/2023_Physics_NESA_marking.pdf",
  "maths_extension2|2019|trial|THSC|James Ruse|https://script.google.com/macros/s/x/exec?id=1":
    "downloads/maths_extension2/trial/2019_Mathematics_Extension_2_James_Ruse_THSC_trial.pdf",
  "chemistry|2016|internal|THSC|Barker|https://script.google.com/macros/s/x/exec?id=2":
    "downloads/chemistry/internal/2016_Chemistry_Barker_THSC_internal.pdf",
};

describe("parseManifest", () => {
  test("reads every entry", () => {
    expect(parseManifest(MANIFEST)).toHaveLength(4);
  });

  test("splits the uid into its parts", () => {
    const entry = parseManifest(MANIFEST)[0];

    expect(entry).toMatchObject({
      subjectKey: "physics",
      year: 2023,
      paperType: "hsc",
      source: "NESA",
      school: null,
      localPath: "downloads/physics/hsc/2023_Physics_NESA_hsc.pdf",
    });
  });

  test("keeps a URL containing a pipe intact", () => {
    // An unbounded split would truncate the query string and leave a resource pointing nowhere.
    const entries = parseManifest({
      "physics|2020|hsc|NESA||https://example.invalid/a.pdf?x=1|2": "downloads/a.pdf",
    });

    expect(entries[0].url).toBe("https://example.invalid/a.pdf?x=1|2");
  });

  test("reads the school from a trial key", () => {
    const trial = parseManifest(MANIFEST).find((entry) => entry.paperType === "trial");
    expect(trial?.school).toBe("James Ruse");
  });

  test("ignores entries whose value is not a path", () => {
    expect(parseManifest({ "physics|2020|hsc|NESA||https://a": 42 as unknown as string })).toHaveLength(0);
  });

  test("ignores a malformed key", () => {
    expect(parseManifest({ "physics|2020": "downloads/a.pdf" })).toHaveLength(0);
  });
});

describe("toCorpusPaper", () => {
  const papers = parseManifest(MANIFEST)
    .map(toCorpusPaper)
    .filter((paper): paper is NonNullable<typeof paper> => paper !== null);

  test("maps a scraper subject key onto the catalogue slug", () => {
    const ext2 = papers.find((paper) => paper.school === "James Ruse");

    expect(ext2?.subjectSlug).toBe("maths-ext-2");
    expect(ext2?.subject).toBe("Mathematics Extension 2");
  });

  test("separates category from document kind", () => {
    const guidelines = papers.find((paper) => paper.documentKind === "marking_guidelines");

    // `marking` is a kind of document attached to an HSC paper, not a category of its own.
    expect(guidelines?.category).toBe("hsc");
  });

  test("maps an internal assessment onto the assessment category", () => {
    const internal = papers.find((paper) => paper.school === "Barker");
    expect(internal?.category).toBe("assessment");
  });

  test("builds a readable title rather than reusing the filename", () => {
    expect(papers[0].title).toBe("2023 HSC Physics");
    expect(papers.find((paper) => paper.school === "James Ruse")?.title)
      .toBe("2019 James Ruse Mathematics Extension 2 Trial");
    expect(papers.find((paper) => paper.documentKind === "marking_guidelines")?.title)
      .toBe("2023 HSC Physics Marking Guidelines");
  });

  test("every paper is directly available, with no referral path", () => {
    // The whole corpus is held locally; nothing sends a student to another site.
    expect(papers.every((paper) => paper.resources[0].accessMode === "direct")).toBe(true);
  });

  test("carries the local path as the resource, not the original URL", () => {
    expect(papers[0].resources[0].url).toBe("downloads/physics/hsc/2023_Physics_NESA_hsc.pdf");
    expect(papers[0].sourceUrl).toContain("nsw.gov.au");
  });

  test("marks a NESA copy official and a school copy not", () => {
    expect(papers[0].resources[0].official).toBe(true);
    expect(papers.find((paper) => paper.school === "James Ruse")?.resources[0].official).toBe(false);
  });

  test("keys on the stable parts, so a re-scrape at a new URL updates rather than duplicates", () => {
    const first = toCorpusPaper(parseManifest(MANIFEST)[0])!;
    const moved = toCorpusPaper(parseManifest({
      "physics|2023|hsc|NESA||https://www.nsw.gov.au/somewhere-else/2023-hsc-physics.pdf":
        "downloads/physics/hsc/2023_Physics_NESA_hsc.pdf",
    })[0])!;

    expect(moved.externalKey).toBe(first.externalKey);
  });

  test("gives two documents of one kind, year and school separate rows", () => {
    // "Hurlstone 2006" and "Hurlstone 2006 w. sol" agree on subject, year, type, source and
    // school. Keyed on those alone the second replaced the first, and 910 documents had no row.
    const [plain, withSolutions] = parseManifest({
      "physics|2006|internal|THSC|Hurlstone|https://script.google.com/x/exec?field=Hurlstone+2006": {
        path: "downloads/physics/internal/2006_Physics_Hurlstone_THSC_internal_Hurlstone_2006_aa11bb22.pdf",
        document: "Hurlstone 2006",
      },
      "physics|2006|internal|THSC|Hurlstone|https://script.google.com/x/exec?field=Hurlstone+2006+w.+sol": {
        path: "downloads/physics/internal/2006_Physics_Hurlstone_THSC_internal_Hurlstone_2006_w_sol_cc33dd44.pdf",
        document: "Hurlstone 2006 w. sol",
      },
    }).map(toCorpusPaper);

    expect(plain!.externalKey).not.toBe(withSolutions!.externalKey);
  });

  test("falls back to the filename when an entry predates the document label", () => {
    const [entry] = parseManifest({
      "physics|2006|internal|THSC|Hurlstone|https://script.google.com/x/exec?field=Hurlstone+2006":
        "downloads/physics/internal/2006_Physics_Hurlstone_THSC_internal_Hurlstone_2006_aa11bb22.pdf",
    });

    expect(toCorpusPaper(entry)!.externalKey)
      .toContain("2006_physics_hurlstone_thsc_internal_hurlstone_2006_aa11bb22");
  });

  test("skips an unknown paper type rather than guessing", () => {
    expect(toCorpusPaper({
      subjectKey: "physics", year: 2020, paperType: "mystery",
      source: "X", school: null, url: "https://a", localPath: "downloads/a.pdf",
      yearLevel: null, category: null, subjectName: null, document: null,
    })).toBeNull();
  });
});

describe("junior and preliminary coverage", () => {
  /** The scraper's richer manifest value, which the uid alone cannot carry. */
  const JUNIOR_MANIFEST = {
    "yr9_maths|2018|yearly|THSC|James Ruse|https://script.google.com/macros/s/x/exec?id=9": {
      path: "downloads/yr9_maths/yearly/2018_Mathematics_Year_9_James_Ruse_THSC_yearly.pdf",
      year_level: "yr9",
      category: "yearly",
      subject: "Mathematics (Year 9)",
    },
    "biology|2021|prelim|THSC|Abbotsleigh|https://script.google.com/macros/s/x/exec?id=8": {
      path: "downloads/biology/prelim/2021_Biology_Abbotsleigh_THSC_prelim.pdf",
      year_level: "yr11",
      category: "prelim",
    },
    "biology|2021|marking|THSC|Abbotsleigh|https://script.google.com/macros/s/x/exec?id=7": {
      path: "downloads/biology/marking/2021_Biology_Abbotsleigh_THSC_marking.pdf",
      year_level: "yr11",
      category: "prelim",
    },
  };

  const papers = parseManifest(JUNIOR_MANIFEST)
    .map(toCorpusPaper)
    .filter((paper): paper is NonNullable<typeof paper> => paper !== null);

  test("takes the year level from the manifest rather than assuming Year 12", () => {
    expect(papers.map((paper) => paper.yearLevel)).toEqual(["yr9", "yr11", "yr11"]);
  });

  test("files a Year 9 yearly under its own category", () => {
    expect(papers[0].category).toBe("yearly");
    expect(papers[0].subjectSlug).toBe("junior-maths");
    expect(papers[0].title).toBe("2018 James Ruse Mathematics (Year 9) Yearly");
  });

  test("keeps a preliminary marking guideline in the preliminary category", () => {
    // The paper type alone would file it under `hsc`, which is where it used to land.
    expect(papers[2]).toMatchObject({ category: "prelim", documentKind: "marking_guidelines" });
  });

  test("still reads a plain string value as a Year 12 paper", () => {
    const [entry] = parseManifest({
      "physics|2023|hsc|NESA||https://a/2023.pdf": "downloads/physics/hsc/2023.pdf",
    });

    expect(entry.yearLevel).toBeNull();
    expect(toCorpusPaper(entry)?.yearLevel).toBe("yr12");
  });

  test("drops a metadata field the vocabulary does not know rather than the whole row", () => {
    const [entry] = parseManifest({
      "physics|2023|hsc|NESA||https://a/2023.pdf": { path: "downloads/a.pdf", year_level: "yr13", category: "made-up" },
    });

    expect(entry).toMatchObject({ localPath: "downloads/a.pdf", yearLevel: null, category: null });
  });

  test("keeps NESA's marking-centre notes as an answer-bearing document", () => {
    // 777 of the catalogue's documents are these. Without the mapping they were dropped as an
    // unknown paper type; filed as papers they would open beside a running timer.
    const [entry] = parseManifest({
      "physics|2018|feedback|NESA||https://educationstandards.nsw.edu.au/a/2018-hsc-physics-nmc.pdf":
        "downloads/physics/feedback/2018_Physics_NESA_feedback.pdf",
    });
    const paper = toCorpusPaper(entry);

    expect(paper).toMatchObject({ documentKind: "marking_feedback", category: "hsc" });
    expect(paper?.title).toBe("2018 HSC Physics Notes from the Marking Centre");
  });

  test("ignores an object value with no path", () => {
    expect(parseManifest({ "physics|2023|hsc|NESA||https://a": { year_level: "yr12" } })).toHaveLength(0);
  });
});

describe("isSafeCorpusPath", () => {
  test("accepts a normal manifest path", () => {
    expect(isSafeCorpusPath("downloads/physics/hsc/2023.pdf")).toBe(true);
  });

  test("refuses traversal, absolute paths and drive letters", () => {
    expect(isSafeCorpusPath("../../etc/passwd.pdf")).toBe(false);
    expect(isSafeCorpusPath("downloads/../../secret.pdf")).toBe(false);
    expect(isSafeCorpusPath("/etc/passwd.pdf")).toBe(false);
    expect(isSafeCorpusPath("C:\\secret.pdf")).toBe(false);
    expect(isSafeCorpusPath("downloads\\..\\secret.pdf")).toBe(false);
  });

  test("refuses anything that is not a PDF", () => {
    expect(isSafeCorpusPath("downloads/physics/notes.txt")).toBe(false);
    expect(isSafeCorpusPath("downloads/a.pdf\u0000.txt")).toBe(false);
  });

  test("refuses an empty path", () => {
    expect(isSafeCorpusPath("")).toBe(false);
  });
});
