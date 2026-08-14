import { z } from "zod";

export const STUDY_SHARE_CODE_LENGTH = 24;

export interface StudyPublication {
  id: string;
  deckId: string | null;
  title: string;
  description: string;
  shareCode: string;
  currentVersion: number;
  revokedAt: string | null;
  updatedAt: string;
}

export interface StudySubscriptionResult {
  addedNotes: number;
  version: number;
  deckId: string;
}

export const studyPublishCommandSchema = z.object({
  deckId: z.string().uuid(),
  publicationId: z.string().uuid().optional(),
  changelog: z.string().trim().max(2_000).default(""),
}).strict();

export const studySubscribeCommandSchema = z.object({
  shareCode: z.string().trim().min(8).max(64),
  deckId: z.string().uuid(),
}).strict();

export const studyRevokeCommandSchema = z.object({
  publicationId: z.string().uuid(),
}).strict();

export const studyPublicationSchema = z.object({
  id: z.string().uuid(),
  deckId: z.string().uuid().nullable(),
  title: z.string().max(120),
  description: z.string().max(500),
  shareCode: z.string(),
  currentVersion: z.coerce.number().int().min(1),
  revokedAt: z.string().nullable(),
  updatedAt: z.string(),
}).passthrough();

export function parseStudyPublication(value: unknown): StudyPublication {
  return studyPublicationSchema.parse(value) as StudyPublication;
}

/**
 * A share code is the whole access control for a link-shared deck, so it is generated from a
 * cryptographic source rather than from anything guessable.
 */
export function createStudyShareCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(STUDY_SHARE_CODE_LENGTH));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export interface StudyPublishedNote {
  key: string;
  noteType: string;
  fields: Record<string, unknown>;
  tags: string[];
}

export const studyPublishedNoteSchema = z.object({
  key: z.string().min(1).max(80),
  noteType: z.string().max(40),
  fields: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()).default([]),
}).passthrough();
