import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { normalizeClassroomSnapshot } from './classroom-data';
import { supabaseAdmin } from './supabase';
import type {
  ClassroomSnapshot,
  ClassroomSyncSession,
  ClassroomSyncSessionStatus,
} from '../types/classroom';

const CLASSROOM_SYNC_SESSION_TTL_MS = 10 * 60 * 1000;
const CLASSROOM_SYNC_SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLASSROOM_SNAPSHOT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const CLASSROOM_SYNC_TOKEN_BYTES = 32;
const CLASSROOM_SYNC_TOKEN_MAX_LENGTH = 128;
const CLASSROOM_SYNC_STATUSES = new Set<ClassroomSyncSessionStatus>([
  'pending',
  'uploading',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);

interface ClassroomSyncSessionRow {
  id: string;
  user_id: string;
  status: string;
  error_code: string | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatedClassroomSyncSession {
  session: ClassroomSyncSession;
  uploadToken: string;
}

export type ClassroomSyncUploadOutcome = 'completed' | 'invalid' | 'partial' | 'stale';

export type CancelClassroomSyncSessionResult =
  | { outcome: 'cancelled'; session: ClassroomSyncSession }
  | { outcome: 'not-cancellable'; session: ClassroomSyncSession }
  | { outcome: 'not-found' };

export class ClassroomSyncSessionConflictError extends Error {
  readonly code = 'CLASSROOM_SYNC_ALREADY_ACTIVE';

  constructor() {
    super('A Classroom sync upload is already active.');
    this.name = 'ClassroomSyncSessionConflictError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isClassroomSyncSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function classroomSyncTokenSecret(): string {
  const dedicatedSecret = process.env.CLASSROOM_SYNC_TOKEN_SECRET?.trim();
  if (dedicatedSecret) return dedicatedSecret;

  if (process.env.NODE_ENV !== 'production') {
    const developmentFallback = process.env.SESSION_SECRET?.trim();
    if (developmentFallback) return developmentFallback;
  }

  throw new Error('CLASSROOM_SYNC_TOKEN_SECRET is required for Classroom sync uploads');
}

function classroomSyncTokenHash(sessionId: string, token: string): string {
  return createHash('sha256')
    .update('millennium:classroom-sync-upload-token:v1\0', 'utf8')
    .update(classroomSyncTokenSecret(), 'utf8')
    .update('\0', 'utf8')
    .update(sessionId, 'utf8')
    .update('\0', 'utf8')
    .update(token, 'utf8')
    .digest('hex');
}

function sessionStatus(value: unknown): ClassroomSyncSessionStatus {
  if (typeof value !== 'string' || !CLASSROOM_SYNC_STATUSES.has(value as ClassroomSyncSessionStatus)) {
    throw new Error('Classroom sync session has an invalid status');
  }
  return value as ClassroomSyncSessionStatus;
}

function sessionRow(value: unknown): ClassroomSyncSessionRow {
  if (!isRecord(value)) throw new Error('Classroom sync session row is invalid');
  const { id, user_id: userId, status, error_code: errorCode, expires_at: expiresAt } = value;
  const { completed_at: completedAt, created_at: createdAt, updated_at: updatedAt } = value;
  if (
    typeof id !== 'string'
    || typeof userId !== 'string'
    || typeof status !== 'string'
    || typeof expiresAt !== 'string'
    || typeof createdAt !== 'string'
    || typeof updatedAt !== 'string'
    || (errorCode !== null && errorCode !== undefined && typeof errorCode !== 'string')
    || (completedAt !== null && completedAt !== undefined && typeof completedAt !== 'string')
  ) {
    throw new Error('Classroom sync session row is invalid');
  }

  return {
    id,
    user_id: userId,
    status,
    error_code: typeof errorCode === 'string' ? errorCode : null,
    expires_at: expiresAt,
    completed_at: typeof completedAt === 'string' ? completedAt : null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function mapSession(value: unknown): ClassroomSyncSession {
  const row = sessionRow(value);
  const storedStatus = sessionStatus(row.status);
  const status = storedStatus === 'pending' && new Date(row.expires_at).getTime() <= Date.now()
    ? 'expired'
    : storedStatus;
  return {
    id: row.id,
    status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
  };
}

function rpcResult(value: unknown): Record<string, unknown> {
  const result: unknown = Array.isArray(value) ? value[0] : value;
  if (!isRecord(result)) throw new Error('Classroom sync RPC returned an invalid result');
  return result;
}

export async function createClassroomSyncSession(userId: string): Promise<CreatedClassroomSyncSession> {
  const id = randomUUID();
  const uploadToken = randomBytes(CLASSROOM_SYNC_TOKEN_BYTES).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CLASSROOM_SYNC_SESSION_TTL_MS).toISOString();
  const retentionExpiresAt = new Date(now.getTime() + CLASSROOM_SYNC_SESSION_RETENTION_MS).toISOString();
  const { data, error } = await supabaseAdmin.rpc('create_classroom_sync_session', {
    p_session_id: id,
    p_user_id: userId,
    p_token_hash: classroomSyncTokenHash(id, uploadToken),
    p_expires_at: expiresAt,
    p_retention_expires_at: retentionExpiresAt,
  });
  if (error) throw error;

  const result = rpcResult(data as unknown);
  if (result.conflict === true) throw new ClassroomSyncSessionConflictError();
  if (result.created !== true) throw new Error('Classroom sync session was not created');
  return {
    session: {
      id,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
      updatedAt: now.toISOString(),
    },
    uploadToken,
  };
}

export async function getClassroomSyncSession(
  userId: string,
  sessionId: string,
): Promise<ClassroomSyncSession | null> {
  if (!isClassroomSyncSessionId(sessionId)) return null;

  const { data, error } = await supabaseAdmin
    .from('classroom_sync_sessions')
    .select('id, user_id, status, error_code, expires_at, completed_at, created_at, updated_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSession(data as unknown) : null;
}

export async function cancelClassroomSyncSession(
  userId: string,
  sessionId: string,
): Promise<CancelClassroomSyncSessionResult> {
  const existing = await getClassroomSyncSession(userId, sessionId);
  if (!existing) return { outcome: 'not-found' };
  if (existing.status !== 'pending') return { outcome: 'not-cancellable', session: existing };

  const now = new Date();
  const { data, error } = await supabaseAdmin
    .from('classroom_sync_sessions')
    .update({
      status: 'cancelled',
      token_hash: null,
      updated_at: now.toISOString(),
      retention_expires_at: new Date(now.getTime() + CLASSROOM_SYNC_SESSION_RETENTION_MS).toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('id, user_id, status, error_code, expires_at, completed_at, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  if (data) return { outcome: 'cancelled', session: mapSession(data as unknown) };

  const latest = await getClassroomSyncSession(userId, sessionId);
  return latest ? { outcome: 'not-cancellable', session: latest } : { outcome: 'not-found' };
}

export async function completeClassroomSyncUpload(
  sessionId: string,
  token: string,
  snapshot: ClassroomSnapshot,
): Promise<ClassroomSyncUploadOutcome> {
  if (
    !isClassroomSyncSessionId(sessionId)
    || token.length === 0
    || token.length > CLASSROOM_SYNC_TOKEN_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return 'invalid';
  }

  const normalized = normalizeClassroomSnapshot(snapshot);
  const { data, error } = await supabaseAdmin.rpc('complete_classroom_sync_upload', {
    p_session_id: sessionId,
    p_token_hash: classroomSyncTokenHash(sessionId, token),
    p_snapshot: normalized,
    p_schema_version: normalized.version,
    p_integrity: normalized.sync.integrity,
    p_course_count: normalized.sync.counts.courses,
    p_item_count: normalized.sync.counts.items,
    p_last_synced_at: normalized.sync.syncedAt,
    p_retention_expires_at: new Date(Date.now() + CLASSROOM_SNAPSHOT_RETENTION_MS).toISOString(),
  });
  if (error) throw error;

  const outcome = rpcResult(data as unknown).outcome;
  if (outcome === 'completed' || outcome === 'invalid' || outcome === 'partial' || outcome === 'stale') {
    return outcome;
  }
  throw new Error('Classroom sync upload returned an invalid outcome');
}
