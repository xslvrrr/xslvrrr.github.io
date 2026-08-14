import { describe, expect, it } from "vitest";

import {
  StudyQueryError,
  compileStudyQuery,
  parseStudyQuery,
  parseStudyQueryAst,
} from "./query";

function compile(source: string) {
  return compileStudyQuery(parseStudyQuery(source));
}

describe("parseStudyQuery", () => {
  it("treats spaces between terms as AND", () => {
    expect(parseStudyQuery("is:due tag:unit-1")).toEqual({
      kind: "and",
      children: [
        { kind: "term", field: "is", operator: "eq", value: "due" },
        { kind: "term", field: "tag", operator: "eq", value: "unit-1" },
      ],
    });
  });

  it("reads a quoted value with spaces as one term", () => {
    expect(parseStudyQuery('deck:"Cell biology"')).toEqual({
      kind: "term",
      field: "deck",
      operator: "eq",
      value: "Cell biology",
    });
  });

  it("reads a leading minus as NOT", () => {
    expect(parseStudyQuery("-is:suspended")).toEqual({
      kind: "not",
      child: { kind: "term", field: "is", operator: "eq", value: "suspended" },
    });
  });

  it("binds OR looser than the implicit AND", () => {
    const node = parseStudyQuery("tag:a tag:b OR tag:c");

    expect(node.kind).toBe("or");
  });

  it("respects brackets", () => {
    const node = parseStudyQuery("is:due (tag:a OR tag:b)");

    expect(node.kind).toBe("and");
  });

  it("reads comparison operators", () => {
    expect(parseStudyQuery("lapses>3")).toEqual({
      kind: "term",
      field: "lapses",
      operator: "gt",
      value: "3",
    });
  });

  it("names an unknown field instead of ignoring it", () => {
    expect(() => parseStudyQuery("colour:red")).toThrow(StudyQueryError);
  });

  it("reports an unclosed quote", () => {
    expect(() => parseStudyQuery('deck:"unclosed')).toThrow(/closing quote/);
  });

  it("reports an unclosed bracket", () => {
    expect(() => parseStudyQuery("(is:due")).toThrow(/bracket/);
  });
});

describe("compileStudyQuery", () => {
  it("collects include and exclude sets separately", () => {
    const compiled = compile("tag:unit-1 -is:suspended -tag:skip");

    expect(compiled.tags).toEqual(["unit-1"]);
    expect(compiled.excludeStates).toEqual(["suspended"]);
    expect(compiled.excludeTags).toEqual(["skip"]);
  });

  it("turns is:due into the due-only filter", () => {
    expect(compile("is:due").onlyDue).toBe(true);
  });

  it("converts a greater-than comparison to an inclusive minimum", () => {
    expect(compile("lapses>3").minimumLapses).toBe(4);
  });

  it("supports OR between values of one field", () => {
    const compiled = compile("deck:Biology OR deck:Chemistry");

    expect(compiled.deckTitles).toEqual(["Biology", "Chemistry"]);
  });

  it("refuses an OR across different fields by name rather than approximating it", () => {
    expect(() => compile("deck:Biology OR tag:unit-1")).toThrow(/OR is supported between values of one field/);
  });

  it("refuses excluding a whole group", () => {
    expect(() => compile("-(tag:a tag:b)")).toThrow(/Excluding a group/);
  });

  it("collects loose words as text search", () => {
    expect(compile("mitochondria is:due").text).toBe("mitochondria");
  });
});

describe("parseStudyQueryAst", () => {
  it("revalidates a stored AST", () => {
    const ast = parseStudyQuery("is:due tag:a");

    expect(parseStudyQueryAst(JSON.parse(JSON.stringify(ast)))).toEqual(ast);
  });

  it("rejects an AST holding an unknown field", () => {
    expect(() => parseStudyQueryAst({ kind: "term", field: "sql", operator: "eq", value: "x" }))
      .toThrow();
  });
});
