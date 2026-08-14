import { describe, expect, it } from "vitest";

import { detectCsvDelimiter, parseCsv, unparseCsv } from "./csv";

describe("detectCsvDelimiter", () => {
  it("picks the delimiter that yields the most fields", () => {
    expect(detectCsvDelimiter("Question\tAnswer\nMitosis?\tCell division")).toBe("\t");
    expect(detectCsvDelimiter("Question;Answer\nMitosis?;Cell division")).toBe(";");
    expect(detectCsvDelimiter("Question|Answer")).toBe("|");
    expect(detectCsvDelimiter("Question,Answer")).toBe(",");
  });

  it("falls back to a comma for a single column and for an empty file", () => {
    expect(detectCsvDelimiter("Question\nMitosis?")).toBe(",");
    expect(detectCsvDelimiter("")).toBe(",");
  });

  it("ignores delimiters that only appear inside a quoted field", () => {
    expect(detectCsvDelimiter('"a;b;c",second\nx,y')).toBe(",");
  });

  it("reads past a newline inside a quoted field to find the real first record", () => {
    expect(detectCsvDelimiter('"line1\nline2"\tsecond\nx\ty')).toBe("\t");
  });
});

describe("parseCsv", () => {
  it("keeps the delimiter, quotes, and newlines inside a quoted field", () => {
    const parsed = parseCsv('Question,Answer\n"a, b","line1\nline2"\n');

    expect(parsed.rows).toEqual([
      ["Question", "Answer"],
      ["a, b", "line1\nline2"],
    ]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(parseCsv('a,"say ""hi"" now"').rows[0]).toEqual(["a", 'say "hi" now']);
  });

  it("treats a quote after the field has started as ordinary text", () => {
    expect(parseCsv('5" pipe,second').rows[0]).toEqual(['5" pipe', "second"]);
  });

  it("accepts LF, CRLF, and a lone CR as record separators", () => {
    expect(parseCsv("a,b\nc,d").rows).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsv("a,b\r\nc,d").rows).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsv("a,b\rc,d").rows).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("drops rows that carry no content, including bare delimiters", () => {
    expect(parseCsv("a,b\n\n   \n,,\nc,d\n").rows).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("keeps empty fields inside a row that has content", () => {
    expect(parseCsv("a,,c").rows).toEqual([["a", "", "c"]]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("").rows).toEqual([]);
  });

  it("flags a row whose quoted field is never closed", () => {
    const parsed = parseCsv('a,b\nc,"unterminated');

    expect(parsed.unreadableRows).toEqual([1]);
    expect(parsed.rows[0]).toEqual(["a", "b"]);
  });

  it("honours an explicit delimiter over detection", () => {
    expect(parseCsv("a;b", ";").rows[0]).toEqual(["a", "b"]);
    expect(parseCsv("a;b", ",").rows[0]).toEqual(["a;b"]);
  });
});

describe("unparseCsv", () => {
  it("writes a header row followed by the data", () => {
    const csv = unparseCsv({
      fields: ["row", "code", "message"],
      data: [[2, "missing-answer", "The answer is empty."]],
    });

    expect(csv).toBe("row,code,message\n2,missing-answer,The answer is empty.");
  });

  it("quotes only fields that need it, and doubles embedded quotes", () => {
    const csv = unparseCsv({
      fields: ["a", "b", "c", "d"],
      data: [["plain", "has,comma", 'has"quote', "has\nnewline"]],
    });

    expect(csv.split("\n")[1]).toBe('plain,"has,comma","has""quote","has');
  });

  it("writes null and undefined as empty fields", () => {
    expect(unparseCsv({ fields: ["a"], data: [[null, undefined]] })).toBe("a\n,");
  });

  it("round-trips values that contain the delimiter, quotes, and newlines", () => {
    const original = ["a, b", 'say "hi"', "line1\nline2"];
    const csv = unparseCsv({ fields: ["x", "y", "z"], data: [original] });

    expect(parseCsv(csv).rows[1]).toEqual(original);
  });
});
