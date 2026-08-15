/**
 * Registry for dismiss-once notices and prompts.
 *
 * Every entry here is something a user sees at most once per account. Keeping them in one place
 * lets the administrator debug tools re-arm them without hunting for individual storage keys.
 */

export type OneTimeNoticeId =
  | "sync-review"
  | "flashcards-reminder"
  | "guided-tours"
  | "upcoming-changelog"
  | "feedback-announcement"

export interface OneTimeNoticeDefinition {
  readonly id: OneTimeNoticeId
  readonly label: string
  readonly description: string
  /** Local storage keys to remove. A trailing `*` clears every key with that prefix. */
  readonly storageKeys: readonly string[]
  /** Guided tours also live in server-side user preferences. */
  readonly clearsTourPreferences?: boolean
}

export const SYNC_REVIEW_ACK_KEY = "millennium_acked_sync_review_v1"
export const STUDY_REMINDER_KEY_PREFIX = "millennium-study-reminder:"
export const TOUR_PREFERENCES_KEY_PREFIX = "millennium-tour-preferences"
export const UPCOMING_CHANGELOG_NOTICE_KEY = "millennium-upcoming-changelog-notice"
export const FEEDBACK_NOTICE_KEY = "millennium-feedback-announcement"

export const ONE_TIME_NOTICES: readonly OneTimeNoticeDefinition[] = [
  {
    id: "guided-tours",
    label: "Guided tours",
    description: "Re-arms the welcome / what's new announcement and both dashboard tours.",
    storageKeys: [`${TOUR_PREFERENCES_KEY_PREFIX}*`],
    clearsTourPreferences: true,
  },
  {
    id: "sync-review",
    label: "Sync review prompts",
    description: "Clears acknowledged room-change and unenrolment review prompts.",
    storageKeys: [SYNC_REVIEW_ACK_KEY],
  },
  {
    id: "flashcards-reminder",
    label: "Flashcards due reminder",
    description: "Allows today's 'cards are due' reminder toast to appear again.",
    storageKeys: [`${STUDY_REMINDER_KEY_PREFIX}*`],
  },
  {
    id: "upcoming-changelog",
    label: "Upcoming release teaser",
    description: "Shows the 'Big things are coming to Millennium' popup again.",
    storageKeys: [`${UPCOMING_CHANGELOG_NOTICE_KEY}*`],
  },
  {
    id: "feedback-announcement",
    label: "Bugs and suggestions announcement",
    description: "Shows the popup introducing the sidebar's Bugs/Suggestions button again.",
    storageKeys: [`${FEEDBACK_NOTICE_KEY}*`],
  },
]

export function scopedNoticeKey(baseKey: string, userId: string | null | undefined): string {
  const normalized = (userId ?? "").trim()
  return normalized ? `${baseKey}:${encodeURIComponent(normalized)}` : baseKey
}

export function isNoticeDismissed(baseKey: string, userId?: string | null): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(scopedNoticeKey(baseKey, userId)) === "dismissed"
  } catch {
    return false
  }
}

export function dismissNotice(baseKey: string, userId?: string | null): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(scopedNoticeKey(baseKey, userId), "dismissed")
  } catch {
    // Storage can be unavailable in private modes. The notice simply reappears next session.
  }
}

function removeStorageKey(pattern: string): void {
  if (!pattern.endsWith("*")) {
    window.localStorage.removeItem(pattern)
    return
  }

  const prefix = pattern.slice(0, -1)
  const matches = Object.keys(window.localStorage).filter((key) => key.startsWith(prefix))
  for (const key of matches) window.localStorage.removeItem(key)
}

/** Clears the local traces of a one-time notice. Server-side state is handled by the caller. */
export function clearOneTimeNoticeStorage(notice: OneTimeNoticeDefinition): boolean {
  if (typeof window === "undefined") return false
  try {
    for (const pattern of notice.storageKeys) removeStorageKey(pattern)
    return true
  } catch {
    return false
  }
}

export function getOneTimeNotice(id: string): OneTimeNoticeDefinition | undefined {
  return ONE_TIME_NOTICES.find((notice) => notice.id === id)
}
