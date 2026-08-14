import { describe, expect, test } from "vitest";

import {
  buildThscCatalogue,
  categoryForListingFile,
  classifyDocument,
  courseHintForListingFile,
  subjectNameFor,
  isOfficialHost,
  parseThscListing,
  parseThscSubjectFolders,
  parseTotalMarks,
  parseYear,
  resolveThscResources,
} from "./thsc.ts";

/** Trimmed verbatim from `yr12/Physics/hscpapers.html`, including the prose rows that precede it. */
const HSC_LISTING = `
<table class="listing"><tbody>
<tr class="content"><td><span style="color:#0000FF;"><b>Note: </b></span>Some materials listed are from old syllabus prescriptions.</td></tr>
<tr class="content"><td>
<ul><li>Sample answers or marking guidelines included with most papers.</li></ul></td></tr>
<tr><td>2001<br />
<span class="content">
<a href="#v" onclick="pdf(this, 6520)">2001 HSC</a><br />
<a href="#v" onclick="pdf(this, 6520)">2001 Marking Guidelines</a>
</span></td></tr>
<tr><td>2012<br />
<span class="content">
<a href="#v" onclick="pdf(this, 6520)">2012 HSC</a><br />
<a href="#v" onclick="pdf(this, 6520)">2012 Sample Answers</a><br />
<a href="#v" onclick="pdf(this, 6520)">2012 Marking Feedback</a>
</span></td></tr>
</tbody></table>
`;

/** Trimmed verbatim from `yr12/Physics/trialpapers.html`. */
const TRIAL_LISTING = `
<table class="listing"><tbody>
<tr class="search" id="search-row" style="display: none;"><td><input type="text" id="search-bar" /></td></tr>
<!-- BEGIN CONTENT 6528 --->
<tr><td>Abbotsleigh<br />
<span class="content">
<a href="#v" onClick="pdf(this, 6528)">Abbotsleigh 2023 w. sol</a><br />
<a href="#v" onClick="pdf(this, 6528)">Abbotsleigh 2025</a>
</span></td></tr>
<tr><td>Ascham<br />
<span class="content">
<a href="#v" onClick="pdf(this, 6528)">Ascham 2013 w. sol</a>
</span></td></tr>
</tbody></table>
`;

/** Trimmed verbatim from `yr12/index.html`. */
const SUBJECT_INDEX = `
<div id="web-grid"><div>
<div><a href="Agriculture/"><span>Agriculture</span></a></div>
<div><a href="Earth &amp; Environmental Science/"><span>Earth &amp; Environment Science</span></a></div>
<div><a href="Maths/"><span>Maths (2U)</span></a></div>
<div><a href="Maths/"><span>Maths Ext 2</span></a></div>
<div><a href="/s/yr11/"><span>Year 11</span></a></div>
</div></div>
`;

describe("parseThscSubjectFolders", () => {
  test("collects relative subject folders and de-duplicates shared ones", () => {
    expect(parseThscSubjectFolders(SUBJECT_INDEX)).toEqual([
      "Agriculture",
      "Earth & Environmental Science",
      "Maths",
    ]);
  });

  test("ignores absolute navigation links to other year levels", () => {
    expect(parseThscSubjectFolders(SUBJECT_INDEX)).not.toContain("/s/yr11");
  });
});

describe("parseThscListing", () => {
  test("reads every document under its group heading", () => {
    const entries = parseThscListing(HSC_LISTING);

    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual({ group: "2001", title: "2001 HSC", viewNumber: 6520 });
    expect(entries[4]).toEqual({ group: "2012", title: "2012 Marking Feedback", viewNumber: 6520 });
  });

  test("skips the maintainers' prose rows", () => {
    const groups = parseThscListing(HSC_LISTING).map((entry) => entry.group);
    expect(groups.every((group) => /^\d{4}$/.test(group))).toBe(true);
  });

  test("reads school groups from a trial listing, including the mixed-case handler", () => {
    const entries = parseThscListing(TRIAL_LISTING);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ group: "Abbotsleigh", title: "Abbotsleigh 2023 w. sol", viewNumber: 6528 });
    expect(entries[2].group).toBe("Ascham");
  });
});

describe("buildThscCatalogue", () => {
  const trialRows = buildThscCatalogue({
    yearLevel: "yr12",
    subjectFolder: "Physics",
    category: "trial",
    filename: "trialpapers.html",
    entries: parseThscListing(TRIAL_LISTING),
  });

  test("treats the group as a school on a trial listing", () => {
    expect(trialRows[0].school).toBe("Abbotsleigh");
    expect(trialRows[0].year).toBe(2023);
  });

  test("keeps a `w. sol` trial classified as a paper that carries its answers", () => {
    expect(trialRows[0].title).toBe("Abbotsleigh 2023 w. sol");
    expect(trialRows[0].documentKind).toBe("paper");
    expect(trialRows[0].bundledSolutions).toBe(true);
    expect(trialRows[1].bundledSolutions).toBe(false);
  });

  test("leaves school unset on an official HSC listing", () => {
    const rows = buildThscCatalogue({
      yearLevel: "yr12",
      subjectFolder: "Physics",
      category: "hsc",
      filename: "hscpapers.html",
      entries: parseThscListing(HSC_LISTING),
    });

    expect(rows[0].school).toBeNull();
    expect(rows[0].year).toBe(2001);
    expect(rows[0].documentKind).toBe("paper");
    expect(rows[1].documentKind).toBe("marking_guidelines");
  });

  test("gives every document its own key so a shared view number cannot collapse rows", () => {
    const keys = new Set(trialRows.map((row) => row.externalKey));
    expect(keys.size).toBe(trialRows.length);
  });

  test("splits a shared Maths folder into the specific course from the title", () => {
    const rows = buildThscCatalogue({
      yearLevel: "yr12",
      subjectFolder: "Maths",
      category: "hsc",
      filename: "hscpapers.html",
      entries: [{ group: "2023", title: "2023 HSC Ext 2", viewNumber: 1 }],
    });

    expect(rows[0].subjectSlug).toBe("maths-ext-2");
  });
});

describe("classifyDocument", () => {
  test.each([
    ["2001 HSC", "paper"],
    ["Abbotsleigh 2023 w. sol", "paper"],
    ["Physics Solutions", "solutions"],
    ["2013 Marking Guidelines", "marking_guidelines"],
    ["2009 Sample Answers", "sample_answers"],
    ["2012 Marking Feedback", "marking_feedback"],
    ["Physics Topic Notes", "notes"],
  ] as const)("reads %s as %s", (title, expected) => {
    expect(classifyDocument(title)).toBe(expected);
  });

  test("prefers the answer-bearing marker over the paper marker", () => {
    // "Trial Paper" would otherwise match the paper branch and open beside a running timer.
    expect(classifyDocument("2019 Trial Paper Marking Guidelines")).toBe("marking_guidelines");
  });
});

describe("parseYear", () => {
  test("takes the last plausible year so a school's founding date does not win", () => {
    expect(parseYear("St Foo 1885 Trial 2019")).toBe(2019);
  });

  test("returns null when nothing in range is present", () => {
    expect(parseYear("Topic test, 100 marks")).toBeNull();
  });
});

describe("resolveThscResources", () => {
  const entry = { title: "1995 HSC", viewNumber: 6520 };

  test("offers an official copy directly and marks it official", () => {
    const resources = resolveThscResources({
      "1995 HSC": [{
        display: "Board of Studies / NESA (official)",
        url: "https://www.boardofstudies.nsw.edu.au/hsc_exams/hsc2000exams/hsc00_physics/95PHYSIC.PDF",
        type: "official",
        default: true,
      }],
    }, entry);

    expect(resources[0].accessMode).toBe("direct");
    expect(resources[0].official).toBe(true);
  });

  test("degrades a site-relative mirror to a referral rather than a fetchable URL", () => {
    const resources = resolveThscResources({
      "1995 HSC": [{ display: "thsc mirror", url: "/s/em/hsc_exams/Physics/1995.pdf", default: true }],
    }, entry);

    expect(resources[0].accessMode).toBe("referral");
    expect(resources[0].url).toContain("/s/v/6520/");
  });

  test("ranks a direct official copy above the source's own preferred mirror", () => {
    const resources = resolveThscResources({
      "1995 HSC": [
        { display: "thsc mirror", url: "/s/em/hsc_exams/Physics/1995.pdf", default: true },
        { display: "Board of Studies", url: "https://www.boardofstudies.nsw.edu.au/x/95.PDF", default: false },
      ],
    }, entry);

    expect(resources[0].official).toBe(true);
    expect(resources[1].accessMode).toBe("referral");
  });

  test("falls back to a referral when the view number has no resource file", () => {
    const resources = resolveThscResources(null, entry);

    expect(resources).toHaveLength(1);
    expect(resources[0].accessMode).toBe("referral");
  });
});

describe("isOfficialHost", () => {
  test.each([
    ["https://www.boardofstudies.nsw.edu.au/a.pdf", true],
    ["https://educationstandards.nsw.edu.au/b.pdf", true],
    ["https://example.com/boardofstudies.nsw.edu.au/c.pdf", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(isOfficialHost(url)).toBe(expected);
  });
});

describe("categoryForListingFile", () => {
  test("maps the THSC listing pages onto catalogue categories", () => {
    expect(categoryForListingFile("hscpapers.html")).toBe("hsc");
    expect(categoryForListingFile("trialpapers.html")).toBe("trial");
    expect(categoryForListingFile("assessment-tasks.html")).toBe("assessment");
    expect(categoryForListingFile("prelimpapers.html")).toBe("prelim");
    expect(categoryForListingFile("index.html")).toBeNull();
    expect(categoryForListingFile("styles.css")).toBeNull();
  });

  test("reads the per-course listings, which are most of the site", () => {
    // Every maths, English, Studies of Religion and languages listing carries a suffix. Matching
    // whole filenames missed all of them.
    expect(categoryForListingFile("hscpapers_extension2.html")).toBe("hsc");
    expect(categoryForListingFile("trialpapers_paper2_standard.html")).toBe("trial");
    expect(categoryForListingFile("assessment-tasks_accelerated.html")).toBe("assessment");
    expect(categoryForListingFile("prelimpapers_general.html")).toBe("prelim");
    expect(categoryForListingFile("trialpapers_sor1.html")).toBe("trial");
    expect(categoryForListingFile("hscpapers_continuers.html")).toBe("hsc");
  });

  test("files a junior yearly and a competition archive under their own categories", () => {
    expect(categoryForListingFile("yr9papers.html")).toBe("yearly");
    expect(categoryForListingFile("yr10papers.html")).toBe("yearly");
    expect(categoryForListingFile("cp_imo.html")).toBe("other");
  });
});

describe("courseHintForListingFile", () => {
  test.each([
    ["hscpapers_extension2.html", "extension 2"],
    ["trialpapers_general.html", "standard"],
    ["trialpapers_paper2_advanced.html", "paper 2 advanced"],
    ["trialpapers_sor2.html", "studies of religion 2"],
    ["hscpapers_continuers.html", "continuers"],
    ["trialpapers.html", ""],
    // Accelerated says a student is a year ahead, not which course they sit.
    ["prelimpapers_accelerated.html", ""],
  ])("%s -> %s", (filename, expected) => {
    expect(courseHintForListingFile(filename)).toBe(expected);
  });
});

describe("subjectNameFor", () => {
  test("names a nested subject by its leaf", () => {
    expect(subjectNameFor("LOTE/Japanese")).toBe("Japanese");
    expect(subjectNameFor("Physics")).toBe("Physics");
  });

  test("keeps the parent when the leaf names a kind of paper, not a course", () => {
    expect(subjectNameFor("Maths/Competitions")).toBe("Maths Competitions");
  });
});

describe("course identification from the listing filename", () => {
  const rows = (filename: string, subjectFolder = "Maths") => buildThscCatalogue({
    yearLevel: "yr12",
    subjectFolder,
    category: categoryForListingFile(filename)!,
    filename,
    entries: [{ group: "James Ruse", title: "James Ruse 2022", viewNumber: 1 }],
  });

  test("identifies the course a school trial never states", () => {
    // "James Ruse 2022" says nothing; the listing it sits in says Extension 2.
    expect(rows("trialpapers_extension2.html")[0].subjectSlug).toBe("maths-ext-2");
    expect(rows("trialpapers_general.html")[0].subjectSlug).toBe("maths-standard");
    expect(rows("trialpapers_paper2_standard.html", "English")[0].subjectSlug).toBe("english-standard");
    expect(rows("trialpapers_sor1.html", "Studies of Religion")[0].subjectSlug).toBe("studies-of-religion-1");
    expect(rows("hscpapers_continuers.html", "LOTE/Japanese")[0].subjectSlug).toBe("japanese-continuers");
  });

  test("separates two courses listed under one folder with one view number", () => {
    const advanced = rows("trialpapers_advanced.html")[0];
    const extension = rows("trialpapers_extension1.html")[0];

    expect(advanced.externalKey).not.toBe(extension.externalKey);
    expect(advanced.subjectSlug).toBe("maths-advanced");
    expect(extension.subjectSlug).toBe("maths-ext-1");
  });

  test("points the source URL at the nested folder it came from", () => {
    expect(rows("hscpapers_continuers.html", "LOTE/Japanese")[0].sourceUrl)
      .toBe("https://thsconline.github.io/s/yr12/LOTE/Japanese/hscpapers_continuers.html");
  });
});

describe("parseTotalMarks", () => {
  test.each([
    ["Sydney Boys 2019 Trial (100 marks)", 100],
    ["Barker 2021 Task 3 - 55 marks", 55],
    ["2018 Assessment, marks: 40", 40],
    ["2023 HSC Paper 1 70 Marks", 70],
  ])("%s -> %s", (title, expected) => {
    expect(parseTotalMarks(title)).toBe(expected);
  });

  test("ignores numbers that are not marks", () => {
    // The year is the number a naive "largest number wins" reader would take.
    expect(parseTotalMarks("James Ruse 2019 Trial")).toBeNull();
    expect(parseTotalMarks("Paper 2")).toBeNull();
  });

  test("rejects totals outside a believable range", () => {
    // A single-figure "mark" is a question allocation caught by a stray match, and a four-figure
    // one is a page or view number sitting next to the word.
    expect(parseTotalMarks("Question 4 marks")).toBeNull();
    expect(parseTotalMarks("Archive 4000 marks")).toBeNull();
  });
});
