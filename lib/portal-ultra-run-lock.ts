type LockRecord = {
  expiresAt: number;
  label?: string;
};

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

export const GLOBAL_ULTRA_RUN_LOCK_KEY = 'global:portal-ultra-run';

const globalStore = globalThis as typeof globalThis & {
  __millenniumUltraRunLocks?: Map<string, LockRecord>;
};

const locks = globalStore.__millenniumUltraRunLocks ?? new Map<string, LockRecord>();
globalStore.__millenniumUltraRunLocks = locks;

function normalizeKey(key: string) {
  return key.trim().toLowerCase();
}

function isExpired(record: LockRecord | undefined) {
  return !record || record.expiresAt <= Date.now();
}

export function isUltraRunLockActive(key: string): boolean {
  const normalized = normalizeKey(key);
  const record = locks.get(normalized);
  if (isExpired(record)) {
    locks.delete(normalized);
    return false;
  }
  return true;
}

export function acquireUltraRunLock(key: string, label?: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const normalized = normalizeKey(key);
  if (isUltraRunLockActive(normalized)) return false;
  locks.set(normalized, {
    expiresAt: Date.now() + ttlMs,
    label,
  });
  return true;
}

export function releaseUltraRunLock(key: string) {
  locks.delete(normalizeKey(key));
}

export function releaseUltraRunLocks(keys: string[]) {
  keys.forEach(releaseUltraRunLock);
}
