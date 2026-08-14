import { z } from "zod";

/**
 * Media validation. The declared content type is not trusted: the bytes decide, because a mislabelled
 * upload is the ordinary way an image endpoint becomes a file-serving endpoint.
 */

export const STUDY_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export type StudyMediaMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface StudyMedia {
  id: string;
  mimeType: StudyMediaMimeType;
  byteSize: number;
  width: number | null;
  height: number | null;
  altText: string;
  createdAt: string;
}

export const studyMediaUploadSchema = z.object({
  // Base64 keeps the upload inside the same JSON body guard as every other Study mutation.
  data: z.string().min(1).max(Math.ceil(STUDY_MEDIA_MAX_BYTES * 1.4)),
  altText: z.string().trim().min(1).max(1_000),
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
}).strict();

export const studyMediaSchema = z.object({
  id: z.string().uuid(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  byteSize: z.number().int().min(1),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  altText: z.string().min(1),
  createdAt: z.string(),
}).passthrough();

export function parseStudyMedia(value: unknown): StudyMedia {
  return studyMediaSchema.parse(value) as StudyMedia;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Magic-byte detection. SVG is deliberately absent: it can carry script, and rasterizing it safely
 * is a bigger commitment than image cards need.
 */
export function detectStudyMediaType(bytes: Uint8Array): StudyMediaMimeType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

export interface StudyMediaValidation {
  bytes: Uint8Array;
  mimeType: StudyMediaMimeType;
  checksum: string;
}

export class StudyMediaError extends Error {}

export async function validateStudyMedia(base64: string): Promise<StudyMediaValidation> {
  let bytes: Uint8Array;
  try {
    const binary = atob(base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new StudyMediaError("That file could not be read as an image.");
  }

  if (bytes.byteLength === 0) throw new StudyMediaError("That file is empty.");
  if (bytes.byteLength > STUDY_MEDIA_MAX_BYTES) {
    throw new StudyMediaError("Images must be smaller than 5 MB.");
  }

  const mimeType = detectStudyMediaType(bytes);
  if (!mimeType) throw new StudyMediaError("Only PNG, JPEG, and WebP images are supported.");

  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  const checksum = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return { bytes, mimeType, checksum };
}

export interface StudyOcclusionRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Occlusion regions are percentages of the image, so they survive any display size. Every region
 * carries a label: that label is the textual equivalent, and it is what makes the card usable
 * without seeing the image at all.
 */
export const studyOcclusionRegionSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(200),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0.5).max(100),
  height: z.number().min(0.5).max(100),
}).strict();

export const studyImageOcclusionFieldsSchema = z.object({
  mediaId: z.string().uuid(),
  altText: z.string().trim().min(1).max(1_000),
  prompt: z.string().trim().max(2_000).optional(),
  mode: z.enum(["hide-one", "hide-all"]).default("hide-one"),
  regions: z.array(studyOcclusionRegionSchema).min(1).max(8),
  explanation: z.string().trim().max(8_000).optional(),
}).strict();

export type StudyImageOcclusionFields = z.infer<typeof studyImageOcclusionFieldsSchema>;
