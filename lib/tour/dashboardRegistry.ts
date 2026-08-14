import type { TourStep } from "../../hooks/useTour"

export const FULL_DASHBOARD_TOUR_ID = "millennium-full-tour-v2"
export const UPDATE_DASHBOARD_TOUR_ID = "millennium-update-tour-v2"
export const TOUR_RELEASE_CUTOFF = "2026-08-03T00:00:00.000Z"
export const REPLAY_FULL_TOUR_EVENT = "millennium-replay-full-tour"
export const REPLAY_UPDATE_TOUR_EVENT = "millennium-replay-update-tour"

/**
 * A target that is present *and* laid out.
 *
 * A step whose element exists but has collapsed to a zero-sized box spotlights a point rather than
 * a control, which is how the settings steps ended up appearing to highlight whatever sat at the
 * edge of the screen. Returning null instead lets the step fall through to a target that is really
 * on screen.
 */
function visibleTarget(selector: string): Element | null {
  const element = document.querySelector(selector)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? element : null
}

/**
 * Steps whose target only exists after some UI is opened carry an `auto` action. The guide runs it
 * on entry instead of asking for a click it would immediately perform itself.
 */
export const fullDashboardTour: readonly TourStep[] = [
  { id: "shell", pageId: "shell", title: "Your Millennium workspace", description: "Navigation, page tabs, search, and settings all live in one dashboard shell.", target: '[data-tour-id="dashboard-shell"]', placement: "bottom" },
  { id: "sidebar", pageId: "shell", title: "Everything has a place", description: "Move between Essentials, Register, and Study pages here. Hidden or reordered pages stay reachable through Search.", target: '[data-tour-id="main-navigation"]', placement: "right" },
  { id: "tabs", pageId: "shell", title: "Keep pages open", description: "Open, reorder, and close dashboard tabs without losing your place.", target: '[data-tour-id="content-tabs"]', placement: "bottom" },
  { id: "search", pageId: "shell", title: "Find anything quickly", description: "Search is open now. Type a page or action, then use the pointer or arrow keys. It stays fully interactive during this step.", target: () => document.querySelector('[data-tour-id="command-menu"]') ?? document.querySelector('[data-tour-id="command-search"]'), placement: "right", targetPadding: 5, action: { id: "open-search", label: "Try Search", completedLabel: "Search opened", auto: true } },

  { id: "home", pageId: "home", title: "Home at a glance", description: "Upcoming classes, notifications, calendar events, attendance, notes, and shortcuts in one view.", target: '[data-tour-id="page-home"]', placement: "top" },
  { id: "home-editing", pageId: "home", title: "Arrange Home directly", description: "Home editing is on. Move and resize cards freely, then add free draw, text, or line elements from the toolbar. This area stays interactive.", target: "[data-tour-home-editing-area]", placement: "bottom", targetPadding: 6, action: { id: "customise-home", label: "Try Home editing", completedLabel: "Editing enabled", auto: true } },
  { id: "home-add-item", pageId: "home", title: "Add what matters", description: "Add Item is open. Pick any missing card before continuing — the menu stays interactive.", target: () => document.querySelector('[data-tour-id="home-add-item-menu"]') ?? document.querySelector('[data-tour-id="home-add-item"]'), placement: "top", targetPadding: 5, action: { id: "open-add-item", label: "Open Add Item", completedLabel: "Add Item opened", auto: true } },

  { id: "notifications", pageId: "notifications", title: "A focused inbox", description: "Filter notices, use folders, search, and open details without losing your list position.", target: '[data-tour-id="page-notifications"]', placement: "right" },
  { id: "account", pageId: "account", title: "Your reworked account", description: "Profile details, data freshness, account actions, and sync status on one page.", target: '[data-tour-id="page-account"]', placement: "top" },
  { id: "calendar", pageId: "calendar", title: "Plan around your school day", description: "Switch calendar views, manage local events, and choose which school data appears.", target: '[data-tour-id="page-calendar"]', placement: "top" },

  { id: "classes", pageId: "classes", title: "Understand each class", description: "Enrolment details, lessons, room history, attendance signals, and locally customised class colours.", target: '[data-tour-id="page-classes"]', placement: "top" },
  { id: "timetable", pageId: "timetable", title: "Week A and Week B", description: "Switch weeks and inspect teacher, room, class, and period details.", target: '[data-tour-id="page-timetable"]', placement: "top" },
  { id: "reports", pageId: "reports", title: "Reports in one archive", description: "Open available reports by year. Stored PDFs can also be annotated inside Millennium.", target: '[data-tour-id="page-reports"]', placement: "top" },
  { id: "report-annotations", pageId: "reports", title: "Annotate a report", description: "When an annotatable report is available, open it to add notes, marks, and highlights, or erase changes.", target: '[data-tour-id="report-annotate"]', placement: "left" },
  { id: "attendance", pageId: "attendance", title: "Detailed attendance", description: "All-time totals, absence history, per-class rates, and recent period-by-period records.", target: '[data-tour-id="page-attendance"]', placement: "top" },
  { id: "attendance-inference", pageId: "attendance", title: "Careful attendance filling", description: "Optional filling infers skipped rolls only from marked periods in the same class. Inferred values stay visually identified and can be disabled.", target: '[data-tour-id="attendance-inference"]', placement: "top" },

  { id: "flashcards", pageId: "flashcards", title: "Flashcards and spaced repetition", description: "Build sets, review what is due, and let the scheduler decide when each card comes back.", target: '[data-tour-id="page-flashcards"]', placement: "top" },
  { id: "flashcards-views", pageId: "flashcards", title: "More than a card list", description: "Switch between sets, smart sessions, a card browser, statistics, planning and sharing, and AI drafts. Imports and exports live in the page header.", target: '[data-tour-id="flashcards-views"]', placement: "bottom", targetPadding: 6 },
  { id: "assistant", pageId: "assistant", title: "AI Agent, on your terms", description: "Ask questions and work with dashboard context. Prefer not to use it? Turn its launcher off right here.", target: '[data-tour-id="page-assistant"]', placement: "left", action: { id: "disable-ai", label: "Disable AI Agent", completedLabel: "AI Agent disabled" } },

  { id: "settings-general", pageId: "settings/general", title: "Settings moved here", description: "Dashboard, Home, calendar, and attendance preferences now live in this dedicated area. General is the tab highlighted here.", target: () => visibleTarget('[data-tour-id="settings-nav-general"]') ?? document.querySelector('[data-tour-id="settings-general"]'), placement: "right", targetPadding: 6 },
  { id: "settings-ai-providers", pageId: "settings/assistant", title: "Bring your own AI provider", description: "Connect OpenRouter, Anthropic, or OpenAI credentials and choose which models the assistant may use.", target: '[data-tour-id="settings-ai-providers"]', placement: "top" },
  { id: "settings-notifications", pageId: "settings/notifications", title: "Notice handling", description: "Choose which categories appear, whether unread notices are grouped, and when notices auto-archive.", target: '[data-tour-id="settings-nav-notifications"]', placement: "right" },
  { id: "settings-shortcuts", pageId: "settings/shortcuts", title: "Keyboard shortcuts", description: "Rebind navigation and settings shortcuts to whatever fits your hands.", target: '[data-tour-id="settings-nav-shortcuts"]', placement: "right" },
  { id: "settings-animations", pageId: "settings/animations", title: "Advanced animation controls", description: "Tune global speed, categories, easing, and reduced-motion behaviour — or turn animation off entirely.", target: '[data-tour-id="settings-animations"]', placement: "top" },
  { id: "animation-curve-editor", pageId: "settings/animations", title: "Shape motion precisely", description: "The page-transition curve editor is open. Drag points or scrub the timeline; the dashboard preview updates live and every control stays usable.", target: '[data-tour-id="animation-curve-editor"]', placement: "left", targetPadding: 5, action: { id: "open-animation-curve", label: "Open curve editor", completedLabel: "Curve editor opened", auto: true } },
  { id: "theme-simple", pageId: "settings/theme-builder", title: "Start with a polished theme", description: "Start a simple theme to pick a base, accent, contrast, and light or dark appearance. Changes preview immediately.", target: '[data-tour-id="theme-simple-builder"]', placement: "right", targetPadding: 6 },
  { id: "theme-advanced", pageId: "settings/theme-builder", title: "Build every detail", description: "Advanced themes expose the full palette, surfaces, gradients, syntax colours, and component styling.", target: '[data-tour-id="theme-advanced-builder"]', placement: "right", targetPadding: 6, action: { id: "build-advanced-theme", label: "Create advanced theme", completedLabel: "Theme builder opened" } },
  { id: "theme-gallery", pageId: "settings/theme-builder", title: "Or start from one that is already made", description: "The theme gallery is a set of curated colourways. Picking one adds it to your own themes and applies it immediately, so it is a starting point rather than a preset you are stuck with.", target: '[data-tour-id="theme-gallery"]', placement: "top", targetPadding: 6 },
  { id: "class-colors", pageId: "settings/class-colors", title: "Colour your subjects", description: "Class colours set here follow you across Home, Calendar, Classes, and Timetable.", target: '[data-tour-id="settings-nav-class-colors"]', placement: "right" },
  { id: "settings-sync", pageId: "settings/sync", title: "Sync when you need it", description: "Run a fresh sync here. Below, tune cadence, date ranges, cache behaviour, and deeper sync runs without losing saved data during failures.", target: '[data-tour-id="settings-sync-now"]', placement: "bottom", targetPadding: 6 },
  { id: "settings-export", pageId: "settings/export", title: "Your data stays portable", description: "Download a private JSON export or restore one belonging to your account.", target: '[data-tour-id="settings-export"]', placement: "top" },
  { id: "replay", pageId: "settings/general", title: "Replay whenever needed", description: "Guides stay available in Settings. Replaying never removes your preferences or data.", target: '[data-tour-id="settings-guides"]', placement: "top" },
]

const fullTourStep = (id: string): TourStep => {
  const step = fullDashboardTour.find((entry) => entry.id === id)
  if (!step) throw new Error(`Unknown dashboard tour step: ${id}`)
  return step
}

/** The shorter guide for returning accounts: only what changed since the previous release. */
export const updateDashboardTour: readonly TourStep[] = [
  fullTourStep("flashcards"),
  fullTourStep("flashcards-views"),
  fullTourStep("account"),
  fullTourStep("report-annotations"),
  fullTourStep("attendance-inference"),
  fullTourStep("settings-general"),
  fullTourStep("settings-ai-providers"),
  fullTourStep("settings-animations"),
  fullTourStep("animation-curve-editor"),
  fullTourStep("theme-simple"),
  fullTourStep("theme-advanced"),
  fullTourStep("theme-gallery"),
  fullTourStep("settings-sync"),
  fullTourStep("settings-export"),
  { id: "full-tour", pageId: "settings/general", title: "Want the complete walkthrough?", description: "Start the full tour now, or finish here and replay it later from Guides & what's new.", target: '[data-tour-id="settings-guides"]', placement: "top" },
]
