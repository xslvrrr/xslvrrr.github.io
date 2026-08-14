import { z } from "zod";

import {
  clozeAnswerText,
  parseCloze,
  renderClozeAnswer,
  renderClozeQuestion,
} from "./cloze";
import type { StudyNoteType } from "./domain";
import { studyImageOcclusionFieldsSchema, type StudyOcclusionRegion } from "./media";

/** One note can generate at most this many cards, matching the database template limit. */
export const STUDY_MAX_TEMPLATES_PER_NOTE = 8;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const studyBasicNoteSchema = z.object({
  prompt: text(2_000),
  answer: text(4_000),
  explanation: optionalText(8_000),
}).strict();

export const studyTypedNoteSchema = z.object({
  prompt: text(2_000),
  answer: text(500),
  aliases: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  caseSensitive: z.boolean().default(false),
  numericTolerance: z.number().finite().min(0).max(1_000_000).optional(),
  explanation: optionalText(8_000),
}).strict();

export const studyClozeNoteSchema = z.object({
  text: text(6_000),
  explanation: optionalText(8_000),
}).strict();

export const studySequenceNoteSchema = z.object({
  prompt: text(2_000),
  steps: z.array(z.string().trim().min(1).max(500)).min(2).max(20),
  explanation: optionalText(8_000),
}).strict();

export const studyCompareNoteSchema = z.object({
  conceptA: text(200),
  conceptB: text(200),
  difference: text(4_000),
  similarity: optionalText(4_000),
  explanation: optionalText(8_000),
}).strict();

export const studyApplicationNoteSchema = z.object({
  scenario: text(4_000),
  question: text(2_000),
  answer: text(4_000),
  explanation: optionalText(8_000),
}).strict();

const NOTE_SCHEMAS = {
  basic: studyBasicNoteSchema,
  "image-occlusion": studyImageOcclusionFieldsSchema,
  "basic-reversed": studyBasicNoteSchema,
  typed: studyTypedNoteSchema,
  cloze: studyClozeNoteSchema,
  sequence: studySequenceNoteSchema,
  "compare-contrast": studyCompareNoteSchema,
  application: studyApplicationNoteSchema,
} as const;

export type StudyAuthorableNoteType = keyof typeof NOTE_SCHEMAS;

export const studyAuthorableNoteTypes = Object.keys(NOTE_SCHEMAS) as StudyAuthorableNoteType[];

export function isAuthorableNoteType(value: string): value is StudyAuthorableNoteType {
  return value in NOTE_SCHEMAS;
}

export function parseStudyNoteFields(
  noteType: StudyAuthorableNoteType,
  fields: unknown,
): Record<string, unknown> {
  return NOTE_SCHEMAS[noteType].parse(fields) as Record<string, unknown>;
}

export interface StudyCardTemplate {
  templateKey: string;
  ordinal: number;
}

/**
 * Template keys are stable identities, not positions. An edit that keeps a key keeps the card's
 * scheduling; only a key that disappears retires its card.
 */
export function deriveStudyCardTemplates(
  noteType: StudyAuthorableNoteType,
  fields: Record<string, unknown>,
): StudyCardTemplate[] {
  if (noteType === "basic-reversed") {
    return [
      { templateKey: "forward", ordinal: 0 },
      { templateKey: "reverse", ordinal: 1 },
    ];
  }
  if (noteType === "typed") return [{ templateKey: "typed", ordinal: 0 }];
  if (noteType === "sequence") return [{ templateKey: "sequence", ordinal: 0 }];
  if (noteType === "compare-contrast") return [{ templateKey: "compare", ordinal: 0 }];
  if (noteType === "application") return [{ templateKey: "application", ordinal: 0 }];
  if (noteType === "cloze") {
    const parsed = parseCloze(String(fields.text ?? ""));
    return parsed.ordinals
      .slice(0, STUDY_MAX_TEMPLATES_PER_NOTE)
      .map((ordinal, index) => ({ templateKey: `cloze-${ordinal}`, ordinal: index }));
  }
  if (noteType === "image-occlusion") {
    const regions = occlusionRegions(fields);
    // Hide-all asks about the whole image at once, so it is a single card.
    if (fields.mode === "hide-all") return [{ templateKey: "occlusion-all", ordinal: 0 }];
    return regions
      .slice(0, STUDY_MAX_TEMPLATES_PER_NOTE)
      .map((region, index) => ({ templateKey: `occlusion-${region.id}`, ordinal: index }));
  }
  return [{ templateKey: "forward", ordinal: 0 }];
}

export type StudyAnswerMode = "reveal" | "typed";

export interface StudyRenderedCard {
  prompt: string;
  answer: string;
  explanation?: string;
  answerMode: StudyAnswerMode;
  /** Extra context shown with the question, such as an ordered-process instruction. */
  instruction?: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function occlusionRegions(fields: Record<string, unknown>): StudyOcclusionRegion[] {
  return Array.isArray(fields.regions) ? (fields.regions as StudyOcclusionRegion[]) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Turns stored fields into what one card shows. Rendering is data only — no HTML, no templates the
 * user can execute.
 */
export function renderStudyCard(
  noteType: StudyNoteType,
  fields: Record<string, unknown>,
  templateKey: string,
): StudyRenderedCard {
  const explanation = asString(fields.explanation) || undefined;

  if (noteType === "typed") {
    return {
      prompt: asString(fields.prompt),
      answer: asString(fields.answer),
      explanation,
      answerMode: "typed",
    };
  }

  if (noteType === "cloze") {
    const parsed = parseCloze(asString(fields.text));
    const ordinal = Number(templateKey.replace("cloze-", "")) || parsed.ordinals[0] || 1;
    return {
      prompt: renderClozeQuestion(parsed, ordinal),
      answer: clozeAnswerText(parsed, ordinal) || renderClozeAnswer(parsed),
      explanation,
      answerMode: "reveal",
      instruction: "Recall the hidden text.",
    };
  }

  if (noteType === "image-occlusion") {
    const regions = occlusionRegions(fields);
    const hidden = templateKey === "occlusion-all"
      ? regions
      : regions.filter((region) => `occlusion-${region.id}` === templateKey);
    const shown = regions.filter((region) => !hidden.includes(region));
    return {
      prompt: [
        asString(fields.prompt) || "What is hidden on this image?",
        `Image: ${asString(fields.altText)}`,
        shown.length > 0 ? `Visible: ${shown.map((region) => region.label).join(", ")}` : "",
      ].filter(Boolean).join("\n\n"),
      answer: hidden.map((region) => region.label).join("\n"),
      explanation,
      answerMode: "reveal",
      instruction: "Every region has a written label, so this card works without seeing the image.",
    };
  }

  if (noteType === "sequence") {
    const steps = asStringArray(fields.steps);
    return {
      prompt: asString(fields.prompt),
      answer: steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      explanation,
      answerMode: "reveal",
      instruction: "Recall every step in order.",
    };
  }

  if (noteType === "compare-contrast") {
    const conceptA = asString(fields.conceptA);
    const conceptB = asString(fields.conceptB);
    const similarity = asString(fields.similarity);
    return {
      prompt: `How do ${conceptA} and ${conceptB} differ?`,
      answer: similarity
        ? `${asString(fields.difference)}\n\nShared: ${similarity}`
        : asString(fields.difference),
      explanation,
      answerMode: "reveal",
      instruction: "Name the difference that lets you tell these apart.",
    };
  }

  if (noteType === "application") {
    return {
      prompt: `${asString(fields.scenario)}\n\n${asString(fields.question)}`,
      answer: asString(fields.answer),
      explanation,
      answerMode: "reveal",
    };
  }

  if (noteType === "basic-reversed" && templateKey === "reverse") {
    return {
      prompt: asString(fields.answer),
      answer: asString(fields.prompt),
      explanation,
      answerMode: "reveal",
    };
  }

  return {
    prompt: asString(fields.prompt),
    answer: asString(fields.answer),
    explanation,
    answerMode: "reveal",
  };
}

export interface StudyTypedAnswerResult {
  isCorrect: boolean;
  matched: string | null;
  expected: string[];
}

function normalizeTypedAnswer(value: string, caseSensitive: boolean): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return caseSensitive ? collapsed : collapsed.toLowerCase();
}

/**
 * Typed answers offer feedback, never a rating. The learner still chooses how well they recalled
 * it, because a typo and a genuine failure are not the same thing.
 */
export function matchTypedAnswer(
  input: string,
  fields: Record<string, unknown>,
): StudyTypedAnswerResult {
  const caseSensitive = fields.caseSensitive === true;
  const expected = [asString(fields.answer), ...asStringArray(fields.aliases)].filter(Boolean);
  const normalizedInput = normalizeTypedAnswer(input, caseSensitive);

  const tolerance = typeof fields.numericTolerance === "number" ? fields.numericTolerance : null;
  if (tolerance !== null) {
    const typedNumber = Number(normalizedInput.replace(/[^0-9.+-]/g, ""));
    for (const candidate of expected) {
      const candidateNumber = Number(candidate.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(typedNumber) && Number.isFinite(candidateNumber)
        && Math.abs(typedNumber - candidateNumber) <= tolerance) {
        return { isCorrect: true, matched: candidate, expected };
      }
    }
  }

  const matched = expected.find(
    (candidate) => normalizeTypedAnswer(candidate, caseSensitive) === normalizedInput,
  );
  return { isCorrect: Boolean(matched), matched: matched ?? null, expected };
}

export interface StudyNoteLintWarning {
  code:
    | "answer-leakage"
    | "long-answer"
    | "multiple-facts"
    | "context-free-cue"
    | "cloze-structure"
    | "trivial-overlap";
  message: string;
}

const LONG_ANSWER_WORDS = 60;
const SHORT_CUE_WORDS = 3;

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/**
 * Quality lint warns; it never blocks. Real cards break these rules for good reasons, and a hard
 * gate would just teach people to write around the checker.
 */
export function lintStudyNote(
  noteType: StudyNoteType,
  fields: Record<string, unknown>,
): StudyNoteLintWarning[] {
  const warnings: StudyNoteLintWarning[] = [];

  if (noteType === "cloze") {
    const parsed = parseCloze(asString(fields.text));
    for (const error of parsed.errors) {
      warnings.push({ code: "cloze-structure", message: error });
    }
    return warnings;
  }

  const prompt = asString(fields.prompt) || asString(fields.question);
  const answer = asString(fields.answer);
  if (!prompt || !answer) return warnings;

  const promptWords = words(prompt);
  const answerWords = words(answer);

  if (answerWords.length > LONG_ANSWER_WORDS) {
    warnings.push({
      code: "long-answer",
      message: "This answer is long. Splitting it into focused cards usually recalls better.",
    });
  }

  if (answerWords.length > 12 && /(\band\b|;|\n)/.test(answer)) {
    warnings.push({
      code: "multiple-facts",
      message: "This answer may hold several separate facts. Consider one card per fact.",
    });
  }

  if (promptWords.length <= SHORT_CUE_WORDS && !prompt.includes("?")) {
    warnings.push({
      code: "context-free-cue",
      message: "This cue is very short. Add enough context to make the question unambiguous.",
    });
  }

  const answerLower = answer.toLowerCase();
  const promptLower = prompt.toLowerCase();
  if (answerWords.length > 1 && promptLower.includes(answerLower)) {
    warnings.push({
      code: "answer-leakage",
      message: "The question already contains the answer, so there is nothing to retrieve.",
    });
  } else if (answerWords.length > 3) {
    const overlap = answerWords.filter((word) => promptWords.includes(word)).length;
    if (overlap / answerWords.length > 0.8) {
      warnings.push({
        code: "trivial-overlap",
        message: "The question and answer share almost all of their words.",
      });
    }
  }

  return warnings;
}
