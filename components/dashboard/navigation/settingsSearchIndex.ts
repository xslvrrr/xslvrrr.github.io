import {
  isPreReleaseSettingsSection,
  SETTINGS_SECTIONS,
  getSettingsSectionDefinition,
  type SettingsSectionId,
} from "./dashboardRegistry"

/**
 * Every searchable thing inside settings, indexed so the settings sidebar can answer "where
 * is the control called X?" rather than only matching whole section names.
 *
 * Rules for this index:
 * - `label` is copied verbatim from the control's on-screen label. Nothing is paraphrased,
 *   because a result that reads differently to the row it scrolls to looks like a bug.
 * - `heading` is the on-page heading that owns the control, so a result can say where it
 *   lives inside a long page.
 * - `anchor` matches a `data-settings-anchor` attribute rendered by the settings component,
 *   and `opener` matches the `data-settings-open` trigger that has to be clicked first when
 *   the control lives inside a dialog, collapsible, or accordion.
 *
 * Anything added here must exist in the UI; see lib/settings-focus.ts for how anchors are
 * resolved.
 */
export interface SettingsSearchEntry {
  readonly id: string
  readonly label: string
  readonly section: SettingsSectionId
  readonly kind?: "heading"
  readonly heading?: string
  readonly anchor?: string
  readonly opener?: string
  readonly fallbackAnchor?: string
  readonly keywords?: readonly string[]
}

export const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = [
  // ---------------------------------------------------------------- General
  { id: "general-heading-general", kind: "heading", label: "General", section: "general", anchor: "general-general", keywords: ["basics", "preferences"] },
  { id: "general-date-format", label: "Date Format", section: "general", heading: "General", anchor: "general-date-format", keywords: ["dmy", "mdy", "ymd", "dates"] },
  { id: "general-start-page", label: "Start Page", section: "general", heading: "General", anchor: "general-start-page", keywords: ["landing", "default page", "opens"] },
  { id: "general-pointer-cursors", label: "Use pointer cursors", section: "general", heading: "General", anchor: "general-pointer-cursors", keywords: ["cursor", "mouse", "hand"] },
  { id: "general-emoticons", label: "Convert emoticons to emojis", section: "general", heading: "General", anchor: "general-emoticons", keywords: ["emoji", "smiley"] },
  { id: "general-customise-sidebar", label: "Customise sidebar", section: "general", heading: "General", anchor: "general-sidebar-customizer", opener: "general-sidebar-customizer", fallbackAnchor: "general-customise-sidebar", keywords: ["navigation", "visibility", "reorder", "hide", "badges", "order"] },

  { id: "general-heading-guides", kind: "heading", label: "Guides & what's new", section: "general", anchor: "general-guides", keywords: ["tour", "walkthrough", "onboarding"] },
  { id: "general-full-tour", label: "Full dashboard tour", section: "general", heading: "Guides & what's new", anchor: "general-full-tour", keywords: ["replay", "guide", "walkthrough"] },
  { id: "general-latest-changes", label: "Latest changes", section: "general", heading: "Guides & what's new", anchor: "general-latest-changes", keywords: ["what's new", "update tour", "changelog"] },

  { id: "general-heading-attendance", kind: "heading", label: "Attendance", section: "general", anchor: "general-attendance" },
  { id: "general-attendance-filling", label: "Attendance filling", section: "general", heading: "Attendance", anchor: "general-attendance-filling", keywords: ["infer", "unmarked", "periods"] },
  { id: "general-attendance-perfect", label: "Perfect attendance colour effect", section: "general", heading: "Attendance", anchor: "general-attendance-perfect", fallbackAnchor: "general-attendance", keywords: ["100%", "rainbow", "colour cycle"] },
  { id: "general-attendance-excellent", label: "Excellent from", section: "general", heading: "Attendance", anchor: "general-attendance-excellent", keywords: ["threshold", "percentage"] },
  { id: "general-attendance-good", label: "Good from", section: "general", heading: "Attendance", anchor: "general-attendance-good", keywords: ["threshold", "percentage"] },
  { id: "general-attendance-concerning", label: "Concerning below", section: "general", heading: "Attendance", anchor: "general-attendance-concerning", keywords: ["threshold", "percentage", "concern"] },
  { id: "general-attendance-reset", label: "Reset attendance thresholds", section: "general", heading: "Attendance", anchor: "general-attendance-reset", keywords: ["defaults", "restore"] },

  { id: "general-heading-home", kind: "heading", label: "Home", section: "general", anchor: "general-home", keywords: ["cards", "dashboard"] },
  { id: "general-card-style", label: "Card style", section: "general", heading: "Home", anchor: "general-card-style", keywords: ["minimal", "stylised", "bento", "kokonut"] },
  { id: "general-columns", label: "Columns", section: "general", heading: "Home", anchor: "general-columns", keywords: ["grid", "one column", "two columns", "span"] },
  { id: "general-notifications-fallback", label: "Notifications fallback", section: "general", heading: "Home", anchor: "general-notifications-fallback", keywords: ["recent day", "empty"] },
  { id: "general-home-wiggle", label: "Home wiggle", section: "general", heading: "Home", anchor: "general-home-wiggle", keywords: ["animate", "editing", "jiggle"] },

  { id: "general-heading-timetable", kind: "heading", label: "Timetable", section: "general", anchor: "general-timetable" },
  { id: "general-timetable-merge", label: "Merge consecutive periods", section: "general", heading: "Timetable", anchor: "general-timetable-merge", keywords: ["double periods", "combine"] },
  { id: "general-timetable-both-weeks", label: "Show both weeks", section: "general", heading: "Timetable", anchor: "general-timetable-both-weeks", keywords: ["week a", "week b", "toggle"] },

  { id: "general-heading-calendar", kind: "heading", label: "Calendar", section: "general", anchor: "general-calendar" },
  { id: "general-calendar-first-day", label: "First Day Of Week", section: "general", heading: "Calendar", anchor: "general-calendar-first-day", keywords: ["monday", "sunday", "week start"] },
  { id: "general-calendar-colour-mode", label: "Event Colour Mode", section: "general", heading: "Calendar", anchor: "general-calendar-colour-mode", keywords: ["colors", "colours", "independent", "match calendar"] },
  { id: "general-calendar-merge", label: "Merge Consecutive Periods", section: "general", heading: "Calendar", anchor: "general-calendar-merge", keywords: ["back to back", "combine classes"] },
  { id: "general-calendar-day-click", label: "Month Day Click Action", section: "general", heading: "Calendar", anchor: "general-calendar-day-click", keywords: ["day view", "week view", "month view"] },
  { id: "general-calendar-show-classes", label: "Show Classes In Home Calendar", section: "general", heading: "Calendar", anchor: "general-calendar-show-classes", keywords: ["class events", "home card"] },
  { id: "general-calendar-seconds", label: "Show Timeline Seconds", section: "general", heading: "Calendar", anchor: "general-calendar-seconds", keywords: ["current time line", "clock"] },
  { id: "general-calendar-smart-cleaner", label: "Smart Cleaner", section: "general", heading: "Calendar", anchor: "general-calendar-smart-cleaner", keywords: ["duplicates", "cleanup"] },
  { id: "general-calendar-google-banner", label: "Google Validation Banner", section: "general", heading: "Calendar", anchor: "general-calendar-google-banner", keywords: ["notice", "google"] },
  { id: "general-calendar-google-sync", label: "Google Sync Mode", section: "general", heading: "Calendar", anchor: "general-calendar-google-sync", keywords: ["google calendar", "mirror", "auto sync"] },
  { id: "general-calendar-google-unlink", label: "Unlink Google Calendar", section: "general", heading: "Calendar", anchor: "general-calendar-google-unlink", keywords: ["disconnect", "google"] },

  // ---------------------------------------------------------------- AI Agent
  { id: "assistant-heading-agent", kind: "heading", label: "AI Agent", section: "assistant", anchor: "assistant-ai-agent" },
  { id: "assistant-show-button", label: "Show AI Agent button", section: "assistant", heading: "AI Agent", anchor: "assistant-show-button", keywords: ["hide", "disable", "dock"] },
  { id: "assistant-summarised-thinking", label: "Summarised thinking", section: "assistant", heading: "AI Agent", anchor: "assistant-summarised-thinking", keywords: ["reasoning", "tool calls", "details"] },
  { id: "assistant-talking-style", label: "Talking style", section: "assistant", heading: "AI Agent", anchor: "assistant-talking-style", keywords: ["tone", "voice", "detail"] },

  { id: "assistant-heading-providers", kind: "heading", label: "AI Providers", section: "assistant", anchor: "assistant-providers", keywords: ["api key", "credentials", "byok"] },
  { id: "assistant-provider-subscriptions", label: "Provider subscriptions", section: "assistant", heading: "AI Providers", anchor: "assistant-provider-subscriptions", keywords: ["codex cli", "claude cli", "desktop", "chatgpt"] },
  { id: "assistant-connected-providers", label: "Connected providers", section: "assistant", heading: "AI Providers", anchor: "assistant-connected-providers", keywords: ["remove", "encrypted", "connections"] },
  { id: "assistant-connect-provider", label: "Connect or rotate provider", section: "assistant", heading: "AI Providers", anchor: "assistant-connect-provider", keywords: ["openai", "anthropic", "openrouter", "api key", "rotate", "model id"] },

  // ---------------------------------------------------------------- Flashcards
  { id: "flashcards-heading-reviews", kind: "heading", label: "Reviews", section: "flashcards", anchor: "flashcards-reviews" },
  { id: "flashcards-rating-controls", label: "Rating controls", section: "flashcards", heading: "Reviews", anchor: "flashcards-rating-controls", keywords: ["again", "hard", "good", "easy", "scheduler", "intervals"] },
  { id: "flashcards-heading-reminders", kind: "heading", label: "Reminders", section: "flashcards", anchor: "flashcards-reminders" },
  { id: "flashcards-review-reminders", label: "Spaced repetition reminders", section: "flashcards", heading: "Reminders", anchor: "flashcards-review-reminders", keywords: ["due", "review", "study", "notification"] },

  // ---------------------------------------------------------------- Animations
  { id: "animations-enable", label: "Enable animations", section: "animations", anchor: "animations-enable", keywords: ["master", "motion", "off"] },
  { id: "animations-respect-system", label: "Respect system preference", section: "animations", anchor: "animations-respect-system", keywords: ["reduced motion", "accessibility", "prefers-reduced-motion"] },
  { id: "animations-main-speed", label: "Main speed", section: "animations", anchor: "animations-main-speed", keywords: ["duration", "faster", "slower", "timing"] },
  { id: "animations-heading-categories", kind: "heading", label: "Animation categories", section: "animations", anchor: "animations-categories" },
  { id: "animations-curve", label: "Animation curve", section: "animations", heading: "Animation categories", anchor: "animations-categories", keywords: ["easing", "bezier", "snappy", "gentle", "spring", "saved animations"] },
  { id: "animations-override-reduced-motion", label: "Override reduced motion", section: "animations", heading: "Animation categories", anchor: "animations-categories", keywords: ["accessibility", "force", "keep motion"] },
  { id: "animations-page-transitions", label: "Page transitions", section: "animations", heading: "Animation categories", anchor: "animations-page-transitions", opener: "animations-page-transitions", keywords: ["navigation", "fade"] },
  { id: "animations-micro-interactions", label: "Micro-interactions", section: "animations", heading: "Animation categories", anchor: "animations-micro-interactions", opener: "animations-micro-interactions", keywords: ["buttons", "switches", "feedback"] },
  { id: "animations-hover-effects", label: "Hover effects", section: "animations", heading: "Animation categories", anchor: "animations-hover-effects", opener: "animations-hover-effects", keywords: ["card lift", "transform"] },
  { id: "animations-loading", label: "Loading animations", section: "animations", heading: "Animation categories", anchor: "animations-loading", opener: "animations-loading", keywords: ["spinner", "skeleton", "progress"] },
  { id: "animations-stagger", label: "Staggered lists", section: "animations", heading: "Animation categories", anchor: "animations-stagger", opener: "animations-stagger", keywords: ["sequential", "list entrance"] },
  { id: "animations-sidebar", label: "Sidebar animations", section: "animations", heading: "Animation categories", anchor: "animations-sidebar", opener: "animations-sidebar", keywords: ["collapse", "expand", "menu"] },
  { id: "animations-modals", label: "Modals and popups", section: "animations", heading: "Animation categories", anchor: "animations-modals", opener: "animations-modals", keywords: ["dialog", "sheet", "tooltip", "popover", "menu"] },
  { id: "animations-toasts", label: "Toasts", section: "animations", heading: "Animation categories", anchor: "animations-toasts", opener: "animations-toasts", keywords: ["sonner", "notification popup"] },

  // ---------------------------------------------------------------- Notifications
  { id: "notifications-heading-routing", kind: "heading", label: "Routing Rules", section: "notifications", anchor: "notifications-routing-rules" },
  { id: "notifications-automatic-filing", label: "Automatic filing", section: "notifications", heading: "Routing Rules", anchor: "notifications-automatic-filing", keywords: ["rules", "folders", "sort", "add rule"] },
  { id: "notifications-heading-display", kind: "heading", label: "Display Settings", section: "notifications", anchor: "notifications-display" },
  { id: "notifications-auto-archive", label: "Auto-archive", section: "notifications", heading: "Display Settings", anchor: "notifications-auto-archive", keywords: ["age out", "cleanup", "weeks", "months"] },
  { id: "notifications-unread-section", label: "Unread Section", section: "notifications", heading: "Display Settings", anchor: "notifications-unread-section", keywords: ["group", "inbox", "top"] },
  { id: "notifications-relative-dates", label: "Relative Dates", section: "notifications", heading: "Display Settings", anchor: "notifications-relative-dates", keywords: ["today", "yesterday", "timestamps"] },
  { id: "notifications-disable-future", label: "Disable Future Notifications", section: "notifications", heading: "Display Settings", anchor: "notifications-disable-future", keywords: ["start date", "upcoming", "hide"] },
  { id: "notifications-hide-archived", label: "Hide Archived", section: "notifications", heading: "Display Settings", anchor: "notifications-hide-archived", keywords: ["archive", "home card"] },
  { id: "notifications-hide-pinned", label: "Hide Pinned", section: "notifications", heading: "Display Settings", anchor: "notifications-hide-pinned", keywords: ["pin", "home card"] },
  { id: "notifications-heading-home-filtering", kind: "heading", label: "Home Filtering", section: "notifications", anchor: "notifications-home-filtering" },
  { id: "notifications-folders-to-hide", label: "Folders to Hide", section: "notifications", heading: "Home Filtering", anchor: "notifications-folders-to-hide", keywords: ["categories", "hide", "folders"] },

  // ---------------------------------------------------------------- Shortcuts
  { id: "shortcuts-context-aware", label: "Context-Aware Shortcuts", section: "shortcuts", anchor: "shortcuts-context-aware", keywords: ["page specific", "per page", "enable"] },
  { id: "shortcuts-heading-folders", kind: "heading", label: "Notification Folders", section: "shortcuts", anchor: "shortcuts-notification-folders", keywords: ["command menu", "folders"] },
  { id: "shortcuts-navigation", kind: "heading", label: "Navigation", section: "shortcuts", anchor: "shortcuts-navigation", keywords: ["go to", "pages", "bindings"] },
  { id: "shortcuts-tabs", kind: "heading", label: "Tabs", section: "shortcuts", anchor: "shortcuts-tabs", keywords: ["bindings", "keys"] },
  { id: "shortcuts-actions", kind: "heading", label: "Actions", section: "shortcuts", anchor: "shortcuts-actions", keywords: ["bindings", "keys", "commands"] },
  { id: "shortcuts-calendar", kind: "heading", label: "Calendar & Timetable", section: "shortcuts", anchor: "shortcuts-calendar", keywords: ["bindings", "keys"] },
  { id: "shortcuts-notifications", kind: "heading", label: "Notifications", section: "shortcuts", anchor: "shortcuts-notifications", keywords: ["bindings", "keys"] },
  { id: "shortcuts-settings", kind: "heading", label: "Settings", section: "shortcuts", anchor: "shortcuts-settings", keywords: ["bindings", "keys"] },


  // ---------------------------------------------------------------- Past papers
  { id: "past-papers-profile", kind: "heading", label: "Your study profile", section: "past-papers", anchor: "past-papers-profile", keywords: ["year", "grade", "subjects", "enrolment", "setup", "onboarding"] },
  { id: "past-papers-year-level", label: "Year level", section: "past-papers", heading: "Your study profile", anchor: "past-papers-year-level", keywords: ["grade", "year 11", "year 12", "hsc", "preliminary"] },
  { id: "past-papers-subjects", label: "Your subjects", section: "past-papers", heading: "Your study profile", anchor: "past-papers-subjects", keywords: ["courses", "enrolment", "electives"] },
  { id: "past-papers-setup", label: "Run the setup again", section: "past-papers", heading: "Your study profile", anchor: "past-papers-setup", keywords: ["onboarding", "wizard", "redo"] },
  { id: "past-papers-timer", kind: "heading", label: "Timer", section: "past-papers", anchor: "past-papers-timer", keywords: ["exam", "clock", "countdown", "working time"] },
  { id: "past-papers-timer-volume", label: "Timer volume", section: "past-papers", heading: "Timer", anchor: "past-papers-timer-volume", keywords: ["sound", "chime", "alert", "loud", "mute"] },
  { id: "past-papers-rolling", label: "Rolling digits", section: "past-papers", heading: "Timer", anchor: "past-papers-rolling", keywords: ["animation", "clock", "motion"] },
  { id: "past-papers-reading", kind: "heading", label: "Reading", section: "past-papers", anchor: "past-papers-reading", keywords: ["annotations", "highlight", "selection", "pdf"] },
  { id: "past-papers-answers", label: "Keep answers shut during an attempt", section: "past-papers", heading: "Reading", anchor: "past-papers-answers", keywords: ["solutions", "marking guidelines", "cheat"] },
  { id: "past-papers-zoom", label: "Default zoom", section: "past-papers", heading: "Reading", anchor: "past-papers-zoom", keywords: ["scale", "magnify", "bigger", "smaller", "pdf"] },
  { id: "past-papers-browsing", kind: "heading", label: "Browsing", section: "past-papers", anchor: "past-papers-browsing", keywords: ["sort", "filters", "picked for you", "syllabus"] },
  { id: "past-papers-attempt", kind: "heading", label: "After an attempt", section: "past-papers", anchor: "past-papers-attempt", keywords: ["rating", "difficulty", "flashcards", "review"] },

  // ---------------------------------------------------------------- Theme Builder
  { id: "theme-your-themes", kind: "heading", label: "Your themes", section: "theme-builder", anchor: "theme-your-themes", keywords: ["saved", "library", "apply", "edit", "duplicate", "share code"] },
  { id: "theme-import-code", label: "Import code", section: "theme-builder", heading: "Your themes", anchor: "theme-import-code", keywords: ["share", "paste", "code"] },
  { id: "theme-explore", kind: "heading", label: "Explore", section: "theme-builder", anchor: "theme-explore", keywords: ["gallery", "community", "browse"] },
  { id: "theme-gallery", label: "Theme gallery", section: "theme-builder", heading: "Explore", anchor: "theme-gallery", keywords: ["browse themes", "curated", "colourways"] },
  { id: "theme-syntax", kind: "heading", label: "Syntax Highlighting", section: "theme-builder", anchor: "theme-syntax", keywords: ["code", "keyword", "string", "comment", "font"] },

  // ---------------------------------------------------------------- Class colours
  { id: "class-colours", label: "Class colours", section: "class-colors", anchor: "class-colours", keywords: ["subject", "colour", "color", "timetable", "per class"] },
  { id: "class-colours-unenrolled", label: "Unenrolled classes", section: "class-colors", heading: "Class colours", anchor: "class-colours-unenrolled", opener: "class-colours-unenrolled", fallbackAnchor: "class-colours", keywords: ["dropped", "past classes", "hidden"] },
  { id: "class-colours-reset", label: "Reset all", section: "class-colors", heading: "Class colours", anchor: "class-colours-reset", keywords: ["defaults", "restore"] },

  // ---------------------------------------------------------------- Sync
  { id: "sync-now", label: "Sync", section: "sync", anchor: "sync-now", keywords: ["sync now", "fetch", "refresh", "puppeteer"] },
  { id: "sync-heading-interval", kind: "heading", label: "Fetch Interval", section: "sync", anchor: "sync-fetch-interval" },
  { id: "sync-interval-unit", label: "Interval unit", section: "sync", heading: "Fetch Interval", anchor: "sync-interval-unit", keywords: ["minutes", "hours"] },
  { id: "sync-fetch-every", label: "Fetch every", section: "sync", heading: "Fetch Interval", anchor: "sync-fetch-every", keywords: ["minutes", "hours", "daily", "interval"] },
  { id: "sync-heading-status", kind: "heading", label: "Status Updates", section: "sync", anchor: "sync-status-updates" },
  { id: "sync-ultra-live-status", label: "Ultra run live status", section: "sync", heading: "Status Updates", anchor: "sync-ultra-live-status", keywords: ["toast", "progress", "cancel"] },
  { id: "sync-background-updates", label: "Background sync updates", section: "sync", heading: "Status Updates", anchor: "sync-background-updates", keywords: ["toast", "success", "error"] },
  { id: "sync-heading-portal-date", kind: "heading", label: "Portal Date", section: "sync", anchor: "sync-portal-date" },
  { id: "sync-match-current-date", label: "Match current date", section: "sync", heading: "Portal Date", anchor: "sync-match-current-date", keywords: ["today", "automatic"] },
  { id: "sync-portal-date-field", label: "Date", section: "sync", heading: "Portal Date", anchor: "sync-portal-date-field", keywords: ["portal date", "past", "future"] },
  { id: "sync-heading-ranges", kind: "heading", label: "Data Ranges", section: "sync", anchor: "sync-data-ranges" },
  { id: "sync-notice-lookbehind", label: "Notice lookbehind", section: "sync", heading: "Data Ranges", anchor: "sync-notice-lookbehind", keywords: ["notices", "days back"] },
  { id: "sync-notice-lookahead", label: "Notice lookahead", section: "sync", heading: "Data Ranges", anchor: "sync-notice-lookahead", keywords: ["notices", "days ahead"] },
  { id: "sync-calendar-past", label: "Calendar past range", section: "sync", heading: "Data Ranges", anchor: "sync-calendar-past", keywords: ["months back", "calendar"] },
  { id: "sync-calendar-future", label: "Calendar future range", section: "sync", heading: "Data Ranges", anchor: "sync-calendar-future", keywords: ["months ahead", "calendar"] },
  { id: "sync-reports-lookback", label: "Reports lookback", section: "sync", heading: "Data Ranges", anchor: "sync-reports-lookback", keywords: ["years", "reports"] },
  { id: "sync-attendance-lookback", label: "Attendance lookback", section: "sync", heading: "Data Ranges", anchor: "sync-attendance-lookback", keywords: ["years", "attendance"] },
  { id: "sync-grade-item-limit", label: "Grade item limit", section: "sync", heading: "Data Ranges", anchor: "sync-grade-item-limit", keywords: ["grades", "rows", "cap"] },
  { id: "sync-heading-types", kind: "heading", label: "Synced Data Types", section: "sync", anchor: "sync-data-types", keywords: ["timetable", "notices", "grades", "attendance", "reports", "classes", "calendar", "toggle"] },
  { id: "sync-heading-danger", kind: "heading", label: "Danger Zone", section: "sync", anchor: "sync-danger-zone", keywords: ["destructive", "heavy"] },
  { id: "sync-ultra-start-year", label: "Start year", section: "sync", heading: "Danger Zone", anchor: "sync-ultra-start-year", opener: "sync-danger-zone", fallbackAnchor: "sync-danger-zone", keywords: ["ultra run", "archival", "scrape"] },
  { id: "sync-ultra-end-year", label: "End year", section: "sync", heading: "Danger Zone", anchor: "sync-ultra-end-year", opener: "sync-danger-zone", fallbackAnchor: "sync-danger-zone", keywords: ["ultra run", "archival", "scrape"] },
  { id: "sync-reset-defaults", label: "Reset data settings", section: "sync", heading: "Danger Zone", anchor: "sync-reset-defaults", opener: "sync-danger-zone", fallbackAnchor: "sync-danger-zone", keywords: ["defaults", "restore"] },
  { id: "sync-wipe", label: "Wipe synced data", section: "sync", heading: "Danger Zone", anchor: "sync-wipe", opener: "sync-danger-zone", fallbackAnchor: "sync-danger-zone", keywords: ["delete", "clear cache", "portal data"] },

  // ---------------------------------------------------------------- Export
  { id: "export-data", label: "Export your data", section: "export", anchor: "export-data", keywords: ["download", "json", "backup"] },
  { id: "export-import", label: "Import your data", section: "export", anchor: "export-import", keywords: ["restore", "upload", "json"] },
  { id: "export-delete-account", label: "Delete account", section: "export", anchor: "export-delete-account", keywords: ["remove", "permanent", "close account"] },

  // ---------------------------------------------------------------- Administrator
  { id: "admin-overview", kind: "heading", label: "Administrator", section: "admin", anchor: "admin-overview", keywords: ["users", "spend", "metrics", "roles"] },
  { id: "admin-debug-events", label: "Debug events", section: "admin", heading: "Administrator", anchor: "admin-debug-events", keywords: ["one-time", "re-arm", "popups", "prompts"] },
  { id: "admin-user-management", label: "User management", section: "admin", heading: "Administrator", anchor: "admin-user-management", keywords: ["search users", "roles", "administrator access"] },
]

export const MAX_SETTINGS_SEARCH_RESULTS = 40

export type SettingsResultKind = "heading" | "setting"

export interface SettingsSearchResult {
  readonly kind: SettingsResultKind
  readonly id: string
  readonly label: string
  readonly section: SettingsSectionId
  readonly sectionLabel: string
  readonly heading?: string
  readonly anchor?: string
  readonly opener?: string
  readonly fallbackAnchor?: string
  readonly rank: number
}

export interface SettingsSearchGroup {
  readonly section: SettingsSectionId
  readonly sectionLabel: string
  readonly results: readonly SettingsSearchResult[]
}

const normalizeSearchText = (value: string): string => value.trim().toLowerCase()

const sectionOrder = new Map<SettingsSectionId, number>(
  SETTINGS_SECTIONS.map((section, index) => [section.id as SettingsSectionId, index])
)

const isSectionAllowed = (
  section: (typeof SETTINGS_SECTIONS)[number],
  includeAdministrator: boolean
): boolean => (
  !isPreReleaseSettingsSection(section.id)
  && (!("requiresAdministrator" in section) || !section.requiresAdministrator || includeAdministrator)
)

/**
 * Ranks matches so an exact label hit beats a prefix hit, which beats a substring hit, which
 * beats the owning heading, which beats keyword-only hits.
 */
const scoreMatch = (
  query: string,
  label: string,
  extras: readonly (string | undefined)[]
): number => {
  const normalizedLabel = normalizeSearchText(label)
  if (normalizedLabel === query) return 0
  if (normalizedLabel.startsWith(query)) return 1
  if (normalizedLabel.includes(query)) return 2

  const hasExtraMatch = extras.some((extra) => (
    extra ? normalizeSearchText(extra).includes(query) : false
  ))
  return hasExtraMatch ? 3 : Number.POSITIVE_INFINITY
}

export function searchSettings(
  query: string,
  includeAdministrator: boolean
): readonly SettingsSearchResult[] {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []

  const allowedSections = new Set(
    SETTINGS_SECTIONS
      .filter((section) => isSectionAllowed(section, includeAdministrator))
      .map((section) => section.id as SettingsSectionId)
  )

  // Whole pages are deliberately not results: the sidebar already lists every page, and a
  // page row in the results only pushed the control the user searched for further down.
  const entryResults: SettingsSearchResult[] = SETTINGS_SEARCH_ENTRIES
    .filter((entry) => allowedSections.has(entry.section))
    .map((entry) => ({
      kind: entry.kind === "heading" ? ("heading" as const) : ("setting" as const),
      id: entry.id,
      label: entry.label,
      section: entry.section,
      sectionLabel: getSettingsSectionDefinition(entry.section)?.label ?? entry.section,
      heading: entry.heading,
      anchor: entry.anchor,
      opener: entry.opener,
      fallbackAnchor: entry.fallbackAnchor,
      rank: scoreMatch(normalized, entry.label, [entry.heading, ...(entry.keywords ?? [])]),
    }))

  const kindWeight: Record<SettingsResultKind, number> = { heading: 0, setting: 1 }

  return entryResults
    .filter((result) => Number.isFinite(result.rank))
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      if (left.kind !== right.kind) return kindWeight[left.kind] - kindWeight[right.kind]
      return left.label.localeCompare(right.label)
    })
    .slice(0, MAX_SETTINGS_SEARCH_RESULTS)
}

/**
 * Groups results under their owning settings page so the sidebar can show section headings
 * instead of one flat list where every row has to repeat where it lives.
 */
export function groupSettingsSearchResults(
  results: readonly SettingsSearchResult[]
): readonly SettingsSearchGroup[] {
  const groups = new Map<SettingsSectionId, SettingsSearchResult[]>()

  results.forEach((result) => {
    const existing = groups.get(result.section)
    if (existing) {
      existing.push(result)
      return
    }
    groups.set(result.section, [result])
  })

  return [...groups.entries()]
    .map(([section, sectionResults]) => ({
      section,
      sectionLabel: sectionResults[0].sectionLabel,
      results: sectionResults,
    }))
    .sort((left, right) => {
      // Keep the best match first, then fall back to sidebar order for ties.
      const leftBest = left.results[0].rank
      const rightBest = right.results[0].rank
      if (leftBest !== rightBest) return leftBest - rightBest
      return (sectionOrder.get(left.section) ?? 0) - (sectionOrder.get(right.section) ?? 0)
    })
}
