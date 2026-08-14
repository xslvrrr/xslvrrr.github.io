/**
 * Cloze parsing. Deliberately a small state machine rather than a regular expression: cloze text
 * contains braces, colons, and nested punctuation that a pattern match gets wrong in ways that are
 * hard to see until a card renders incorrectly.
 *
 * Syntax: `{{c1::hidden text}}` or `{{c1::hidden text::hint}}`.
 */

export const CLOZE_MAX_ORDINAL = 32;

export interface ClozeDeletion {
  ordinal: number;
  text: string;
  hint: string | null;
  start: number;
  end: number;
}

export interface ClozeSegment {
  kind: "text" | "deletion";
  text: string;
  ordinal?: number;
  hint?: string | null;
}

export interface ClozeParseResult {
  segments: ClozeSegment[];
  deletions: ClozeDeletion[];
  ordinals: number[];
  errors: string[];
}

interface OpenMarker {
  ordinal: number;
  hint: string | null;
  contentStart: number;
  markerStart: number;
}

function readOrdinal(source: string, index: number): { ordinal: number; next: number } | null {
  if (source[index] !== "c" && source[index] !== "C") return null;
  let cursor = index + 1;
  let digits = "";
  while (cursor < source.length && source[cursor] >= "0" && source[cursor] <= "9") {
    digits += source[cursor];
    cursor += 1;
  }
  if (!digits) return null;
  if (source.slice(cursor, cursor + 2) !== "::") return null;
  const ordinal = Number(digits);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > CLOZE_MAX_ORDINAL) return null;
  return { ordinal, next: cursor + 2 };
}

export function parseCloze(source: string): ClozeParseResult {
  const segments: ClozeSegment[] = [];
  const deletions: ClozeDeletion[] = [];
  const errors: string[] = [];
  let literal = "";
  let open: OpenMarker | null = null;
  let index = 0;

  const pushLiteral = () => {
    if (literal) {
      segments.push({ kind: "text", text: literal });
      literal = "";
    }
  };

  while (index < source.length) {
    if (!open && source.startsWith("{{", index)) {
      const marker = readOrdinal(source, index + 2);
      if (marker) {
        pushLiteral();
        open = { ordinal: marker.ordinal, hint: null, contentStart: marker.next, markerStart: index };
        index = marker.next;
        continue;
      }
      errors.push("A cloze marker must look like {{c1::text}}.");
      literal += "{{";
      index += 2;
      continue;
    }

    if (open && source.startsWith("::", index)) {
      // A second separator introduces the hint; anything after it belongs to the hint.
      const closing = source.indexOf("}}", index);
      const hintEnd = closing >= 0 ? closing : source.length;
      open = {
        ...open,
        hint: source.slice(index + 2, hintEnd).trim() || null,
      };
      const text = source.slice(open.contentStart, index);
      segments.push({ kind: "deletion", text, ordinal: open.ordinal, hint: open.hint });
      deletions.push({
        ordinal: open.ordinal,
        text,
        hint: open.hint,
        start: open.markerStart,
        end: hintEnd + 2,
      });
      if (closing < 0) errors.push("A cloze marker is missing its closing braces.");
      index = hintEnd + 2;
      open = null;
      continue;
    }

    if (open && source.startsWith("}}", index)) {
      const text = source.slice(open.contentStart, index);
      if (!text.trim()) errors.push("A cloze marker has no text to hide.");
      segments.push({ kind: "deletion", text, ordinal: open.ordinal, hint: null });
      deletions.push({
        ordinal: open.ordinal,
        text,
        hint: null,
        start: open.markerStart,
        end: index + 2,
      });
      index += 2;
      open = null;
      continue;
    }

    if (!open) literal += source[index];
    index += 1;
  }

  if (open) {
    errors.push("A cloze marker is missing its closing braces.");
    literal += source.slice(open.markerStart);
  }
  pushLiteral();

  const ordinals = [...new Set(deletions.map((deletion) => deletion.ordinal))].sort(
    (left, right) => left - right,
  );
  if (ordinals.length === 0) {
    errors.push("Add at least one {{c1::...}} marker to make a cloze card.");
  }

  return { segments, deletions, ordinals, errors };
}

/**
 * Question side for one deletion group: the chosen ordinal is hidden, every other deletion shows
 * its text so the sentence still reads normally.
 */
export function renderClozeQuestion(result: ClozeParseResult, ordinal: number): string {
  return result.segments
    .map((segment) => {
      if (segment.kind === "text") return segment.text;
      if (segment.ordinal !== ordinal) return segment.text;
      return segment.hint ? `[${segment.hint}]` : "[...]";
    })
    .join("");
}

/** Answer side: the whole sentence with every deletion filled in. */
export function renderClozeAnswer(result: ClozeParseResult): string {
  return result.segments.map((segment) => segment.text).join("");
}

/** Just the hidden text for one group, which is what the learner had to retrieve. */
export function clozeAnswerText(result: ClozeParseResult, ordinal: number): string {
  return result.deletions
    .filter((deletion) => deletion.ordinal === ordinal)
    .map((deletion) => deletion.text)
    .join(" / ");
}
