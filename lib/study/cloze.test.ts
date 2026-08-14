import { describe, expect, it } from "vitest";

import { clozeAnswerText, parseCloze, renderClozeAnswer, renderClozeQuestion } from "./cloze";

describe("parseCloze", () => {
  it("reads one deletion and keeps the surrounding text", () => {
    const result = parseCloze("The powerhouse is the {{c1::mitochondrion}}.");

    expect(result.ordinals).toEqual([1]);
    expect(result.errors).toEqual([]);
    expect(renderClozeAnswer(result)).toBe("The powerhouse is the mitochondrion.");
    expect(renderClozeQuestion(result, 1)).toBe("The powerhouse is the [...].");
  });

  it("shows other deletions while hiding the one being asked", () => {
    const result = parseCloze("{{c1::Mitosis}} makes {{c2::two}} identical cells.");

    expect(result.ordinals).toEqual([1, 2]);
    expect(renderClozeQuestion(result, 1)).toBe("[...] makes two identical cells.");
    expect(renderClozeQuestion(result, 2)).toBe("Mitosis makes [...] identical cells.");
  });

  it("uses a hint in place of the blank when one is given", () => {
    const result = parseCloze("Paris is the capital of {{c1::France::country}}.");

    expect(renderClozeQuestion(result, 1)).toBe("Paris is the capital of [country].");
    expect(clozeAnswerText(result, 1)).toBe("France");
  });

  it("groups repeated ordinals into one card", () => {
    const result = parseCloze("{{c1::Alpha}} and {{c1::Beta}} and {{c2::Gamma}}");

    expect(result.ordinals).toEqual([1, 2]);
    expect(renderClozeQuestion(result, 1)).toBe("[...] and [...] and Gamma");
    expect(clozeAnswerText(result, 1)).toBe("Alpha / Beta");
  });

  it("keeps braces and colons that are not cloze markers as plain text", () => {
    const result = parseCloze("Use {a: 1} for the object and {{c1::this}} for the answer.");

    expect(renderClozeAnswer(result)).toBe("Use {a: 1} for the object and this for the answer.");
    expect(result.ordinals).toEqual([1]);
  });

  it("reports an unterminated marker instead of swallowing the rest of the text", () => {
    const result = parseCloze("The answer is {{c1::incomplete");

    expect(result.errors).toContain("A cloze marker is missing its closing braces.");
    expect(result.ordinals).toEqual([]);
  });

  it("reports text with no markers", () => {
    const result = parseCloze("No deletions here.");

    expect(result.ordinals).toEqual([]);
    expect(result.errors).toContain("Add at least one {{c1::...}} marker to make a cloze card.");
  });

  it("rejects an ordinal above the supported range as plain text", () => {
    const result = parseCloze("{{c99::too many}}");

    expect(result.ordinals).toEqual([]);
    expect(result.errors).toContain("A cloze marker must look like {{c1::text}}.");
  });
});
