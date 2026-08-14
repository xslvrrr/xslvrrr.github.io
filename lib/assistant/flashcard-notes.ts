/**
 * Translating assistant-proposed flashcards into the Study note types.
 *
 * The assistant used to be able to propose one shape of card only — a front and a back — while the
 * Flashcards experience itself supports cloze deletions, typed answers, ordered sequences,
 * compare-and-contrast pairs, and applied scenarios. That mismatch capped the quality of anything
 * the assistant produced: everything it knew had to be flattened into a question and an answer.
 *
 * A proposed card is therefore `{ noteType, fields }`, validated against the same schemas the note
 * editor uses, with `{ front, back }` kept as shorthand for a basic card so older tool calls and
 * simple cases stay short. Model output is data: a card that does not validate is dropped with a
 * reason rather than stored.
 */

import type { StudyAuthorableNoteType } from "../study/note-types";
import {
  isAuthorableNoteType,
  parseStudyNoteFields,
  renderStudyCard,
  deriveStudyCardTemplates,
} from "../study/note-types";

/** Note types the assistant may author. Image occlusion is excluded: it needs an uploaded image. */
export const ASSISTANT_NOTE_TYPES = [
  "basic",
  "basic-reversed",
  "typed",
  "cloze",
  "sequence",
  "compare-contrast",
  "application",
] as const satisfies readonly StudyAuthorableNoteType[];

export type AssistantNoteType = (typeof ASSISTANT_NOTE_TYPES)[number];

export interface AssistantStudyNote {
  noteType: AssistantNoteType;
  fields: Record<string, unknown>;
}

export interface AssistantNoteParseResult {
  notes: AssistantStudyNote[];
  /** One short reason per rejected card, for the tool result the model reads back. */
  rejected: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimmed(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * JSON Schema for one proposed card, shared by every flashcard tool so the model sees one
 * consistent shape. `fields` is deliberately loose here and tightened by the Zod schema for the
 * chosen `noteType` — describing seven mutually exclusive field sets in one JSON Schema produces a
 * prompt the model follows worse, not better.
 */
export const ASSISTANT_CARD_SCHEMA = {
  type: "object",
  description: [
    "One flashcard. Either supply front/back for a plain two-sided card, or supply noteType with",
    "the fields that type requires.",
  ].join(" "),
  properties: {
    front: { type: "string", description: "Question or cue. Shorthand for noteType 'basic'." },
    back: { type: "string", description: "Answer. Shorthand for noteType 'basic'." },
    noteType: {
      type: "string",
      enum: [...ASSISTANT_NOTE_TYPES],
      description: [
        "basic: prompt, answer. basic-reversed: prompt, answer, asked in both directions.",
        "typed: prompt, answer, optional aliases and numericTolerance — for terms and values worth",
        "recalling exactly. cloze: text with {{c1::hidden}} markers, one card per marker.",
        "sequence: prompt plus an ordered steps array. compare-contrast: conceptA, conceptB,",
        "difference, optional similarity. application: scenario, question, answer.",
      ].join(" "),
    },
    fields: {
      type: "object",
      description: [
        "Fields for the chosen noteType. Every type also accepts an optional 'explanation' holding",
        "the reasoning or worked detail shown after the answer is revealed — use it; it is what",
        "makes a card teach rather than only test.",
      ].join(" "),
      properties: {
        prompt: { type: "string" },
        answer: { type: "string" },
        text: { type: "string", description: "Cloze text using {{c1::...}} markers." },
        steps: { type: "array", items: { type: "string" }, description: "Ordered steps for a sequence card." },
        conceptA: { type: "string" },
        conceptB: { type: "string" },
        difference: { type: "string" },
        similarity: { type: "string" },
        scenario: { type: "string" },
        question: { type: "string" },
        aliases: { type: "array", items: { type: "string" }, description: "Other spellings a typed answer accepts." },
        caseSensitive: { type: "boolean" },
        numericTolerance: { type: "number" },
        explanation: { type: "string" },
      },
    },
  },
} as const;

/**
 * Validates one proposed card.
 *
 * Returns the reason on failure rather than throwing, so one malformed card in a batch of twenty
 * costs that card and not the whole tool call.
 */
export function parseAssistantCard(value: unknown): AssistantStudyNote | string {
  if (!isRecord(value)) return "card was not an object";

  const requestedType = typeof value.noteType === "string" ? value.noteType : "basic";
  if (!isAuthorableNoteType(requestedType) || !(ASSISTANT_NOTE_TYPES as readonly string[]).includes(requestedType)) {
    return `unsupported card type "${requestedType}"`;
  }
  const noteType = requestedType as AssistantNoteType;

  // front/back shorthand only ever describes a basic card, and never overrides explicit fields.
  const rawFields = isRecord(value.fields)
    ? value.fields
    : {
      prompt: trimmed(value.front, 2_000),
      answer: trimmed(value.back, 4_000),
    };

  try {
    const fields = parseStudyNoteFields(noteType, rawFields);
    // A cloze with no markers, or any other note that yields no cards, is a card that would never
    // be reviewed. Rejecting it here keeps empty notes out of a set.
    if (deriveStudyCardTemplates(noteType, fields).length === 0) {
      return `${noteType} card produced no reviewable cards`;
    }
    return { noteType, fields };
  } catch {
    return `${noteType} card was missing required fields`;
  }
}

export function parseAssistantCards(value: unknown, limit: number): AssistantNoteParseResult {
  const raw = Array.isArray(value) ? value.slice(0, limit) : [];
  return raw.reduce<AssistantNoteParseResult>((result, card) => {
    const parsed = parseAssistantCard(card);
    return typeof parsed === "string"
      ? { ...result, rejected: [...result.rejected, parsed] }
      : { ...result, notes: [...result.notes, parsed] };
  }, { notes: [], rejected: [] });
}

/**
 * Flattens a rich note into the front/back pair legacy JSONB storage can hold.
 *
 * A cloze note with three markers becomes three cards, matching what the same note would produce
 * after cutover, so an account's cards do not change shape when its storage does. The explanation
 * rides along on the back, which is the only place legacy storage has to put it.
 */
export function flattenAssistantNote(note: AssistantStudyNote): Array<{ front: string; back: string }> {
  return deriveStudyCardTemplates(note.noteType, note.fields).map((template) => {
    const rendered = renderStudyCard(note.noteType, note.fields, template.templateKey);
    return {
      front: rendered.prompt,
      back: [rendered.answer, rendered.explanation].filter(Boolean).join("\n\n"),
    };
  });
}
