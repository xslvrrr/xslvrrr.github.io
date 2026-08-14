import { createHmac, randomUUID } from 'node:crypto';

import { MAX_CHANGELOG_BUMPS } from './changelog';
import { supabaseAdmin } from './supabase';

/**
 * Server-side changelog bump storage.
 *
 * Voters are identified by an opaque HMAC so the database never holds an account id or a raw
 * visitor id. Signed-in visitors are keyed by account, so their allowance follows them between
 * devices; everyone else is keyed by a long-lived HttpOnly cookie.
 *
 * Everything here is framework-neutral: identity resolution takes a cookie value rather than a
 * request object, so both the Next API route and the TanStack file route can use it directly.
 */

export const VISITOR_COOKIE_NAME = 'millennium_changelog_voter';

const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const VOTER_KEY_DOMAIN = 'millennium:changelog-bump:v1';
const MAX_VISITOR_ID_LENGTH = 100;

export type BumpStatus = 'bumped' | 'already_bumped' | 'no_bumps_remaining';

export interface ChangelogBumpState {
  readonly counts: Readonly<Record<string, number>>;
  readonly bumped: readonly string[];
  readonly remaining: number;
  readonly maxBumps: number;
}

export interface ChangelogBumpResult extends ChangelogBumpState {
  readonly status: BumpStatus;
}

export interface VoterIdentity {
  readonly voterKey: string;
  /** Present only when a new anonymous visitor id was minted and must be returned to the browser. */
  readonly setCookie?: string;
}

function voterSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'millennium-development-changelog-bump-secret';
  throw new Error('SESSION_SECRET is required for changelog bumps');
}

function deriveVoterKey(identity: string): string {
  return createHmac('sha256', voterSecret())
    .update(VOTER_KEY_DOMAIN, 'utf8')
    .update('\0', 'utf8')
    .update(identity, 'utf8')
    .digest('base64url');
}

export function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim()) || null;
  }
  return null;
}

function visitorCookie(value: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${VISITOR_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${VISITOR_COOKIE_MAX_AGE_SECONDS}${secure}`;
}

/**
 * Resolves the voter from an existing visitor id, minting a new one when the caller is neither
 * signed in nor already carrying one.
 */
export function resolveVoterIdentity(
  existingVisitorId: string | null | undefined,
  userId?: string | null,
): VoterIdentity {
  const normalizedUserId = (userId ?? '').trim();
  if (normalizedUserId) {
    return { voterKey: deriveVoterKey(`user:${normalizedUserId}`) };
  }

  const existing = (existingVisitorId ?? '').trim();
  if (existing && existing.length <= MAX_VISITOR_ID_LENGTH) {
    return { voterKey: deriveVoterKey(`anon:${existing}`) };
  }

  const minted = randomUUID();
  return {
    voterKey: deriveVoterKey(`anon:${minted}`),
    setCookie: visitorCookie(minted),
  };
}

/** Convenience wrapper for callers that hold a Fetch `Request`. */
export function resolveVoterIdentityFromRequest(request: Request, userId?: string | null): VoterIdentity {
  return resolveVoterIdentity(readCookieValue(request.headers.get('cookie'), VISITOR_COOKIE_NAME), userId);
}

function normalizeState(payload: unknown): ChangelogBumpState {
  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const rawCounts = (record.counts && typeof record.counts === 'object' ? record.counts : {}) as Record<string, unknown>;

  const counts: Record<string, number> = {};
  for (const [sectionId, value] of Object.entries(rawCounts)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) counts[sectionId] = Math.trunc(parsed);
  }

  return {
    counts,
    bumped: Array.isArray(record.bumped) ? record.bumped.filter((entry): entry is string => typeof entry === 'string') : [],
    remaining: Math.max(0, Number(record.remaining) || 0),
    maxBumps: Math.max(1, Number(record.maxBumps) || MAX_CHANGELOG_BUMPS),
  };
}

function normalizeStatus(payload: unknown): BumpStatus {
  const status = (payload as Record<string, unknown> | null)?.status;
  return status === 'bumped' || status === 'no_bumps_remaining' ? status : 'already_bumped';
}

export async function loadChangelogBumpState(voterKey: string): Promise<ChangelogBumpState> {
  const { data, error } = await supabaseAdmin.rpc('changelog_bump_state_v1', {
    p_voter_key: voterKey,
    p_max_bumps: MAX_CHANGELOG_BUMPS,
  });
  if (error) throw error;
  return normalizeState(data);
}

export async function bumpChangelogSection(voterKey: string, sectionId: string): Promise<ChangelogBumpResult> {
  const { data, error } = await supabaseAdmin.rpc('bump_changelog_section_v1', {
    p_voter_key: voterKey,
    p_section_id: sectionId,
    p_max_bumps: MAX_CHANGELOG_BUMPS,
  });
  if (error) throw error;
  return { ...normalizeState(data), status: normalizeStatus(data) };
}
