import type { PortalData } from '@/types/portal'
import type { ClassroomSnapshot } from '@/types/classroom'
import type {
  DesktopBootstrapCache,
  DesktopBootstrapPayload,
  DesktopBootstrapWriteRequest,
  DesktopClassroomSnapshot,
  DesktopIdentity,
  DesktopRecordReconciliation,
  DesktopSecureRecordKind,
} from '@/types/desktop'
import { compactPortalNotices } from '@/lib/portal-data-merge'

import { isDesktopApp } from './utils'

const PORTAL_CACHE_KEY = 'millennium-portal-data-cache-v2'
const PORTAL_CACHE_OWNER_KEY = 'millennium-portal-cache-owner-v1'
const BROWSER_CACHE_DB_NAME = 'millennium-cache-v1'
const BROWSER_CACHE_STORE = 'portal_cache'
const BROWSER_CACHE_RECORD = 'current'
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const MIN_CACHE_TIMESTAMP_MS = Date.UTC(2000, 0, 1)
const MAX_CACHE_FUTURE_SKEW_MS = 5 * 60_000

interface PortalCacheEnvelope {
  version: 2
  ownerUid: string
  data: PortalData
  savedAt: string
  // True only for snapshots that came from a full server read (or a merge on
  // top of one). Incremental sync deltas are cached as incomplete so the next
  // hydration repairs them with an authoritative read instead of trusting a
  // truncated snapshot forever.
  complete?: boolean
}

export interface PortalCacheEntry {
  data: PortalData
  complete: boolean
}

let browserCacheDbPromise: Promise<IDBDatabase | null> | null = null
let desktopBootstrapUpdateFlight: Promise<void> = Promise.resolve()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !RFC3339_PATTERN.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    && timestamp >= MIN_CACHE_TIMESTAMP_MS
    && timestamp <= Date.now() + MAX_CACHE_FUTURE_SKEW_MS
}

function isDesktopIdentity(value: unknown): value is DesktopIdentity {
  if (!isRecord(value)) return false
  return typeof value.ownerId === 'string'
    && value.ownerId.length > 0
    && value.ownerId.length <= 128
    && typeof value.displayName === 'string'
    && value.displayName.length > 0
    && value.displayName.length <= 200
    && typeof value.school === 'string'
    && value.school.length > 0
    && value.school.length <= 200
    && isValidIsoDate(value.lastAuthenticatedAt)
    && value.schemaVersion === 1
    && (value.portalUid === undefined || typeof value.portalUid === 'string')
    && (value.role === undefined || value.role === 'user' || value.role === 'admin')
    && (value.lastBootstrapAt === undefined || isValidIsoDate(value.lastBootstrapAt))
}

function normalizePortalCacheData(value: unknown): PortalData | null {
  if (!isRecord(value) || !isRecord(value.user)) return null
  const name = typeof value.user.name === 'string' ? value.user.name : ''
  const school = typeof value.user.school === 'string' ? value.user.school : ''
  if (!name || !school) return null

  return {
    ...value,
    user: {
      ...value.user,
      name,
      school,
      uid: typeof value.user.uid === 'string' ? value.user.uid : undefined,
    },
    timetable: Array.isArray(value.timetable) || isRecord(value.timetable) ? value.timetable : [],
    notices: compactPortalNotices(value.notices),
    diary: Array.isArray(value.diary) ? value.diary : [],
    lastUpdated: isValidIsoDate(value.lastUpdated)
      ? value.lastUpdated
      : new Date().toISOString(),
  } as PortalData
}

async function invokeSecureCache<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktopApp()) throw new Error('Secure desktop cache is only available in Millennium Desktop.')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export function rememberPortalCacheOwner(ownerUid: string | null | undefined): void {
  if (typeof window === 'undefined' || isDesktopApp()) return
  try {
    if (ownerUid) window.localStorage.setItem(PORTAL_CACHE_OWNER_KEY, ownerUid)
    else window.localStorage.removeItem(PORTAL_CACHE_OWNER_KEY)
  } catch {
    // IndexedDB may still provide browser cache persistence.
  }
}

function getVerifiedOwnerUid(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(PORTAL_CACHE_OWNER_KEY)
  } catch {
    return null
  }
}

function parseCacheEnvelope(
  raw: string | Partial<PortalCacheEnvelope> | null,
  ownerUid?: string
): PortalCacheEnvelope | null {
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string'
      ? JSON.parse(raw) as Partial<PortalCacheEnvelope>
      : raw
    const expectedOwner = ownerUid || getVerifiedOwnerUid()
    if (parsed.version !== 2 || !parsed.ownerUid || !expectedOwner || parsed.ownerUid !== expectedOwner) return null
    const data = normalizePortalCacheData(parsed.data)
    if (!data) return null
    return {
      ...parsed,
      version: 2,
      ownerUid: parsed.ownerUid,
      data,
      // Envelopes written before completeness tracking are treated as
      // unverified so they get one authoritative read instead of persisting a
      // snapshot that may already be truncated.
      complete: parsed.complete === true,
    } as PortalCacheEnvelope
  } catch {
    return null
  }
}

function createCacheEnvelope(data: PortalData, ownerUid?: string, complete = true): PortalCacheEnvelope | null {
  const resolvedOwner = ownerUid || data.userId || data.user?.uid || getVerifiedOwnerUid()
  if (!resolvedOwner) return null
  return {
    version: 2,
    ownerUid: resolvedOwner,
    data,
    savedAt: new Date().toISOString(),
    complete,
  }
}

function toCacheEntry(envelope: PortalCacheEnvelope | null): PortalCacheEntry | null {
  return envelope ? { data: envelope.data, complete: envelope.complete === true } : null
}

function readMemoryCache(ownerUid?: string): PortalCacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PORTAL_CACHE_KEY)
    return toCacheEntry(parseCacheEnvelope(raw, ownerUid))
  } catch {
    return null
  }
}

function writeMemoryCache(envelope: PortalCacheEnvelope): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PORTAL_CACHE_KEY, JSON.stringify(envelope))
  } catch {
    // IndexedDB remains the durable browser fallback when localStorage is full,
    // but reads prefer localStorage: drop the older entry so a quota failure
    // cannot pin the dashboard to a stale, smaller snapshot.
    try {
      window.localStorage.removeItem(PORTAL_CACHE_KEY)
    } catch {
      // Nothing else to clean up when localStorage is unavailable entirely.
    }
  }
}

function openBrowserCacheDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined' || isDesktopApp()) {
    return Promise.resolve(null)
  }
  if (browserCacheDbPromise) return browserCacheDbPromise

  browserCacheDbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(BROWSER_CACHE_DB_NAME, 1)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(BROWSER_CACHE_STORE)) {
          database.createObjectStore(BROWSER_CACHE_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })

  return browserCacheDbPromise
}

async function readBrowserCache(ownerUid?: string): Promise<PortalCacheEntry | null> {
  if (!ownerUid) return null
  const database = await openBrowserCacheDb()
  if (!database) return null
  return new Promise((resolve) => {
    try {
      const request = database
        .transaction(BROWSER_CACHE_STORE, 'readonly')
        .objectStore(BROWSER_CACHE_STORE)
        .get(BROWSER_CACHE_RECORD)
      request.onsuccess = () => {
        const raw = request.result as Partial<PortalCacheEnvelope> | undefined
        resolve(toCacheEntry(parseCacheEnvelope(raw || null, ownerUid)))
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function writeBrowserCache(envelope: PortalCacheEnvelope): Promise<void> {
  const database = await openBrowserCacheDb()
  if (!database) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(BROWSER_CACHE_STORE, 'readwrite')
      transaction.objectStore(BROWSER_CACHE_STORE).put(envelope, BROWSER_CACHE_RECORD)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

async function clearBrowserCache(): Promise<void> {
  const database = await openBrowserCacheDb()
  if (!database) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(BROWSER_CACHE_STORE, 'readwrite')
      transaction.objectStore(BROWSER_CACHE_STORE).delete(BROWSER_CACHE_RECORD)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function readDesktopIdentity(): Promise<DesktopIdentity | null> {
  if (!isDesktopApp()) return null
  return invokeSecureCache<DesktopIdentity | null>('read_desktop_identity')
}

export async function writeDesktopIdentity(identity: DesktopIdentity): Promise<void> {
  await invokeSecureCache<void>('write_desktop_identity', { identity })
}

async function resolveDesktopOwner(expectedOwner?: string): Promise<DesktopIdentity | null> {
  const identity = await readDesktopIdentity()
  if (!identity) return null
  if (!expectedOwner || expectedOwner === identity.ownerId || expectedOwner === identity.portalUid) return identity
  return null
}

function identityFromPortalData(data: PortalData, expectedOwner?: string): DesktopIdentity | null {
  const record = data as PortalData & { userId?: string }
  const ownerId = record.userId || expectedOwner
  if (!ownerId || !data.user?.name || !data.user?.school) return null
  return {
    ownerId,
    portalUid: data.user.uid,
    displayName: data.user.name,
    school: data.user.school,
    lastAuthenticatedAt: new Date().toISOString(),
    lastBootstrapAt: data.lastUpdated || undefined,
    schemaVersion: 1,
  }
}

async function ensureDesktopIdentity(data: PortalData, expectedOwner?: string): Promise<DesktopIdentity | null> {
  const existing = await resolveDesktopOwner(expectedOwner)
  if (existing) return existing
  const identity = identityFromPortalData(data, expectedOwner)
  if (!identity) return null
  await writeDesktopIdentity(identity)
  return identity
}

export async function readPortalDataCacheEntry(ownerUid?: string): Promise<PortalCacheEntry | null> {
  if (isDesktopApp()) {
    const identity = await resolveDesktopOwner(ownerUid)
    if (!identity) return null
    const data = await invokeSecureCache<PortalData | null>('read_secure_cache', {
      ownerId: identity.ownerId,
      kind: 'portal-data' satisfies DesktopSecureRecordKind,
    })
    // Desktop bootstrap only ever persists full server snapshots.
    return data ? { data, complete: true } : null
  }

  return readMemoryCache(ownerUid) || await readBrowserCache(ownerUid)
}

export async function readPortalDataCache(ownerUid?: string): Promise<PortalData | null> {
  return (await readPortalDataCacheEntry(ownerUid))?.data ?? null
}

export async function writePortalDataCache(
  data: unknown,
  ownerUid?: string,
  options: { complete?: boolean } = {}
): Promise<void> {
  const portalData = normalizePortalCacheData(data)
  if (!portalData) return

  if (isDesktopApp()) {
    // The secure desktop record carries no completeness marker, so never let an
    // unverified snapshot replace the durable one it was merged from.
    if (options.complete === false) return
    const identity = await ensureDesktopIdentity(portalData, ownerUid)
    if (!identity) return
    if (!portalData.userId || portalData.userId !== identity.ownerId) {
      throw new Error('Portal cache owner does not match the active desktop account.')
    }
    if (identity.portalUid && portalData.user.uid && identity.portalUid !== portalData.user.uid) {
      throw new Error('Portal cache UID does not match the active desktop account.')
    }
    await invokeSecureCache<void>('write_secure_cache', {
      ownerId: identity.ownerId,
      kind: 'portal-data' satisfies DesktopSecureRecordKind,
      payload: portalData,
    })
    return
  }

  const envelope = createCacheEnvelope(portalData, ownerUid, options.complete !== false)
  if (!envelope) return
  rememberPortalCacheOwner(envelope.ownerUid)
  writeMemoryCache(envelope)
  await writeBrowserCache(envelope)
}

export async function clearPortalDataCache(): Promise<void> {
  if (isDesktopApp()) {
    const identity = await readDesktopIdentity()
    if (!identity) return
    await invokeSecureCache<void>('delete_secure_cache', {
      ownerId: identity.ownerId,
      kind: 'portal-data' satisfies DesktopSecureRecordKind,
    })
    return
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PORTAL_CACHE_KEY)
      window.localStorage.removeItem(PORTAL_CACHE_OWNER_KEY)
    } catch {
      // IndexedDB cleanup still runs.
    }
  }
  await clearBrowserCache()
}

function isNonEmptyString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength
}

function isApprovedGoogleUrl(value: unknown): value is string {
  if (!isNonEmptyString(value, 2048)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && ['classroom.google.com', 'docs.google.com', 'drive.google.com'].includes(url.hostname)
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

function isClassroomSnapshot(value: unknown): value is DesktopClassroomSnapshot {
  if (!isRecord(value)
    || !isNonEmptyString(value.ownerId, 128)
    || value.version !== 1
    || !Array.isArray(value.courses)
    || value.courses.length > 200
    || !Array.isArray(value.items)
    || value.items.length > 10_000
    || !isRecord(value.coverage)
    || !isRecord(value.sync)
  ) return false

  const courseIds = new Set<string>()
  const coursesAreValid = value.courses.every((course) => {
    if (!isRecord(course)
      || !isNonEmptyString(course.id, 256)
      || courseIds.has(course.id)
      || !isNonEmptyString(course.title, 500)
      || !isApprovedGoogleUrl(course.url)
    ) return false
    courseIds.add(course.id)
    return true
  })
  if (!coursesAreValid) return false

  let attachmentCount = 0
  const itemIds = new Set<string>()
  const itemsAreValid = value.items.every((item) => {
    if (!isRecord(item)
      || !isNonEmptyString(item.id, 256)
      || itemIds.has(item.id)
      || !isNonEmptyString(item.courseId, 256)
      || !courseIds.has(item.courseId)
      || !['assignment', 'material', 'question', 'announcement', 'unknown'].includes(String(item.kind))
      || !isNonEmptyString(item.title, 500)
      || !isApprovedGoogleUrl(item.url)
      || !Array.isArray(item.attachments)
      || item.attachments.length > 20
    ) return false
    itemIds.add(item.id)
    attachmentCount += item.attachments.length
    return item.attachments.every((attachment) => isRecord(attachment)
      && isNonEmptyString(attachment.id, 256)
      && isNonEmptyString(attachment.name, 500)
      && isApprovedGoogleUrl(attachment.url)
      && ['document', 'spreadsheet', 'presentation', 'drive-file', 'link'].includes(String(attachment.kind)))
  })
  if (!itemsAreValid || attachmentCount > 25_000) return false

  const coverage = value.coverage
  const coverageIsValid = [
    coverage.courseListVisited,
    coverage.courseListComplete,
    coverage.emptyStateObserved,
  ].every((entry) => typeof entry === 'boolean')
    && [
      coverage.coursesObserved,
      coverage.coursePagesVisited,
      coverage.coursePagesFailed,
    ].every((entry) => Number.isSafeInteger(entry) && Number(entry) >= 0)
    && Array.isArray(coverage.issues)
    && coverage.issues.length <= 100
    && coverage.issues.every((issue) => typeof issue === 'string')
  if (!coverageIsValid) return false

  const sync = value.sync
  return sync.source === 'desktop-browser'
    && isNonEmptyString(sync.extractorVersion, 100)
    && isValidIsoDate(sync.syncedAt)
    && ['complete', 'partial', 'verified-empty'].includes(String(sync.integrity))
    && isRecord(sync.counts)
    && Object.values(sync.counts).every((count) => Number.isSafeInteger(count) && Number(count) >= 0)
}

export async function readClassroomDataCache(ownerId: string): Promise<DesktopClassroomSnapshot | null> {
  if (!isDesktopApp()) return null
  const identity = await resolveDesktopOwner(ownerId)
  if (!identity) return null
  const value = await invokeSecureCache<unknown>('read_saved_classroom_snapshot', {
    ownerId: identity.ownerId,
  })
  return isClassroomSnapshot(value) ? value : null
}

/**
 * Presence checks for the encrypted desktop caches.
 *
 * Boot only needs to know whether a cache is populated, and reading one back means decrypting and
 * transferring the whole snapshot across the IPC bridge just to test it for null. These ask the
 * native host for existence instead, which touches no ciphertext.
 *
 * They report that a record exists, not that its contents still parse — the callers use them to
 * decide whether an offline session is possible, and the real read that follows still validates.
 */
export async function hasPortalDataCache(ownerId?: string): Promise<boolean> {
  return hasSecureRecord('portal-data', ownerId)
}

export async function hasClassroomDataCache(ownerId: string): Promise<boolean> {
  return hasSecureRecord('classroom-data', ownerId)
}

async function hasSecureRecord(kind: DesktopSecureRecordKind, ownerId?: string): Promise<boolean> {
  if (!isDesktopApp()) return false
  const identity = await resolveDesktopOwner(ownerId)
  if (!identity) return false
  return invokeSecureCache<boolean>('secure_cache_record_exists', {
    ownerId: identity.ownerId,
    kind,
  })
}

export async function writeClassroomDataCache(
  ownerId: string,
  snapshot: ClassroomSnapshot
): Promise<void> {
  if (!isDesktopApp()) return
  const identity = await resolveDesktopOwner(ownerId)
  if (!identity) return
  const cachedSnapshot = { ...snapshot, ownerId: identity.ownerId }
  if (!isClassroomSnapshot(cachedSnapshot)) return
  await invokeSecureCache<void>('write_secure_cache', {
    ownerId: identity.ownerId,
    kind: 'classroom-data' satisfies DesktopSecureRecordKind,
    payload: cachedSnapshot,
  })
}

export async function clearClassroomDataCache(ownerId: string): Promise<void> {
  if (!isDesktopApp()) return
  const identity = await resolveDesktopOwner(ownerId)
  if (!identity) return
  await invokeSecureCache<void>('delete_secure_cache', {
    ownerId: identity.ownerId,
    kind: 'classroom-data' satisfies DesktopSecureRecordKind,
  })
}

export async function readDesktopBootstrapCache(ownerId: string): Promise<DesktopBootstrapCache | null> {
  if (!isDesktopApp()) return null
  const identity = await resolveDesktopOwner(ownerId)
  if (!identity) return null
  return invokeSecureCache<DesktopBootstrapCache | null>('read_secure_cache', {
    ownerId: identity.ownerId,
    kind: 'bootstrap' satisfies DesktopSecureRecordKind,
  })
}

function normalizeCalendarBootstrap(value: unknown): { events?: unknown[]; calendars?: unknown[] } | undefined {
  if (!isRecord(value)) return undefined
  return {
    ...(Array.isArray(value.events) ? { events: value.events } : {}),
    ...(Array.isArray(value.calendars) ? { calendars: value.calendars } : {}),
  }
}

function normalizeThemeBootstrap(value: unknown): { state?: unknown; customThemes?: unknown[] } | undefined {
  if (!isRecord(value)) return undefined
  return {
    ...(value.state !== undefined ? { state: value.state } : {}),
    ...(Array.isArray(value.customThemes) ? { customThemes: value.customThemes } : {}),
  }
}

export function parseDesktopBootstrapPayload(value: unknown): DesktopBootstrapPayload {
  if (!isRecord(value)
    || !isNonEmptyString(value.ownerId, 128)
    || !isDesktopIdentity(value.identity)
    || value.identity.ownerId !== value.ownerId
  ) {
    throw new Error('Desktop bootstrap identity is missing or invalid.')
  }

  const portalData = value.portalData === null ? null : normalizePortalCacheData(value.portalData)
  if (value.portalData !== null && !portalData) {
    throw new Error('Desktop bootstrap portal data is invalid.')
  }
  if (portalData && portalData.userId !== value.ownerId) {
    throw new Error('Desktop bootstrap portal owner does not match its identity.')
  }
  const classroomData = value.classroomData === null
    ? null
    : isClassroomSnapshot(value.classroomData)
      ? value.classroomData
      : null
  if (value.classroomData !== null && !classroomData) {
    throw new Error('Desktop bootstrap Classroom data is invalid.')
  }
  if (classroomData && classroomData.ownerId !== value.ownerId) {
    throw new Error('Desktop bootstrap Classroom owner does not match its identity.')
  }

  return {
    ownerId: value.ownerId,
    identity: value.identity,
    portalData,
    classroomData,
    preferences: value.preferences,
    notificationStates: value.notificationStates,
    localCalendar: normalizeCalendarBootstrap(value.localCalendar),
    googleMirror: normalizeCalendarBootstrap(value.googleMirror),
    themeBuilder: normalizeThemeBootstrap(value.themeBuilder),
    annotations: Array.isArray(value.annotations) ? value.annotations : undefined,
    lastSync: value.lastSync === null || isValidIsoDate(value.lastSync) ? value.lastSync : null,
  }
}

function reconcileRecord<T>(payload: T | null): DesktopRecordReconciliation<T> {
  return payload === null ? { action: 'preserve' } : { action: 'replace', payload }
}

export async function writeDesktopBootstrap(value: unknown): Promise<DesktopBootstrapPayload | null> {
  if (!isDesktopApp()) return null
  const payload = parseDesktopBootstrapPayload(value)
  const {
    portalData,
    classroomData,
    identity,
    ...bootstrapMetadata
  } = payload
  const request: DesktopBootstrapWriteRequest = {
    identity,
    portalData: reconcileRecord(portalData),
    classroomData: reconcileRecord(classroomData),
    bootstrap: bootstrapMetadata,
  }

  await invokeSecureCache<void>('write_desktop_bootstrap', { request })
  const persistedIdentity = await readDesktopIdentity()
  if (!persistedIdentity || persistedIdentity.ownerId !== payload.ownerId) {
    throw new Error('Desktop bootstrap identity could not be verified after persistence.')
  }
  return payload
}

export async function updateDesktopBootstrapCache(
  patch: Partial<DesktopBootstrapCache>
): Promise<void> {
  if (!isDesktopApp()) return
  const update = desktopBootstrapUpdateFlight
    .catch(() => undefined)
    .then(async () => {
      const identity = await readDesktopIdentity()
      if (!identity) throw new Error('Desktop identity is unavailable.')
      const current = await readDesktopBootstrapCache(identity.ownerId) || {}
      await invokeSecureCache<void>('write_secure_cache', {
        ownerId: identity.ownerId,
        kind: 'bootstrap' satisfies DesktopSecureRecordKind,
        payload: { ...current, ...patch, ownerId: identity.ownerId },
      })
    })
  desktopBootstrapUpdateFlight = update
  await update
}

export async function clearDesktopOwnerData(): Promise<void> {
  if (!isDesktopApp()) {
    await clearPortalDataCache()
    return
  }
  const identity = await readDesktopIdentity()
  if (!identity) return
  await invokeSecureCache<void>('clear_secure_owner', { ownerId: identity.ownerId })
}

export async function clearAllDesktopData(): Promise<void> {
  if (!isDesktopApp()) {
    await clearPortalDataCache()
    return
  }
  await invokeSecureCache<void>('clear_secure_cache')
}
