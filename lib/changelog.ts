/**
 * Content and timing for the upcoming-release changelog page.
 *
 * The page at `/changelog` currently renders a countdown to `NEXT_RELEASE_AT` plus a preview of
 * what the release contains. Once the release ships, replace the countdown hero with the shipped
 * notes and keep this registry as the source of truth for both the page and the teaser popup.
 */

/** 14 August 2026, 5:00 PM AEST (UTC+10, no daylight saving in August). */
export const NEXT_RELEASE_AT = "2026-08-14T07:00:00.000Z"

export const NEXT_RELEASE_LABEL = "14 August 2026, 5:00 PM AEST"

export const UPCOMING_HEADLINE = "Big things are coming to Millennium"

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
        title: "Due reminders",
        body: "A single daily reminder tells you when cards are waiting, and it stays dismissed once you have acknowledged it.",
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
        body: "Classroom sync runs through the desktop app with real operating-system consent, replacing the old browser extensions entirely. The extensions are gone, and nothing is installed into your browser any more.",
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
    id: "dashboard",
    title: "A redesigned dashboard",
    summary: "Home is now yours to arrange, and every page has been rebuilt around it.",
    entries: [
      {
        title: "Free-canvas Home",
        body: "Drag cards anywhere on an open canvas in advanced mode, or keep the tidy stacked layout in simple mode. Cards settle into place on release instead of fighting you mid-drag.",
      },
      {
        title: "Minimal and stylised card themes",
        body: "Choose between clean shadcn surfaces and richer stylised cards from a single setting, and it applies consistently in both simple and advanced layouts.",
      },
      {
        title: "Rebuilt Classes, Classroom, and Reports",
        body: "These pages were rewritten on the new component system with proper empty states, filtering, and PDF report generation.",
      },
      {
        title: "Guided tours",
        body: "A welcome tour for new accounts and a shorter what's-new tour for returning ones walk through the dashboard in place, and you can replay either from Settings.",
      },
    ],
  },
  {
    id: "appearance",
    title: "Theming and appearance",
    summary: "The visual system was rebuilt on shared tokens instead of scattered CSS.",
    entries: [
      {
        title: "Theme builder",
        body: "Build a full theme from a base colour, adjust individual tokens, and preview it live. Themes apply across the dashboard, the desktop app, and every shared component at once.",
      },
      {
        title: "Tailwind v4 and shadcn base-nova",
        body: "One token authority now drives both the modern component library and the remaining legacy dashboard styles, which removes the mismatched surfaces and inconsistent spacing.",
      },
      {
        title: "Per-class colours and animation controls",
        body: "Assign colours to individual classes, and tune or disable interface animations if you prefer a calmer or faster dashboard.",
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
        body: "Mutating endpoints combine signed-session authorisation, same-origin and Fetch Metadata checks, bounded request parsing, and rate limiting. Roles are enforced server-side, never from anything the browser can edit.",
      },
      {
        title: "Encrypted credentials everywhere",
        body: "Portal credentials and session cookies are encrypted before storage, and browser caches are scoped per account so shared devices cannot leak between users.",
      },
      {
        title: "Export and delete your data",
        body: "Export a complete signed copy of your account data, or delete it along with every portal and Classroom cache in one coordinated operation.",
      },
      {
        title: "Redacted structured logging",
        body: "Server logs are structured and redacted, with liveness and readiness endpoints and startup validation that refuses to run with a misconfigured environment.",
      },
    ],
  },
]
