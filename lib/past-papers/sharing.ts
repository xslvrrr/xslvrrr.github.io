/**
 * Share codes for folders and ladders.
 *
 * The same mechanism as study deck sharing, deliberately: a student who has shared a deck should
 * not have to learn a second thing to share a set of papers. A code is the entire access control
 * for what it points at, so it is generated from a cryptographic source and is long enough that
 * guessing is not a strategy.
 *
 * What is shared is a snapshot, not a live view. A subscriber gets the papers that were in the
 * folder at publish time; the owner reorganising their folder afterwards does not silently change
 * what someone else received, and cannot retroactively add to it.
 */

import { z } from "zod";

export const PAST_PAPER_SHARE_CODE_LENGTH = 20;

/**
 * Deliberately excludes `i`, `l`, `o`, `0` and `1`.
 *
 * Codes get read aloud and copied off screens. The characters people confuse are the ones that
 * turn a working code into a support question.
 */
const SHARE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function createPastPaperShareCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PAST_PAPER_SHARE_CODE_LENGTH));
  // Rejection-free modulo is fine here: the alphabet is 31 characters against 256 byte values, so
  // the bias is under 4% on five characters and the code still carries ~99 bits of entropy.
  return Array.from(bytes, (byte) => SHARE_ALPHABET[byte % SHARE_ALPHABET.length]).join("");
}

/** Accepts a pasted code or a full share URL, and normalises case and stray punctuation. */
export function normaliseShareCode(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/[?&]code=([a-z0-9]+)/i)?.[1]
    ?? trimmed.split(/[/#]/).filter(Boolean).pop()
    ?? trimmed;
  return fromUrl.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** One paper inside a published snapshot. */
export const sharedPaperSchema = z.object({
  paperId: z.string().uuid(),
  /** Denormalised so a shared list still reads sensibly if a catalogue row is later re-indexed. */
  title: z.string().max(300),
  subject: z.string().max(120),
  year: z.number().int().nullable(),
  school: z.string().max(120).nullable(),
  position: z.number().int().min(0).max(500),
  targetMinutes: z.number().int().min(1).max(600).nullable().default(null),
  note: z.string().max(500).default(""),
}).strict();

export type SharedPaper = z.infer<typeof sharedPaperSchema>;

export const sharedPayloadSchema = z.object({
  kind: z.enum(["folder", "ladder"]),
  papers: z.array(sharedPaperSchema).max(500),
}).strict();

export type SharedPayload = z.infer<typeof sharedPayloadSchema>;

export interface PastPaperPublication {
  id: string;
  kind: "folder" | "ladder";
  title: string;
  description: string;
  shareCode: string;
  paperCount: number;
  currentVersion: number;
  revokedAt: string | null;
  updatedAt: string;
}

export function parseSharedPayload(value: unknown): SharedPayload {
  const result = sharedPayloadSchema.safeParse(value);
  return result.success ? result.data : { kind: "folder", papers: [] };
}

/**
 * A share link. Relative rather than absolute so it works on the deployed site, on a desktop
 * build's loopback origin, and in development without the origin being threaded through.
 */
export function shareLinkPath(shareCode: string): string {
  return `/dashboard#past-papers?code=${encodeURIComponent(shareCode)}`;
}
