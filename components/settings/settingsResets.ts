/**
 * Which stored preferences each settings section owns, so one section can be restored to
 * its defaults without disturbing the others.
 *
 * Sections whose state lives elsewhere (shortcuts bindings, animation settings, class colours)
 * are reset through their own callbacks rather than through this map — see `SETTINGS_RESETTABLE`.
 */

import { defaultHomeSettings } from '../../types/home'
import type { HomeSettings } from '../../types/home'
import type { SettingsSectionId } from '../dashboard/navigation/dashboardRegistry'

const GENERAL_KEYS = [
  'dateFormat',
  'startPage',
  'usePointerCursors',
  'convertEmoticonsToEmojis',
  'sidebarItemVisibility',
  'sidebarItemOrder',
  'homeCardStyle',
  'columns',
  'mobileColumns',
  'homeWiggleEnabled',
  'timetableMergeConsecutivePeriods',
  'timetableShowBothWeeks',
] as const satisfies readonly (keyof HomeSettings)[]

const ASSISTANT_KEYS = [
  'showAiAgent',
  'assistantSummarizeThinking',
  'assistantTone',
] as const satisfies readonly (keyof HomeSettings)[]

const NOTIFICATION_KEYS = [
  'notificationsFallback',
  'notificationsUnreadSection',
  'disableFutureNotifications',
  'notificationAutoArchiveAfter',
  'notificationRules',
  'notificationSidebarOrder',
  'notificationSidebarVisibility',
  'notificationSidebarWidth',
  'notificationListWidth',
  'hiddenNotificationCategories',
] as const satisfies readonly (keyof HomeSettings)[]

const FLASHCARD_KEYS = [
  'studyReviewNotifications',
] as const satisfies readonly (keyof HomeSettings)[]

const HOME_SETTINGS_BY_SECTION: Partial<Record<SettingsSectionId, readonly (keyof HomeSettings)[]>> = {
  general: GENERAL_KEYS,
  assistant: ASSISTANT_KEYS,
  notifications: NOTIFICATION_KEYS,
  flashcards: FLASHCARD_KEYS,
}

/** Sections that expose a "reset this section" control. */
export const SETTINGS_RESETTABLE: readonly SettingsSectionId[] = [
  'general',
  'assistant',
  'notifications',
  'flashcards',
  'animations',
  'shortcuts',
  'class-colors',
]

export function isResettableSettingsSection(section: SettingsSectionId): boolean {
  return SETTINGS_RESETTABLE.includes(section)
}

/** Default values for the home settings a section owns, or null when it owns none. */
export function defaultHomeSettingsForSection(section: SettingsSectionId): Partial<HomeSettings> | null {
  const keys = HOME_SETTINGS_BY_SECTION[section]
  if (!keys) return null

  return keys.reduce<Partial<HomeSettings>>((defaults, key) => {
    // Structured clone keeps the shared default object immutable when callers mutate a copy.
    const value = defaultHomeSettings[key]
    return {
      ...defaults,
      [key]: Array.isArray(value) ? [...value] : (value && typeof value === 'object' ? { ...value } : value),
    }
  }, {})
}
