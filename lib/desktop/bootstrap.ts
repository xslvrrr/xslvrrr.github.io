import type { DesktopBootstrapPayload } from '@/types/desktop'

import { DESKTOP_BOOTSTRAP_UPDATED_EVENT } from './events'
import {
  readClassroomDataCache,
  readDesktopIdentity,
  readPortalDataCache,
  writeDesktopBootstrap,
} from './storage'

export class DesktopBootstrapRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DesktopBootstrapRequestError'
    this.status = status
  }
}

function getBootstrapErrorMessage(value: unknown, status: number): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.message === 'string' && record.message.trim()) return record.message
    if (record.error === 'DESKTOP_BACKEND_UNAVAILABLE') {
      return 'Local Millennium services are unavailable.'
    }
  }
  if (status === 401) return 'Sign in again to refresh online data.'
  if (status === 503) return 'Local Millennium services are unavailable.'
  return 'Desktop bootstrap failed.'
}

export async function refreshDesktopBootstrap(signal?: AbortSignal): Promise<DesktopBootstrapPayload> {
  const identity = await readDesktopIdentity().catch(() => null)
  const [portalData, classroomData] = identity
    ? await Promise.all([
        readPortalDataCache(identity.ownerId).catch(() => null),
        readClassroomDataCache(identity.ownerId).catch(() => null),
      ])
    : [null, null]
  const query = new URLSearchParams()
  if (portalData?.lastUpdated) query.set('portalSince', portalData.lastUpdated)
  if (classroomData?.sync?.syncedAt) query.set('classroomSince', classroomData.sync.syncedAt)
  const suffix = query.size ? `?${query.toString()}` : ''
  const response = await fetch(`/api/desktop/bootstrap${suffix}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new DesktopBootstrapRequestError(
      response.status,
      getBootstrapErrorMessage(body, response.status),
    )
  }
  if (signal?.aborted) throw new DOMException('Desktop bootstrap was cancelled.', 'AbortError')

  const payload = await writeDesktopBootstrap(body)
  if (!payload) {
    throw new DesktopBootstrapRequestError(500, 'Secure desktop storage is unavailable.')
  }
  window.dispatchEvent(new CustomEvent(DESKTOP_BOOTSTRAP_UPDATED_EVENT, { detail: payload }))
  return payload
}
