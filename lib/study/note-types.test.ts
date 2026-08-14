import { describe, expect, it } from "vitest";

import {
  deriveStudyCardTemplates,
  lintStudyNote,
  matchTypedAnswer,
  parseStudyNoteFields,
  renderStudyCard,
} from "./note-types";

describe("deriveStudyCardTemplates", () => {
  it("makes one forward card for a basic note", () => {
    expect(deriveStudyCardTemplates("basic", { prompt: "a", answer: "b" }))
      .toEqual([{ templateKey: "forward", ordinal: 0 }]);
  });

  it("makes both directions for a reversed note", () => {
    expect(deriveStudyCardTemplates("basic-reversed", { prompt: "a", answer: "b" }))
      .toEqual([
        { templateKey: "forward", ordinal: 0 },
        { templateKey: "reverse", ordinal: 1 },
      ]);
  });

  it("keys cloze cards by their ordinal so editing other text preserves schedules", () => {
    const before = deriveStudyCardTemplates("cloze", { text: "{{c1::a}} and {{c2::b}}" });
    const after = deriveStudyCardTemplates("cloze", { text: "{{c1::a}} plus more and {{c2::b}}" });

    expect(before.map((template) => template.templateKey)).toEqual(["cloze-1", "cloze-2"]);
    expect(after.map((template) => template.templateKey)).toEqual(["cloze-1", "cloze-2"]);
  });

  it("drops the template for a deletion that was removed", () => {
    const templates = deriveStudyCardTemplates("cloze", { text: "{{c1::a}} and b" });

    expect(templates.map((template) => template.templateKey)).toEqual(["cloze-1"]);
  });
});

describe("renderStudyCard", () => {
  it("swaps sides for the reverse card of a reversed note", () => {
    const fields = { prompt: "Cell division", answer: "Mitosis" };

    expect(renderStudyCard("basic-reversed", fields, "forward").prompt).toBe("Cell division");
    expect(renderStudyCard("basic-reversed", fields, "reverse").prompt).toBe("Mitosis");
  });

  it("hides only the asked deletion on a cloze card", () => {
    const rendered = renderStudyCard("cloze", { text: "{{c1::Alpha}} then {{c2::Beta}}" }, "cloze-2");

    expect(rendered.prompt).toBe("Alpha then [...]");
    expect(rendered.answer).toBe("Beta");
  });

  it("numbers sequence steps on the answer side", () => {
    const rendered = renderStudyCard("sequence", { prompt: "Steps?", steps: ["First", "Second"] }, "sequence");

    expect(rendered.answer).toBe("1. First\n2. Second");
  });

  it("asks a typed card for a typed answer", () => {
    expect(renderStudyCard("typed", { prompt: "Capital of France?", answer: "Paris" }, "typed").answerMode)
      .toBe("typed");
  });
});

describe("matchTypedAnswer", () => {
  it("ignores case and surrounding whitespace by default", () => {
    expect(matchTypedAnswer("  paris ", { answer: "Paris" }).isCorrect).toBe(true);
  });

  it("respects case when the note asks for it", () => {
    expect(matchTypedAnswer("paris", { answer: "Paris", caseSensitive: true }).isCorrect).toBe(false);
  });

  it("accepts a configured alias", () => {
    const result = matchTypedAnswer("H2O", { answer: "water", aliases: ["H2O"] });

    expect(result.isCorrect).toBe(true);
    expect(result.matched).toBe("H2O");
  });

  it("accepts a number inside the allowed tolerance", () => {
    expect(matchTypedAnswer("9.8", { answer: "9.81", numericTolerance: 0.05 }).isCorrect).toBe(true);
    expect(matchTypedAnswer("9.5", { answer: "9.81", numericTolerance: 0.05 }).isCorrect).toBe(false);
  });
});

describe("parseStudyNoteFields", () => {
  it("rejects a sequence with fewer than two steps", () => {
    expect(() => parseStudyNoteFields("sequence", { prompt: "Steps?", steps: ["Only one"] }))
      .toThrow();
  });

  it("strips unknown fields instead of storing them", () => {
    expect(() => parseStudyNoteFields("basic", { prompt: "a", answer: "b", script: "<script>" }))
      .toThrow();
  });
});

describe("lintStudyNote", () => {
  it("warns when the question already contains the answer", () => {
    const warnings = lintStudyNote("basic", {
      prompt: "The capital of France is Paris, which city?",
      answer: "Paris, which city",
    });

    expect(warnings.some((warning) => warning.code === "answer-leakage")).toBe(true);
  });

  it("warns about a malformed cloze without blocking it", () => {
    const warnings = lintStudyNote("cloze", { text: "{{c1::unclosed" });

    expect(warnings.some((warning) => warning.code === "cloze-structure")).toBe(true);
  });

  it("stays quiet on a well-formed card", () => {
    expect(lintStudyNote("basic", {
      prompt: "Which organelle produces most cellular ATP?",
      answer: "The mitochondrion",
    })).toEqual([]);
  });
});
