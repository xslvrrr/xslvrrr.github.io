import {
  IconBell,
  IconCalendar,
  IconCards,
  IconClipboardCheck,
  IconClock,
  IconDownload,
  IconFileText,
  IconHome,
  IconKeyboard,
  IconMessageCircle,
  IconPalette,
  IconRefresh,
  IconRobot,
  IconSchool,
  IconSettings,
  IconShieldLock,
  IconSparkles,
  IconTable,
  IconUser,
  type Icon,
} from "@tabler/icons-react"

export type DashboardSidebarGroupId = "essentials" | "register" | "study"
export type SettingsGroupId = "settings" | "customization" | "data" | "administration"

interface DashboardSectionDefinition {
  id: string
  label: string
  navigationLabel: string
  description: string
  keywords: readonly string[]
  icon: Icon
  shortcutId?: string
  sidebarGroup?: DashboardSidebarGroupId
  showInCommandMenu?: boolean
  aliases?: readonly string[]
  /**
   * Built, but not released. The definition stays here so its preferences, shortcuts, and stored
   * tab state survive, while every navigation surface filters it out and its id resolves to Home.
   */
  preRelease?: boolean
}

interface SettingsSectionDefinition {
  id: string
  label: string
  commandLabel: string
  description: string
  keywords: readonly string[]
  icon: Icon
  group: SettingsGroupId
  shortcutId?: string
  showInCommandMenu?: boolean
  requiresAdministrator?: boolean
  aliases?: readonly string[]
  /** See `DashboardSectionDefinition.preRelease`. */
  preRelease?: boolean
}

export const DASHBOARD_SECTIONS = [
  {
    id: "home",
    label: "Home",
    navigationLabel: "Home",
    description: "Dashboard home page",
    keywords: ["dashboard", "main"],
    icon: IconHome,
    shortcutId: "nav-home",
    sidebarGroup: "essentials",
    aliases: ["dashboard"],
  },
  {
    id: "notifications",
    label: "Notifications",
    navigationLabel: "Notifications",
    description: "View all notices and announcements",
    keywords: ["messages", "inbox"],
    icon: IconBell,
    shortcutId: "nav-notifications",
    sidebarGroup: "essentials",
  },
  {
    id: "account",
    label: "Account",
    navigationLabel: "Account",
    description: "Manage your account and portal connection",
    keywords: ["profile", "identity"],
    icon: IconUser,
    shortcutId: "nav-account",
    sidebarGroup: "essentials",
  },
  {
    id: "calendar",
    label: "Calendar",
    navigationLabel: "Calendar",
    description: "View your calendar and events",
    keywords: ["schedule", "events"],
    icon: IconCalendar,
    shortcutId: "nav-calendar",
    sidebarGroup: "essentials",
  },
  {
    id: "classes",
    label: "Classes",
    navigationLabel: "Classes",
    description: "View your classes and subject insights",
    keywords: ["subjects", "courses"],
    icon: IconSchool,
    shortcutId: "nav-classes",
    sidebarGroup: "register",
  },
  {
    id: "timetable",
    label: "Timetable",
    navigationLabel: "Timetable",
    description: "View your weekly schedule",
    keywords: ["schedule", "week"],
    icon: IconTable,
    shortcutId: "nav-timetable",
    sidebarGroup: "register",
  },
  {
    id: "reports",
    label: "Reports",
    navigationLabel: "Reports",
    description: "View your academic reports",
    keywords: ["grades", "results", "pdf"],
    icon: IconFileText,
    shortcutId: "nav-reports",
    sidebarGroup: "register",
  },
  {
    id: "attendance",
    label: "Attendance",
    navigationLabel: "Attendance",
    description: "View attendance records",
    keywords: ["absences", "present"],
    icon: IconClipboardCheck,
    shortcutId: "nav-attendance",
    sidebarGroup: "register",
  },
  {
    id: "classroom",
    label: "Google Classroom",
    navigationLabel: "Classroom",
    description: "View assignments and classwork",
    keywords: ["google", "assignments", "materials", "missing"],
    icon: IconSchool,
    shortcutId: "nav-classroom",
    sidebarGroup: "register",
    preRelease: true,
  },
  {
    id: "flashcards",
    label: "Flashcards",
    navigationLabel: "Flashcards",
    description: "Review cards with spaced repetition",
    keywords: ["flashcards", "anki", "review", "spaced repetition", "study"],
    icon: IconCards,
    sidebarGroup: "study",
    aliases: ["study"],
  },
  {
    id: "past-papers",
    label: "Past papers",
    navigationLabel: "Past papers",
    description: "Browse and sit NSW past papers with a timer",
    keywords: ["past papers", "hsc", "trials", "exams", "nesa", "thsc", "practice"],
    icon: IconFileText,
    sidebarGroup: "study",
    aliases: ["papers", "trials"],
    preRelease: true,
  },
  {
    id: "assistant",
    label: "AI Agent",
    navigationLabel: "AI Agent",
    description: "Open your Millennium assistant",
    keywords: ["assistant", "ai", "chat", "models"],
    icon: IconMessageCircle,
  },
] as const satisfies readonly DashboardSectionDefinition[]

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    commandLabel: "General Settings",
    description: "Open general settings",
    keywords: ["preferences", "appearance", "display"],
    icon: IconSettings,
    group: "settings",
    shortcutId: "settings-general",
    aliases: ["appearance"],
  },
  {
    id: "assistant",
    label: "AI Agent",
    commandLabel: "AI Agent Settings",
    description: "Configure the AI Agent, its providers, and credentials",
    keywords: ["ai", "agent", "assistant", "models", "tone", "openrouter", "anthropic", "openai"],
    icon: IconRobot,
    group: "settings",
  },
  {
    id: "flashcards",
    label: "Flashcards",
    commandLabel: "Flashcard Settings",
    description: "Control review rating controls and reminders",
    keywords: ["study", "spaced repetition", "review", "ratings", "reminders", "anki"],
    icon: IconCards,
    group: "settings",
  },
  {
    id: "past-papers",
    label: "Past papers",
    commandLabel: "Past Paper Settings",
    description: "Timer, annotation and browsing preferences for past papers",
    keywords: ["timer", "exam", "volume", "rolling", "papers", "annotations"],
    icon: IconFileText,
    group: "settings",
    preRelease: true,
  },
  {
    id: "animations",
    label: "Animations",
    commandLabel: "Animation Settings",
    description: "Control motion and transitions",
    keywords: ["motion", "transitions", "effects"],
    icon: IconSparkles,
    group: "settings",
    shortcutId: "settings-animations",
  },
  {
    id: "notifications",
    label: "Notifications",
    commandLabel: "Notification Settings",
    description: "Configure notification preferences",
    keywords: ["alerts", "archive", "inbox"],
    icon: IconBell,
    group: "settings",
    shortcutId: "settings-notifications",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    commandLabel: "Keyboard Shortcuts",
    description: "Customise keyboard shortcuts",
    keywords: ["keyboard", "keys", "commands"],
    icon: IconKeyboard,
    group: "settings",
    shortcutId: "settings-shortcuts",
  },
  {
    id: "theme-builder",
    label: "Theme Builder",
    commandLabel: "Theme Builder",
    description: "Customise your theme",
    keywords: ["colors", "colours", "customisation", "customization"],
    icon: IconPalette,
    group: "customization",
    shortcutId: "settings-theme-builder",
  },
  {
    id: "class-colors",
    label: "Class Colours",
    commandLabel: "Class Colours",
    description: "Customise class colours",
    keywords: ["classes", "subjects", "colors", "colours"],
    icon: IconSchool,
    group: "customization",
    shortcutId: "settings-class-colors",
  },
  {
    id: "sync",
    label: "Sync",
    commandLabel: "Sync Settings",
    description: "Configure data sync and fetch intervals",
    keywords: ["data", "fetch", "interval", "portal"],
    icon: IconRefresh,
    group: "data",
    shortcutId: "settings-sync",
  },
  {
    id: "export",
    label: "Export",
    commandLabel: "Export Settings",
    description: "Export, import, or delete account data",
    keywords: ["download", "import", "delete", "data"],
    icon: IconDownload,
    group: "data",
    shortcutId: "settings-export",
  },
  {
    id: "admin",
    label: "Administrator",
    commandLabel: "Administrator",
    description: "Manage users and service limits",
    keywords: ["admin", "users", "roles", "limits"],
    icon: IconShieldLock,
    group: "administration",
    showInCommandMenu: false,
    requiresAdministrator: true,
  },
] as const satisfies readonly SettingsSectionDefinition[]

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]["id"]
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"]

const dashboardSectionsById = new Map<DashboardSectionId, (typeof DASHBOARD_SECTIONS)[number]>(
  DASHBOARD_SECTIONS.map((section) => [section.id, section])
)
const settingsSectionsById = new Map<SettingsSectionId, (typeof SETTINGS_SECTIONS)[number]>(
  SETTINGS_SECTIONS.map((section) => [section.id, section])
)
const dashboardAliases = new Map<string, DashboardSectionId>(
  DASHBOARD_SECTIONS.flatMap((section) => (
    "aliases" in section ? section.aliases.map((alias) => [alias, section.id] as const) : []
  ))
)

const preReleaseDashboardSections = new Set<string>(
  DASHBOARD_SECTIONS.filter((section) => "preRelease" in section && section.preRelease).map((section) => section.id)
)
const preReleaseSettingsSections = new Set<string>(
  SETTINGS_SECTIONS.filter((section) => "preRelease" in section && section.preRelease).map((section) => section.id)
)

/** Dashboard pages a released build must never navigate to or advertise. */
export function isPreReleaseDashboardSection(value: string): boolean {
  return preReleaseDashboardSections.has(value)
}

export function isPreReleaseSettingsSection(value: string): boolean {
  return preReleaseSettingsSections.has(value)
}

/** Every dashboard page this build ships, in registry order. */
export const RELEASED_DASHBOARD_SECTIONS = DASHBOARD_SECTIONS.filter(
  (section) => !isPreReleaseDashboardSection(section.id)
)

export const RELEASED_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter(
  (section) => !isPreReleaseSettingsSection(section.id)
)
const settingsAliases = new Map<string, SettingsSectionId>(
  SETTINGS_SECTIONS.flatMap((section) => (
    "aliases" in section ? section.aliases.map((alias) => [alias, section.id] as const) : []
  ))
)

export const DASHBOARD_SIDEBAR_GROUPS: readonly { id: DashboardSidebarGroupId; label: string }[] = [
  { id: "essentials", label: "Essentials" },
  { id: "register", label: "Register" },
  { id: "study", label: "Study" },
]

/**
 * The sidebar pages, grouped, for the General settings visibility and order controls. Derived from
 * the registry so a page cannot be listed there after it has been hidden, or missed once it ships.
 */
export function getDashboardSectionsForSidebar() {
  return DASHBOARD_SIDEBAR_GROUPS.map((group) => ({
    title: group.label,
    items: RELEASED_DASHBOARD_SECTIONS
      .filter((section) => "sidebarGroup" in section && section.sidebarGroup === group.id)
      .map((section) => ({ id: section.id as string, label: section.label })),
  })).filter((group) => group.items.length > 0)
}

export const SETTINGS_GROUPS: readonly { id: SettingsGroupId; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "customization", label: "Customisation" },
  { id: "data", label: "Data" },
  { id: "administration", label: "Administration" },
]

export function isDashboardSectionId(value: string): value is DashboardSectionId {
  return dashboardSectionsById.has(value as DashboardSectionId)
}

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return settingsSectionsById.has(value as SettingsSectionId)
}

/**
 * Resolves a hash or alias to a page this build ships. A pre-release id resolves to nothing, so a
 * bookmarked `#past-papers` lands on Home rather than an unreleased page.
 */
export function resolveDashboardSection(value: string): DashboardSectionId | null {
  const normalized = value.trim().toLowerCase()
  const resolved = isDashboardSectionId(normalized)
    ? normalized
    : dashboardAliases.get(normalized) ?? null
  if (resolved && isPreReleaseDashboardSection(resolved)) return null
  return resolved
}

export function normalizeDashboardSection(
  value: string,
  fallback: DashboardSectionId = "home"
): DashboardSectionId {
  return resolveDashboardSection(value) ?? fallback
}

export function resolveSettingsSection(value: string): SettingsSectionId | null {
  const normalized = value.trim().toLowerCase()
  const resolved = isSettingsSectionId(normalized)
    ? normalized
    : settingsAliases.get(normalized) ?? null
  if (resolved && isPreReleaseSettingsSection(resolved)) return null
  return resolved
}

export function normalizeSettingsSection(value: string): SettingsSectionId {
  return resolveSettingsSection(value) ?? "general"
}

export function getDashboardSectionDefinition(section: string) {
  return dashboardSectionsById.get(normalizeDashboardSection(section))
}

export function getSettingsSectionDefinition(section: string) {
  return settingsSectionsById.get(normalizeSettingsSection(section))
}

/**
 * The searchable index of individual settings lives in ./settingsSearchIndex, which imports
 * the section list from this module.
 */

export function getSettingsSectionsForSidebar(includeAdministrator: boolean) {
  return SETTINGS_GROUPS.map((group) => ({
    category: group.label,
    items: RELEASED_SETTINGS_SECTIONS.filter((section) => (
      section.group === group.id
      && (!("requiresAdministrator" in section) || !section.requiresAdministrator || includeAdministrator)
    )),
  })).filter((group) => group.items.length > 0)
}
