/**
 * Layout preferences for the notifications page: which sidebar entries appear, in what order,
 * and how wide the two fixed columns are.
 *
 * Sidebar entry ids are either a built-in category (`inbox`, `pinned`, …) or a folder,
 * addressed as `folder:<id>` so both kinds live in one ordered list.
 */

import type { NotificationFolder } from './types'

export const NOTIFICATION_CATEGORY_IDS = [
  'inbox', 'pinned', 'alerts', 'events', 'assignments', 'archive',
] as const

export type NotificationCategoryId = (typeof NOTIFICATION_CATEGORY_IDS)[number]

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategoryId, string> = {
  inbox: 'Inbox',
  pinned: 'Pinned',
  alerts: 'Alerts',
  events: 'Events',
  assignments: 'Assignments',
  archive: 'Archive',
}

export const FOLDER_ID_PREFIX = 'folder:'

export const DEFAULT_NOTIFICATION_SIDEBAR_WIDTH = 60
export const MIN_NOTIFICATION_SIDEBAR_WIDTH = 52
export const MAX_NOTIFICATION_SIDEBAR_WIDTH = 120

export const DEFAULT_NOTIFICATION_LIST_WIDTH = 400
export const MIN_NOTIFICATION_LIST_WIDTH = 280
export const MAX_NOTIFICATION_LIST_WIDTH = 720

export function folderSidebarId(folderId: string): string {
  return `${FOLDER_ID_PREFIX}${folderId}`
}

export function folderIdFromSidebarId(sidebarId: string): string | null {
  return sidebarId.startsWith(FOLDER_ID_PREFIX) ? sidebarId.slice(FOLDER_ID_PREFIX.length) : null
}

export function clampSidebarWidth(value: unknown): number {
  return clamp(value, DEFAULT_NOTIFICATION_SIDEBAR_WIDTH, MIN_NOTIFICATION_SIDEBAR_WIDTH, MAX_NOTIFICATION_SIDEBAR_WIDTH)
}

export function clampListWidth(value: unknown): number {
  return clamp(value, DEFAULT_NOTIFICATION_LIST_WIDTH, MIN_NOTIFICATION_LIST_WIDTH, MAX_NOTIFICATION_LIST_WIDTH)
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export interface NotificationSidebarEntry {
  id: string
  label: string
  /** Present for folder entries so the caller can resolve the icon. */
  folder?: NotificationFolder
}

/**
 * Categories are part of the sidebar unless hidden; folders are opt-in. Folders are a
 * filing detail most readers never create, so an unconfigured sidebar shows the six
 * built-in tabs and nothing else.
 */
export function isNotificationEntryVisibleByDefault(id: string): boolean {
  return !id.startsWith(FOLDER_ID_PREFIX)
}

export function isNotificationEntryVisible(
  id: string,
  visibility: Readonly<Record<string, 'show' | 'hide'>>
): boolean {
  const saved = visibility[id]
  if (saved === 'show') return true
  if (saved === 'hide') return false
  return isNotificationEntryVisibleByDefault(id)
}

/**
 * Resolves the saved order and visibility against the folders that currently exist.
 *
 * Entries absent from the saved order (a new folder, or a category added after the
 * preference was written) are appended so nothing silently disappears from the sidebar.
 */
export function resolveNotificationSidebarEntries(
  folders: readonly NotificationFolder[],
  order: readonly string[],
  visibility: Readonly<Record<string, 'show' | 'hide'>>
): NotificationSidebarEntry[] {
  return listNotificationSidebarOptions(folders, order)
    .filter((entry) => isNotificationEntryVisible(entry.id, visibility))
}

/** Every entry that could appear in the sidebar, in saved order, regardless of visibility. */
export function listNotificationSidebarOptions(
  folders: readonly NotificationFolder[],
  order: readonly string[]
): NotificationSidebarEntry[] {
  const available = new Map<string, NotificationSidebarEntry>()
  NOTIFICATION_CATEGORY_IDS.forEach((id) => {
    available.set(id, { id, label: NOTIFICATION_CATEGORY_LABELS[id] })
  })
  folders.forEach((folder) => {
    const id = folderSidebarId(folder.id)
    available.set(id, { id, label: folder.title, folder })
  })

  const ordered: NotificationSidebarEntry[] = []
  const seen = new Set<string>()

  order.forEach((id) => {
    const entry = available.get(id)
    if (!entry || seen.has(id)) return
    seen.add(id)
    ordered.push(entry)
  })

  available.forEach((entry, id) => {
    if (!seen.has(id)) ordered.push(entry)
  })

  return ordered
}
