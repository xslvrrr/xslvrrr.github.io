import { describe, expect, test } from "vitest";

import { documentStoragePath, fetchableResource, isAllowedDocumentHost } from "./documents.ts";
import type { PaperResource, PastPaper } from "./domain.ts";

describe("isAllowedDocumentHost", () => {
  test("accepts the official publishers over https", () => {
    expect(isAllowedDocumentHost("https://www.boardofstudies.nsw.edu.au/a.pdf")).toBe(true);
    expect(isAllowedDocumentHost("https://educationstandards.nsw.edu.au/b.pdf")).toBe(true);
  });

  test("rejects a host that merely ends with an allowed name", () => {
    // The classic bypass: a registered domain that is a suffix-lookalike.
    expect(isAllowedDocumentHost("https://evil-boardofstudies.nsw.edu.au/a.pdf")).toBe(false);
  });

  test("rejects an allowed name used as a subdomain of an attacker's domain", () => {
    expect(isAllowedDocumentHost("https://boardofstudies.nsw.edu.au.attacker.com/a.pdf")).toBe(false);
  });

  test("rejects internal and metadata addresses outright", () => {
    expect(isAllowedDocumentHost("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedDocumentHost("https://localhost/a.pdf")).toBe(false);
    expect(isAllowedDocumentHost("https://127.0.0.1/a.pdf")).toBe(false);
    expect(isAllowedDocumentHost("https://10.0.0.5/a.pdf")).toBe(false);
  });

  test("rejects non-https schemes, including file and gopher", () => {
    expect(isAllowedDocumentHost("http://educationstandards.nsw.edu.au/a.pdf")).toBe(false);
    expect(isAllowedDocumentHost("file:///etc/passwd")).toBe(false);
    expect(isAllowedDocumentHost("gopher://educationstandards.nsw.edu.au/")).toBe(false);
  });

  test("rejects a URL carrying credentials", () => {
    expect(isAllowedDocumentHost("https://user:pass@educationstandards.nsw.edu.au/a.pdf")).toBe(false);
  });

  test("rejects unparseable input rather than throwing", () => {
    expect(isAllowedDocumentHost("not a url")).toBe(false);
    expect(isAllowedDocumentHost("")).toBe(false);
  });
});

describe("fetchableResource", () => {
  const paper = (resources: PaperResource[]): PastPaper => ({
    id: "p",
    sourceSlug: "thsc",
    externalKey: "k",
    yearLevel: "yr12",
    category: "hsc",
    subject: "Physics",
    subjectSlug: "physics",
    school: null,
    year: 2023,
    title: "2023 HSC",
    documentKind: "paper",
    resources,
    hasSolutions: false,
    syllabusEraId: "nsw-current",
    durationMinutes: 180,
    readingMinutes: 5,
    durationSource: "subject-default",
    totalMarks: 100,
    marksSource: "subject-default",
    difficulty: null,
    tags: [],
    sourceUrl: "https://thsconline.github.io/s/",
    indexedAt: "2026-01-01T00:00:00.000Z",
    saveCount: 0,
    attemptCount: 0,
  });

  test("picks the official direct copy", () => {
    const resource = fetchableResource(paper([
      { display: "THSC", url: "https://thsconline.github.io/s/v/1/x", accessMode: "referral", preferred: true, official: false },
      { display: "NESA", url: "https://educationstandards.nsw.edu.au/a.pdf", accessMode: "direct", preferred: false, official: true },
    ]));

    expect(resource?.url).toContain("educationstandards");
  });

  test("returns null when every copy is a referral", () => {
    expect(fetchableResource(paper([
      { display: "THSC", url: "https://thsconline.github.io/s/v/1/x", accessMode: "referral", preferred: true, official: false },
    ]))).toBeNull();
  });

  test("refuses a resource marked direct whose host is not allowed", () => {
    // A compromised or simply wrong index must not be able to nominate a fetch target.
    expect(fetchableResource(paper([
      { display: "Mirror", url: "https://attacker.example/a.pdf", accessMode: "direct", preferred: true, official: false },
    ]))).toBeNull();
  });

  test("returns null for a paper with no resources at all", () => {
    expect(fetchableResource(paper([]))).toBeNull();
  });
});

describe("documentStoragePath", () => {
  test("scopes a cached copy to its owner", () => {
    expect(documentStoragePath("user-1", "paper-1")).toBe("past-papers/user-1/paper-1.pdf");
    expect(documentStoragePath("user-2", "paper-1")).not.toBe(documentStoragePath("user-1", "paper-1"));
  });
});
