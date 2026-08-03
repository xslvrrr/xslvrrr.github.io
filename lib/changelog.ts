/**
 * Content and timing for the upcoming-release changelog page.
 *
 * The page at `/changelog` currently renders a countdown to `NEXT_RELEASE_AT` plus a preview of
 * what the release contains. Once the release ships, replace the countdown hero with the shipped
 * notes and keep this registry as the source of truth for both the page and the teaser popup.
 *
 * Section ids are persisted as bump keys, so renaming one discards its existing bumps. Add new
 * sections rather than repurposing old ids.
 */

/** 14 August 2026, 5:00 PM AEST (UTC+10, no daylight saving in August). */
export const NEXT_RELEASE_AT = "2026-08-14T07:00:00.000Z"

export const NEXT_RELEASE_LABEL = "14 August 2026, 5:00 PM AEST"

export const UPCOMING_HEADLINE = "Big things are coming to Millennium"

/** Bumps a single visitor may spend across the whole changelog. */
export const MAX_CHANGELOG_BUMPS = 3

export interface ChangelogEntry {
  readonly title: string
  readonly body: string
}

export interface ChangelogSection {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly entries: readonly ChangelogEntry[]
}

export const UPCOMING_CHANGELOG: readonly ChangelogSection[] = [
  {
    id: "platform",
    title: "A rebuilt platform",
    summary: "Millennium moves off its original Next.js foundation onto a faster, fully typed stack.",
    entries: [
      {
        title: "TanStack Start and Vite",
        body: "Every page, route, and API handler has been rewritten on TanStack Start with Vite 7. Navigation is client-side and instant, cold loads are dramatically smaller, and the whole application now shares one router and one build pipeline.",
      },
      {
        title: "Server boundaries you can reason about",
        body: "API endpoints are file routes with explicit request handlers. Shared portal, Supabase, Stripe, and cryptographic logic now lives in one place instead of being duplicated across pages, which makes behaviour consistent no matter where you trigger it.",
      },
      {
        title: "Release verification in CI",
        body: "Locked installs, typechecking, and production builds run on every change, with a separate desktop pipeline for native packages. Broken builds no longer reach you.",
      },
    ],
  },
  {
    id: "desktop",
    title: "The Millennium desktop app",
    summary: "A real native application for macOS and Windows, not a wrapped web page.",
    entries: [
      {
        title: "Native shell built on Tauri 2",
        body: "The desktop app runs a Rust host with a local asset and API server, so the interface stays responsive even on slow connections and starts up far faster than the browser.",
      },
      {
        title: "Encrypted offline cache",
        body: "Your portal and Classroom data is cached in a local SQLite database encrypted with a master key held in the operating system credential store. Close your laptop, reopen it offline, and your timetable is still there.",
      },
      {
        title: "Signed automatic updates",
        body: "The app checks for signed updates at startup, every 30 minutes, and whenever it returns to the foreground. Installing is one click from the sidebar, with progress and an automatic relaunch.",
      },
      {
        title: "Deep links and browser handoff",
        body: "Logging in from the web hands off to the desktop app through short-lived, single-use tokens with PKCE, so you never retype credentials to move between the two.",
      },
    ],
  },
  {
    id: "extension-retirement",
    title: "The browser extension is gone",
    summary: "Syncing no longer requires installing anything into your browser.",
    entries: [
      {
        title: "Retired for good",
        body: "Both the Chrome and Firefox extensions have been removed entirely. They needed broad page permissions, broke whenever a portal page changed, and were a constant source of silent sync failures.",
      },
      {
        title: "Replaced by the Puppeteer system",
        body: "Sync now runs server-side. Direct HTTP is the default path and a controlled Puppeteer browser session is the compatibility fallback for pages that genuinely need a real renderer. Nothing runs inside your browser any more.",
      },
      {
        title: "One code path, one set of bugs",
        body: "Web and desktop share the same sync engine, so a fix applies everywhere at once instead of needing three separate extension updates.",
      },
    ],
  },
  {
    id: "sync-control",
    title: "Control over what syncs",
    summary: "You decide what Millennium pulls, how often, and what it keeps.",
    entries: [
      {
        title: "Per-source toggles",
        body: "Timetable, notices, classes, attendance, reports, and Classroom can each be enabled or disabled independently. Turn off what you do not use and sync gets faster and quieter.",
      },
      {
        title: "Visible sync status",
        body: "Every source shows when it last succeeded, what it changed, and why it failed if it did. No more guessing whether the data on screen is current.",
      },
      {
        title: "Review before it sticks",
        body: "Room changes and unenrolments surface as review prompts rather than silently rewriting your timetable, so a portal glitch cannot quietly erase a class.",
      },
      {
        title: "Retention and deletion",
        body: "Clear a single source or delete every cached copy — cloud, browser, and desktop — in one coordinated operation.",
      },
    ],
  },
  {
    id: "assistant",
    title: "The Millennium assistant",
    summary: "An assistant that can actually act on your dashboard, with guardrails around every action.",
    entries: [
      {
        title: "Grounded in your own data",
        body: "The assistant reads your timetable, notices, classes, and reports directly rather than guessing. Ask what is on tomorrow or which assessments are outstanding and it answers from your real portal snapshot.",
      },
      {
        title: "Approval-gated changes",
        body: "Anything that modifies your dashboard requires a short-lived, single-use approval created and consumed on the server. Read-only questions run immediately; changes always ask first.",
      },
      {
        title: "Bring your own provider",
        body: "Connect your own model provider, or on desktop use your existing ChatGPT or Claude account through the local CLI. Entitlements and usage budgets are enforced server-side.",
      },
    ],
  },
  {
    id: "study",
    title: "Flashcards and study tools",
    summary: "A complete study surface built into the dashboard.",
    entries: [
      {
        title: "Flashcard sets and review",
        body: "Create sets by hand or have the assistant generate them from your class material, then review them with scheduling that prioritises what you are about to forget.",
      },
      {
        title: "Offline-first review",
        body: "Study sessions work without a connection and reconcile when you come back online, so a dropout mid-session never costs you progress.",
      },
      {
        title: "Exam plans and sharing",
        body: "Build a plan around an exam date and let it pace your daily reviews, or subscribe to a shared deck and keep your own schedule while its author keeps updating the content.",
      },
    ],
  },
  {
    id: "home-editing",
    title: "Advanced home editing",
    summary: "Home became a canvas instead of a fixed grid.",
    entries: [
      {
        title: "Free-canvas layout",
        body: "In advanced mode, drag any card anywhere. Cards follow your cursor directly and are allowed to overlap mid-drag, then settle into place once you let go — no more fighting a grid that repacks itself while you are still moving.",
      },
      {
        title: "Resizing and simple mode",
        body: "Resize cards to the shape you actually want, or stay in simple mode for a tidy stacked layout that needs no arranging at all. Switching between them keeps your content.",
      },
      {
        title: "Layouts that follow you",
        body: "Your arrangement is saved per account and restored on web and desktop, with an account-scoped local fallback so it still loads offline.",
      },
      {
        title: "Horizontal and vertical scrolling",
        body: "The canvas scrolls on both axes, so zoomed-in browsers and wide arrangements no longer clip cards out of reach.",
      },
    ],
  },
  {
    id: "home-cards",
    title: "Better home cards",
    summary: "Nearly every card on Home was rebuilt or extended.",
    entries: [
      {
        title: "Minimal and stylised themes",
        body: "Choose between clean shadcn surfaces and richer stylised cards from a single setting. Both now behave correctly in simple and advanced layouts, including drag behaviour and overlap rules.",
      },
      {
        title: "Quick access, rebuilt",
        body: "Quick access is its own card rather than being buried inside another one, and it works the same way in both card themes.",
      },
      {
        title: "Timetable and notices",
        body: "The timetable card shows the current and next period with room changes highlighted, and notices are grouped, filterable, and no longer duplicate themselves.",
      },
      {
        title: "Classroom and study cards",
        body: "New cards surface upcoming Classroom coursework and flashcards that are due, so the things with deadlines are visible without navigating anywhere.",
      },
    ],
  },
  {
    id: "tabs",
    title: "Tabs",
    summary: "Work across several parts of the dashboard without losing your place.",
    entries: [
      {
        title: "Multiple pages at once",
        body: "Open Classes, Reports, and Study side by side as tabs and switch between them instantly. Each tab keeps its own scroll position, filters, and state.",
      },
      {
        title: "Persistent across sessions",
        body: "Your open tabs are restored when you come back, so a half-finished piece of work is exactly where you left it.",
      },
      {
        title: "Keyboard-driven",
        body: "Open, close, and cycle tabs from the keyboard, and jump straight to any of them from the command menu.",
      },
    ],
  },
  {
    id: "attendance",
    title: "Attendance, reworked",
    summary: "Attendance went from a single number to a page that explains itself.",
    entries: [
      {
        title: "Per-period detail",
        body: "See each individual absence, partial, and late mark with its date, period, class, and the reason recorded against it, rather than one aggregate percentage.",
      },
      {
        title: "Trends over time",
        body: "Attendance is broken down by class and by term so a single bad week is distinguishable from an ongoing pattern.",
      },
      {
        title: "Explained gaps",
        body: "Where the portal reports nothing for a period, the page says so explicitly instead of silently counting it as present.",
      },
      {
        title: "Configurable thresholds",
        body: "Set what counts as a concerning percentage for you, and the page highlights against your own threshold.",
      },
    ],
  },
  {
    id: "reports",
    title: "Report annotations",
    summary: "Reports are now something you can work with, not just read.",
    entries: [
      {
        title: "Annotate any report",
        body: "Add your own notes against a subject, a grade, or a specific comment, and they persist across syncs so a re-fetch never wipes what you wrote.",
      },
      {
        title: "Generated PDFs",
        body: "Export a clean PDF of any report — with or without your annotations — using signed, expiring links rather than exposing raw storage paths.",
      },
      {
        title: "Comparison across periods",
        body: "Put reports from different periods next to each other to see how a subject moved, instead of opening them one at a time.",
      },
    ],
  },
  {
    id: "classes",
    title: "Reworked classes page",
    summary: "Classes was rebuilt on the new component system from scratch.",
    entries: [
      {
        title: "One view of every class",
        body: "Portal classes and Classroom courses are merged into a single list, so a subject appears once with everything attached to it rather than twice in two places.",
      },
      {
        title: "Real filtering and grouping",
        body: "Filter by teacher, period, or source, and group however you prefer. The view survives navigation instead of resetting each time.",
      },
      {
        title: "Honest empty states",
        body: "When the portal returns nothing for a counter, the page explains why rather than displaying a confident zero.",
      },
      {
        title: "Per-class colours",
        body: "Assign a colour to each class and it carries through the timetable, calendar, home cards, and reports.",
      },
    ],
  },
  {
    id: "calendar",
    title: "Calendar and holidays",
    summary: "The calendar now understands the school year.",
    entries: [
      {
        title: "Proper holiday handling",
        body: "Term breaks, public holidays, and pupil-free days are recognised and rendered as non-teaching days. Your timetable no longer invents a full week of classes over the holidays.",
      },
      {
        title: "Term-aware week numbering",
        body: "Week A and Week B cycles account for breaks correctly, so the first week back shows the right rotation instead of drifting by one.",
      },
      {
        title: "Local events",
        body: "Add your own events alongside portal data, with recurrence, and keep them entirely local to your account.",
      },
    ],
  },
  {
    id: "theme-builder",
    title: "Theme builder, rebuilt",
    summary: "Design a theme against your real dashboard instead of a swatch grid.",
    entries: [
      {
        title: "Live on-dashboard editing",
        body: "Changes apply to the dashboard behind the editor as you make them. You are looking at your actual Home, timetable, and cards while you tune colours, not an isolated preview panel.",
      },
      {
        title: "Full token control",
        body: "Generate a complete theme from one base colour, then override individual tokens — surfaces, borders, text tiers, accents — as far as you want to take it.",
      },
      {
        title: "Consistent everywhere",
        body: "Themes drive both the modern component library and the remaining legacy dashboard styles at once, which removes the mismatched surfaces that used to appear on older pages.",
      },
      {
        title: "Save, switch, and share",
        body: "Keep multiple themes, switch between them instantly, and carry them across web and desktop.",
      },
    ],
  },
  {
    id: "animations",
    title: "Animations, overhauled",
    summary: "Motion became a settings page rather than a single on/off switch.",
    entries: [
      {
        title: "Per-category control",
        body: "Page transitions, modals, sidebars, cards, tooltips, and toasts each have their own controls. Turn off the ones that get in your way and keep the ones that help.",
      },
      {
        title: "Duration and easing",
        body: "Adjust timing and easing curves per category, from near-instant to deliberately slow, and see the effect immediately.",
      },
      {
        title: "Reduced-motion aware",
        body: "The system respects your operating system's reduced-motion preference by default, and your explicit choices override it if you want them to.",
      },
      {
        title: "Presets",
        body: "Snappy, standard, and calm presets set everything at once if you would rather not tune individual values.",
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications, extended",
    summary: "Notices became something you can organise instead of only scroll.",
    entries: [
      {
        title: "Folders and rules",
        body: "Sort notices into folders, and have new ones routed automatically so the things that matter to you are not buried under whole-school announcements.",
      },
      {
        title: "Automatic archiving",
        body: "Notices age out on a schedule you control rather than accumulating indefinitely.",
      },
      {
        title: "No more duplicates",
        body: "The duplication that used to occur when the same notice arrived from more than one sync pass has been fixed at the merge layer.",
      },
      {
        title: "Read state that holds",
        body: "Read and unread state persists across devices and survives a re-sync.",
      },
    ],
  },
  {
    id: "account",
    title: "Account page, reworked",
    summary: "Your details are finally editable.",
    entries: [
      {
        title: "Editable profile",
        body: "Change your display name, preferred name, contact details, and profile image directly. Previously the page could only show what the portal reported.",
      },
      {
        title: "Session and device visibility",
        body: "See where you are signed in, including desktop installations, and sign out of anything you do not recognise.",
      },
      {
        title: "Export and deletion",
        body: "Export a complete signed copy of your account data, or delete the account along with every portal and Classroom cache in one coordinated operation.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings that actually work",
    summary: "Many more settings, and the existing ones now do what they claim.",
    entries: [
      {
        title: "Broken toggles repaired",
        body: "A substantial number of settings previously saved but had no effect, or reverted on reload. They have been reconnected to the behaviour they describe and are persisted server-side.",
      },
      {
        title: "New controls throughout",
        body: "Card styling, sidebar order and visibility, attendance thresholds, sync sources, assistant providers, animation categories, and data retention are all configurable now.",
      },
      {
        title: "Search and keyboard shortcuts",
        body: "Find any setting by name, and remap the dashboard's keyboard shortcuts to whatever suits you.",
      },
      {
        title: "Sensible defaults and reset",
        body: "Every section can be reset to its default independently, so experimenting no longer risks a dashboard you cannot restore.",
      },
    ],
  },
  {
    id: "classroom",
    title: "Google Classroom sync",
    summary: "Classroom work sits alongside your portal data instead of in another tab.",
    entries: [
      {
        title: "Desktop-native extraction",
        body: "Classroom sync runs through the desktop app with real operating-system consent, gated on an actual permission check rather than only an in-app dialog.",
      },
      {
        title: "Coursework in the dashboard",
        body: "Assignments, due dates, and course structure appear on Home, in Classes, and in the dedicated Classroom view, filtered and grouped the same way as everything else.",
      },
      {
        title: "Ownership and retention controls",
        body: "Synced Classroom data is scoped to your account with explicit retention rules, and deleting it removes both the cloud copy and the local cache.",
      },
    ],
  },
  {
    id: "security",
    title: "Security and privacy",
    summary: "The parts you cannot see received the largest share of the work.",
    entries: [
      {
        title: "Hardened API surface",
        body: "Mutating endpoints combine signed-session authorisation, same-origin and Fetch Metadata checks, bounded request parsing, and durable rate limiting. Roles are enforced server-side, never from anything the browser can edit.",
      },
      {
        title: "Encrypted credentials everywhere",
        body: "Portal credentials and session cookies are encrypted before storage, and browser caches are scoped per account so shared devices cannot leak between users.",
      },
      {
        title: "Redacted structured logging",
        body: "Server logs are structured and redacted, with liveness and readiness endpoints and startup validation that refuses to run with a misconfigured environment.",
      },
    ],
  },
  {
    id: "fixes",
    title: "Countless bug and interface fixes",
    summary: "Too many individual fixes to list, spread across every surface.",
    entries: [
      {
        title: "Layout and scrolling",
        body: "Clipped content, unreachable cards at browser zoom, sidebars that overlapped the content area, and modals that trapped scroll have all been addressed.",
      },
      {
        title: "Data correctness",
        body: "Duplicate notices, drifting week rotations, stale timetable entries after a room change, and counters that reported zero instead of unknown are fixed at the source rather than patched in the view.",
      },
      {
        title: "Authentication reliability",
        body: "Intermittent false credential rejections, sessions lost on desktop after a successful remote login, and deep-link callbacks consumed twice have all been resolved.",
      },
      {
        title: "Consistency work",
        body: "Spacing, typography, focus rings, empty states, loading skeletons, and error messages were normalised across the entire application.",
      },
    ],
  },
]

export const CHANGELOG_SECTION_IDS: readonly string[] = UPCOMING_CHANGELOG.map((section) => section.id)

export function isChangelogSectionId(value: unknown): value is string {
  return typeof value === "string" && CHANGELOG_SECTION_IDS.includes(value)
}
