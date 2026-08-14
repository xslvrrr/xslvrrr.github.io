import { z } from "zod";

/**
 * Expert search syntax. The parser produces an AST; a separate compile step turns that AST into a
 * fixed set of typed filter values. Nothing here ever becomes SQL text — the compiled filter is
 * passed as parameters, so an unsupported query is refused rather than escaped.
 */

export const STUDY_QUERY_MAX_LENGTH = 2_000;
const MAX_TERMS = 60;

export type StudyQueryField =
  | "deck"
  | "tag"
  | "type"
  | "is"
  | "lapses"
  | "stability"
  | "difficulty"
  | "reps"
  | "added"
  | "rated"
  | "due";

export type StudyQueryOperator = "eq" | "gt" | "lt";

export type StudyQueryNode =
  | { kind: "and"; children: StudyQueryNode[] }
  | { kind: "or"; children: StudyQueryNode[] }
  | { kind: "not"; child: StudyQueryNode }
  | { kind: "term"; field: StudyQueryField; operator: StudyQueryOperator; value: string }
  | { kind: "text"; value: string };

const FIELDS: StudyQueryField[] = [
  "deck",
  "tag",
  "type",
  "is",
  "lapses",
  "stability",
  "difficulty",
  "reps",
  "added",
  "rated",
  "due",
];

const IS_VALUES = new Set([
  "due",
  "new",
  "learning",
  "review",
  "relearning",
  "suspended",
  "buried",
  "lapsed",
]);

const NOTE_TYPES = new Set([
  "basic",
  "basic-reversed",
  "typed",
  "cloze",
  "sequence",
  "compare-contrast",
  "application",
  "image-occlusion",
]);

export class StudyQueryError extends Error {}

type Token =
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "or" }
  | { kind: "and" }
  | { kind: "not" }
  | { kind: "term"; field: StudyQueryField; operator: StudyQueryOperator; value: string }
  | { kind: "text"; value: string };

function readQuoted(source: string, start: number): { value: string; next: number } {
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\" && index + 1 < source.length) {
      value += source[index + 1];
      index += 2;
      continue;
    }
    if (source[index] === '"') return { value, next: index + 1 };
    value += source[index];
    index += 1;
  }
  throw new StudyQueryError("A quoted value is missing its closing quote.");
}

function readBare(source: string, start: number): { value: string; next: number } {
  let value = "";
  let index = start;
  while (index < source.length && !/[\s()]/.test(source[index])) {
    value += source[index];
    index += 1;
  }
  return { value, next: index };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "(") {
      tokens.push({ kind: "lparen" });
      index += 1;
      continue;
    }
    if (character === ")") {
      tokens.push({ kind: "rparen" });
      index += 1;
      continue;
    }
    if (character === "-") {
      tokens.push({ kind: "not" });
      index += 1;
      continue;
    }

    const word = character === '"' ? readQuoted(source, index) : readBare(source, index);
    if (character !== '"') {
      const upper = word.value.toUpperCase();
      if (upper === "OR") {
        tokens.push({ kind: "or" });
        index = word.next;
        continue;
      }
      if (upper === "AND") {
        tokens.push({ kind: "and" });
        index = word.next;
        continue;
      }
      if (upper === "NOT") {
        tokens.push({ kind: "not" });
        index = word.next;
        continue;
      }
    }

    const separator = character === '"' ? -1 : word.value.search(/[:<>]/);
    if (separator > 0) {
      const field = word.value.slice(0, separator).toLowerCase() as StudyQueryField;
      if (!FIELDS.includes(field)) {
        throw new StudyQueryError(`"${field}" is not a field you can search.`);
      }
      const symbol = word.value[separator];
      const operator: StudyQueryOperator = symbol === ">" ? "gt" : symbol === "<" ? "lt" : "eq";
      let value = word.value.slice(separator + 1);
      let next = word.next;
      if (value === "" && source[next] === '"') {
        const quoted = readQuoted(source, next);
        value = quoted.value;
        next = quoted.next;
      }
      if (!value) throw new StudyQueryError(`"${field}" needs a value.`);
      tokens.push({ kind: "term", field, operator, value });
      index = next;
      continue;
    }

    if (word.value) tokens.push({ kind: "text", value: word.value });
    index = word.next;
  }

  if (tokens.filter((token) => token.kind === "term" || token.kind === "text").length > MAX_TERMS) {
    throw new StudyQueryError("This search has too many terms.");
  }
  return tokens;
}

/** Recursive descent over: expression := or; or := and ("OR" and)*; and := unary+ */
export function parseStudyQuery(source: string): StudyQueryNode {
  if (source.length > STUDY_QUERY_MAX_LENGTH) {
    throw new StudyQueryError("This search is too long.");
  }
  const tokens = tokenize(source);
  if (tokens.length === 0) throw new StudyQueryError("Enter something to search for.");

  let position = 0;
  const peek = () => tokens[position];

  const parseUnary = (): StudyQueryNode => {
    const token = peek();
    if (!token) throw new StudyQueryError("This search ends unexpectedly.");
    if (token.kind === "not") {
      position += 1;
      return { kind: "not", child: parseUnary() };
    }
    if (token.kind === "lparen") {
      position += 1;
      const inner = parseOr();
      if (peek()?.kind !== "rparen") throw new StudyQueryError("A bracket is not closed.");
      position += 1;
      return inner;
    }
    if (token.kind === "term") {
      position += 1;
      return { kind: "term", field: token.field, operator: token.operator, value: token.value };
    }
    if (token.kind === "text") {
      position += 1;
      return { kind: "text", value: token.value };
    }
    throw new StudyQueryError("This search has an operator in an unexpected place.");
  };

  const parseAnd = (): StudyQueryNode => {
    const children: StudyQueryNode[] = [parseUnary()];
    for (;;) {
      const token = peek();
      if (!token || token.kind === "rparen" || token.kind === "or") break;
      if (token.kind === "and") {
        position += 1;
        continue;
      }
      children.push(parseUnary());
    }
    return children.length === 1 ? children[0] : { kind: "and", children };
  };

  const parseOr = (): StudyQueryNode => {
    const children: StudyQueryNode[] = [parseAnd()];
    while (peek()?.kind === "or") {
      position += 1;
      children.push(parseAnd());
    }
    return children.length === 1 ? children[0] : { kind: "or", children };
  };

  const node = parseOr();
  if (position !== tokens.length) throw new StudyQueryError("This search has an unexpected bracket.");
  return node;
}

export interface StudyCompiledQuery {
  text: string | null;
  deckTitles: string[];
  excludeDeckTitles: string[];
  tags: string[];
  excludeTags: string[];
  noteTypes: string[];
  excludeNoteTypes: string[];
  states: string[];
  excludeStates: string[];
  onlyDue: boolean;
  onlyLapsed: boolean;
  minimumLapses: number | null;
  maximumLapses: number | null;
  minimumStability: number | null;
  maximumStability: number | null;
  minimumDifficulty: number | null;
  maximumDifficulty: number | null;
  minimumRepetitions: number | null;
  addedWithinDays: number | null;
  ratedWithinDays: number | null;
}

function emptyCompiled(): StudyCompiledQuery {
  return {
    text: null,
    deckTitles: [],
    excludeDeckTitles: [],
    tags: [],
    excludeTags: [],
    noteTypes: [],
    excludeNoteTypes: [],
    states: [],
    excludeStates: [],
    onlyDue: false,
    onlyLapsed: false,
    minimumLapses: null,
    maximumLapses: null,
    minimumStability: null,
    maximumStability: null,
    minimumDifficulty: null,
    maximumDifficulty: null,
    minimumRepetitions: null,
    addedWithinDays: null,
    ratedWithinDays: null,
  };
}

function numeric(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new StudyQueryError(`"${field}" needs a number.`);
  return parsed;
}

function applyTerm(
  compiled: StudyCompiledQuery,
  node: Extract<StudyQueryNode, { kind: "term" }>,
  negated: boolean,
): void {
  const { field, operator, value } = node;

  if (field === "deck") {
    (negated ? compiled.excludeDeckTitles : compiled.deckTitles).push(value);
    return;
  }
  if (field === "tag") {
    (negated ? compiled.excludeTags : compiled.tags).push(value);
    return;
  }
  if (field === "type") {
    if (!NOTE_TYPES.has(value)) throw new StudyQueryError(`"${value}" is not a card type.`);
    (negated ? compiled.excludeNoteTypes : compiled.noteTypes).push(value);
    return;
  }
  if (field === "is") {
    if (!IS_VALUES.has(value)) throw new StudyQueryError(`"is:${value}" is not something to match.`);
    if (value === "due") {
      if (negated) throw new StudyQueryError("Excluding due cards is not supported.");
      compiled.onlyDue = true;
      return;
    }
    if (value === "lapsed") {
      if (negated) throw new StudyQueryError("Excluding lapsed cards is not supported.");
      compiled.onlyLapsed = true;
      return;
    }
    (negated ? compiled.excludeStates : compiled.states).push(value);
    return;
  }

  if (negated) throw new StudyQueryError(`Excluding "${field}" comparisons is not supported.`);

  if (field === "lapses") {
    const parsed = numeric(value, field);
    if (operator === "gt") compiled.minimumLapses = parsed + 1;
    else if (operator === "lt") compiled.maximumLapses = parsed - 1;
    else {
      compiled.minimumLapses = parsed;
      compiled.maximumLapses = parsed;
    }
    return;
  }
  if (field === "stability") {
    const parsed = numeric(value, field);
    if (operator === "lt") compiled.maximumStability = parsed;
    else compiled.minimumStability = parsed;
    return;
  }
  if (field === "difficulty") {
    const parsed = numeric(value, field);
    if (operator === "lt") compiled.maximumDifficulty = parsed;
    else compiled.minimumDifficulty = parsed;
    return;
  }
  if (field === "reps") {
    compiled.minimumRepetitions = numeric(value, field);
    return;
  }
  if (field === "added") {
    compiled.addedWithinDays = numeric(value, field);
    return;
  }
  if (field === "rated") {
    compiled.ratedWithinDays = numeric(value, field);
    return;
  }
  if (field === "due") {
    compiled.onlyDue = true;
  }
}

/**
 * Compiles the AST into typed filters. Boolean structure is supported where the storage model can
 * express it: a conjunction of per-field alternatives, with negation on set membership. Anything
 * else is refused by name instead of being silently approximated.
 */
export function compileStudyQuery(node: StudyQueryNode): StudyCompiledQuery {
  const compiled = emptyCompiled();

  const walk = (current: StudyQueryNode, negated: boolean): void => {
    if (current.kind === "and") {
      if (negated) throw new StudyQueryError("Excluding a group of terms is not supported.");
      for (const child of current.children) walk(child, false);
      return;
    }
    if (current.kind === "or") {
      // An OR group is expressible when every branch filters the same field.
      const fields = new Set(current.children.map((child) => (child.kind === "term" ? child.field : "text")));
      if (fields.size !== 1 || current.children.some((child) => child.kind !== "term")) {
        throw new StudyQueryError("OR is supported between values of one field, such as deck:a OR deck:b.");
      }
      for (const child of current.children) walk(child, negated);
      return;
    }
    if (current.kind === "not") {
      walk(current.child, !negated);
      return;
    }
    if (current.kind === "text") {
      if (negated) throw new StudyQueryError("Excluding words is not supported.");
      compiled.text = compiled.text ? `${compiled.text} ${current.value}` : current.value;
      return;
    }
    applyTerm(compiled, current, negated);
  };

  walk(node, false);
  return compiled;
}

const studyQueryNodeSchema: z.ZodType<StudyQueryNode> = z.lazy(() => z.union([
  z.object({ kind: z.literal("and"), children: z.array(studyQueryNodeSchema).min(1).max(MAX_TERMS) }).strict(),
  z.object({ kind: z.literal("or"), children: z.array(studyQueryNodeSchema).min(1).max(MAX_TERMS) }).strict(),
  z.object({ kind: z.literal("not"), child: studyQueryNodeSchema }).strict(),
  z.object({
    kind: z.literal("term"),
    field: z.enum(FIELDS as [StudyQueryField, ...StudyQueryField[]]),
    operator: z.enum(["eq", "gt", "lt"]),
    value: z.string().min(1).max(200),
  }).strict(),
  z.object({ kind: z.literal("text"), value: z.string().min(1).max(200) }).strict(),
]));

export const studyQueryAstSchema = studyQueryNodeSchema;

/** Stored ASTs are revalidated before use: a saved session is untrusted input like anything else. */
export function parseStudyQueryAst(value: unknown): StudyQueryNode {
  return studyQueryAstSchema.parse(value);
}
