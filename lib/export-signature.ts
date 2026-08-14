import { createHmac, timingSafeEqual } from 'node:crypto';

export const EXPORT_SIGNATURE_VERSION = 1;

function signingSecret(): string {
  const secret = process.env.EXPORT_SIGNING_SECRET
    || (process.env.NODE_ENV !== 'production' ? process.env.SESSION_SECRET : undefined);
  if (!secret) throw new Error('EXPORT_SIGNING_SECRET is required for data exports');
  return secret;
}

function signatureBytes(payload: unknown): Buffer {
  return createHmac('sha256', signingSecret()).update(JSON.stringify(payload)).digest();
}

export function signExportPayload(payload: unknown): string {
  return signatureBytes(payload).toString('base64url');
}

export function verifyExportPayload(payload: unknown, signature: unknown): boolean {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const provided = Buffer.from(signature, 'base64url');
  const expected = signatureBytes(payload);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
