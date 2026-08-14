import { createHash, randomUUID } from 'node:crypto';
import type { PortalSyncOptions } from './data-settings';
import { logger } from './logger';
import { supabaseAdmin } from './supabase';

interface ActiveSync {
  signature: string;
  promise: Promise<unknown>;
}

interface Lease {
  ownerId: string;
  durable: boolean;
}

const globalStore = globalThis as typeof globalThis & {
  __millenniumPortalSyncFlights?: Map<string, ActiveSync>;
  __millenniumPortalLeaseWarningShown?: boolean;
  __millenniumPortalLeaseAvailable?: boolean;
};

const activeSyncs = globalStore.__millenniumPortalSyncFlights ?? new Map<string, ActiveSync>();
globalStore.__millenniumPortalSyncFlights = activeSyncs;

export class PortalSyncBusyError extends Error {
  readonly code = 'PORTAL_SYNC_IN_PROGRESS';
  readonly status = 409;
  readonly retryAfterMs = 2_000;

  constructor() {
    super('A Millennium sync is already running for this account.');
    this.name = 'PortalSyncBusyError';
  }
}

export function portalSyncSignature(options: PortalSyncOptions): string {
  return createHash('sha256').update(JSON.stringify(options)).digest('base64url').slice(0, 20);
}

async function acquireDurableLease(userId: string, signature: string, ttlSeconds: number): Promise<Lease> {
  const ownerId = randomUUID();
  if (globalStore.__millenniumPortalLeaseAvailable === false) return { ownerId, durable: false };
  try {
    const { data, error } = await supabaseAdmin.rpc('acquire_portal_sync_lease', {
      p_user_id: userId,
      p_owner_id: ownerId,
      p_signature: signature,
      p_ttl_seconds: ttlSeconds,
    });
    if (error) throw error;
    if (data !== true) throw new PortalSyncBusyError();
    globalStore.__millenniumPortalLeaseAvailable = true;
    return { ownerId, durable: true };
  } catch (error) {
    if (error instanceof PortalSyncBusyError) throw error;
    const code = String((error as any)?.code || '');
    const message = String((error as any)?.message || '');
    const migrationMissing = code === 'PGRST202' || code === '42883' || /acquire_portal_sync_lease/i.test(message);
    if (!migrationMissing) throw error;
    globalStore.__millenniumPortalLeaseAvailable = false;
    if (!globalStore.__millenniumPortalLeaseWarningShown) {
      globalStore.__millenniumPortalLeaseWarningShown = true;
      logger.warn('[Portal Sync] Durable lease unavailable; using process single-flight until migration is applied.');
    }
    return { ownerId, durable: false };
  }
}

async function releaseDurableLease(userId: string, lease: Lease): Promise<void> {
  if (!lease.durable) return;
  const { error } = await supabaseAdmin.rpc('release_portal_sync_lease', {
    p_user_id: userId,
    p_owner_id: lease.ownerId,
  });
  if (error) logger.warn('[Portal Sync] Failed to release durable lease:', error.message);
}

export async function runPortalSyncSingleFlight<T>(
  userId: string,
  signature: string,
  task: () => Promise<T>,
  ttlSeconds = 300,
): Promise<{ value: T; shared: boolean }> {
  const active = activeSyncs.get(userId);
  if (active) {
    if (active.signature !== signature) throw new PortalSyncBusyError();
    return { value: await active.promise as T, shared: true };
  }

  const promise = (async () => {
    const lease = await acquireDurableLease(userId, signature, ttlSeconds);
    try {
      return await task();
    } finally {
      await releaseDurableLease(userId, lease).catch(() => {});
    }
  })();

  activeSyncs.set(userId, { signature, promise });
  try {
    return { value: await promise, shared: false };
  } finally {
    if (activeSyncs.get(userId)?.promise === promise) activeSyncs.delete(userId);
  }
}
