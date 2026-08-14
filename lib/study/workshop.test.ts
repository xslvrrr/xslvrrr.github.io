import { describe, expect, it } from "vitest";

import {
  extractStudySourceText,
  reviewStudyDraft,
  studyDraftBatchCommandSchema,
  verifyDraftSupport,
} from "./workshop";

const SOURCE = `Mitosis produces two genetically identical daughter cells.
Meiosis produces four genetically distinct gametes.`;

describe("verifyDraftSupport", () => {
  it("accepts a citation that appears in the source", () => {
    const result = verifyDraftSupport(SOURCE, "Mitosis produces two genetically identical daughter cells.");

    expect(result.isSupported).toBe(true);
  });

  it("ignores punctuation and case differences", () => {
    expect(verifyDraftSupport(SOURCE, "mitosis produces two genetically identical daughter cells").isSupported)
      .toBe(true);
  });

  it("rejects a claim the source does not contain", () => {
    expect(verifyDraftSupport(SOURCE, "Mitosis produces four gametes in the liver.").isSupported).toBe(false);
  });

  it("treats an empty citation as unsupported", () => {
    expect(verifyDraftSupport(SOURCE, "   ").isSupported).toBe(false);
  });
});

describe("reviewStudyDraft", () => {
  it("flags an unsupported draft without discarding it", () => {
    const reviewed = reviewStudyDraft({
      noteType: "basic",
      fields: { prompt: "How many gametes does mitosis make?", answer: "Four" },
      tags: [],
      citation: "Mitosis makes four gametes.",
    }, SOURCE);

    expect(reviewed.lint[0].message).toMatch(/source does not clearly contain this/);
    expect(reviewed.fields).toEqual({
      prompt: "How many gametes does mitosis make?",
      answer: "Four",
    });
  });

  it("runs the same quality lint the manual editor uses", () => {
    const reviewed = reviewStudyDraft({
      noteType: "basic",
      fields: {
        prompt: "Mitosis produces two genetically identical daughter cells, how many?",
        answer: "two genetically identical daughter cells",
      },
      tags: [],
      citation: "Mitosis produces two genetically identical daughter cells.",
    }, SOURCE);

    expect(reviewed.lint.some((warning) => warning.code === "answer-leakage")).toBe(true);
  });

  it("leaves a well-supported, well-formed draft unflagged", () => {
    const reviewed = reviewStudyDraft({
      noteType: "basic",
      fields: { prompt: "How many daughter cells does mitosis produce?", answer: "Two" },
      tags: [],
      citation: "Mitosis produces two genetically identical daughter cells.",
    }, SOURCE);

    expect(reviewed.lint).toEqual([]);
  });
});

describe("extractStudySourceText", () => {
  it("collapses runs of blank lines and trims", () => {
    expect(extractStudySourceText("  a\n\n\n\nb  ")).toBe("a\n\nb");
  });

  it("bounds very long sources", () => {
    expect(extractStudySourceText("x".repeat(60_000))).toHaveLength(40_000);
  });
});

describe("studyDraftBatchCommandSchema", () => {
  it("rejects a batch larger than the limit", () => {
    const drafts = Array.from({ length: 26 }, () => ({
      noteType: "basic" as const,
      fields: { prompt: "q", answer: "a" },
      citation: "q a",
    }));

    expect(studyDraftBatchCommandSchema.safeParse({
      deckId: null,
      source: { sourceKind: "pasted-text", text: "q a" },
      drafts,
    }).success).toBe(false);
  });

  it("rejects a source larger than the extraction limit", () => {
    expect(studyDraftBatchCommandSchema.safeParse({
      deckId: null,
      source: { sourceKind: "pasted-text", text: "x".repeat(40_001) },
      drafts: [{ noteType: "basic", fields: { prompt: "q", answer: "a" }, citation: "q" }],
    }).success).toBe(false);
  });
});
