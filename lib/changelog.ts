/**
 * Content and timing for the upcoming-release changelog page.
 *
 * The page at `/changelog` currently renders a countdown to `NEXT_RELEASE_AT` plus a preview of
 * what the release contains. Once the release ships, replace the countdown hero with the shipped
 * notes and keep this registry as the source of truth for both the page and the teaser popup.
 *
 * Section ids are persisted as bump keys, so renaming one discards its existing bumps. Add new
 * sections rather than repurposing old ids.
 *
 * Nothing here may describe a surface the build does not ship. Google Classroom, past papers, and
 * the desktop application are all built but held back, so they have no section — see
 * `preRelease` in `components/dashboard/navigation/dashboardRegistry.ts`.
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
        title: "One database history",
        body: "Every schema change is an ordered migration applied before the code that depends on it, and portal snapshots are merged inside the database under a row lock rather than read out, edited, and written back.",
      },
      {
        title: "Release verification in CI",
        body: "Locked installs, typechecking, and production builds run on every change. Broken builds no longer reach you.",
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
        title: "Replaced by server-side sync",
        body: "Sync now runs on the server. Direct HTTP is the default path and a controlled browser session is the compatibility fallback for pages that genuinely need a real renderer. Nothing runs inside your browser any more.",
      },
      {
        title: "One code path, one set of bugs",
        body: "There is a single sync engine, so a fix applies everywhere at once instead of needing separate extension updates.",
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
        body: "Timetable, notices, classes, attendance, and reports can each be enabled or disabled independently. Turn off what you do not use and sync gets faster and quieter.",
      },
      {
        title: "Visible sync status",
        body: "Every source shows when it last succeeded, what it changed, and why it failed if it did. A run that loses one portal page now says so and keeps the sections it did fetch, instead of reporting a plain failure.",
      },
      {
        title: "Review before it sticks",
        body: "Room changes and unenrolments surface as review prompts rather than silently rewriting your timetable, so a portal glitch cannot quietly erase a class.",
      },
      {
        title: "Deep runs for past years",
        body: "An ultra run walks a range of school years one at a time, reporting progress as it goes and rolling back to your last good snapshot if you cancel it.",
      },
      {
        title: "Retention and deletion",
        body: "Clear a single source or delete every cached copy — cloud and browser — in one coordinated operation.",
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
        body: "Connect your own OpenRouter, Anthropic, or OpenAI credentials and choose exactly which models the assistant may use. Entitlements and usage budgets are enforced server-side, never from what the browser claims.",
      },
      {
        title: "Tone and thinking",
        body: "Pick how the assistant writes, and whether it shows its reasoning summarised or not at all.",
      },
    ],
  },
  {
    id: "study",
    title: "Flashcards and study tools",
    summary: "A complete study surface built into the dashboard.",
    entries: [
      {
        title: "Sets, cards, and real scheduling",
        body: "Create sets by hand or have the assistant draft them from your class material, then review them with FSRS scheduling that prioritises what you are about to forget. Card types cover question and answer, typed answers, cloze deletions, and image occlusion.",
      },
      {
        title: "Find any card",
        body: "A card browser searches your whole collection by set, tag, type, state, lapses, stability, and dates, then suspends, buries, reschedules, retags, or deletes whatever the search returned.",
      },
      {
        title: "Focused sessions",
        body: "Run a saved or ad-hoc search as a session, ordered blocked by topic, mixed to make you tell topics apart, or adapted to what is most overdue. Each session explains the order it chose.",
      },
      {
        title: "Statistics that mean something",
        body: "Reviews, time studied, a recall estimate, a daily activity map, and a forecast of what your current schedule will ask for — each with a plain-language reading of what the number implies.",
      },
      {
        title: "Offline-first review",
        body: "Study sessions work without a connection and reconcile when you come back online, so a dropout mid-session never costs you progress.",
      },
      {
        title: "Exam plans and sharing",
        body: "Build a plan around an exam date and let it pace your daily reviews, or share a set by code and let someone take a copy while keeping their own schedule. Revoking a share removes the link from your page rather than leaving a dead row behind.",
      },
      {
        title: "Import and export",
        body: "Bring in existing decks, and download a complete copy of your sets, cards, and review history at any time.",
      },
    ],
  },
  {
    id: "home-editing",
    title: "Home, arranged the way you want",
    summary: "Home is a layout you edit in place rather than a fixed arrangement.",
    entries: [
      {
        title: "Move, span, and place cards",
        body: "Drag any card to reorder it, send it to either column, or let it span the full width. Placement is explicit, so a card that simply grew taller no longer throws unrelated cards into the other column.",
      },
      {
        title: "Draw over the top",
        body: "Free ink, text, lines, and images sit on their own layer above the cards, for the notes and arrows a card cannot hold.",
      },
      {
        title: "Two card styles",
        body: "Choose between clean minimal surfaces and richer stylised cards from one setting. Both behave identically when dragged and resized.",
      },
      {
        title: "Layouts that follow you",
        body: "Your arrangement is saved per account and restored on every device, with an account-scoped local fallback so it still loads offline.",
      },
      {
        title: "Reachable at any zoom",
        body: "Home scrolls on both axes, so a zoomed-in browser or a wide arrangement no longer clips cards out of reach.",
      },
    ],
  },
  {
    id: "home-cards",
    title: "Better home cards",
    summary: "Nearly every card on Home was rebuilt or extended.",
    entries: [
      {
        title: "Quick access, rebuilt",
        body: "Quick access is its own card rather than being buried inside another one, and each shortcut can be renamed and tinted.",
      },
      {
        title: "Timetable and notices",
        body: "The timetable card shows the current and next period with room changes highlighted, and notices are grouped, filterable, and no longer duplicate themselves.",
      },
      {
        title: "Attendance and study",
        body: "An attendance snapshot and a due-cards card put the two things with real deadlines in front of you without navigating anywhere.",
      },
      {
        title: "A note that stays",
        body: "The Home note is a full markdown editor, saved with the rest of your layout.",
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
        body: "Open Classes, Reports, and Flashcards side by side as tabs and switch between them instantly. Each tab keeps its own scroll position, filters, and state.",
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
        title: "Careful filling, clearly marked",
        body: "Optional filling infers a skipped roll only from marked periods in the same class, always shows which values were inferred, and can be turned off entirely.",
      },
      {
        title: "Configurable thresholds",
        body: "Set what counts as a concerning percentage for you, and the page highlights against your own threshold.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports you can work in",
    summary: "Reports are now something you read, mark up, and compare inside Millennium.",
    entries: [
      {
        title: "A real PDF reader",
        body: "Stored reports open in a viewer built for them: smooth zoom with the wheel, trackpad, pinch, or keyboard, selectable text, and pages that render as you reach them rather than all at once.",
      },
      {
        title: "Annotate anything",
        body: "Draw, highlight, add lines, arrows, and text notes, then erase or undo them. Marks are saved against the report and survive a re-sync.",
      },
      {
        title: "Split the view",
        body: "Divide the reader into as many panes as you need, each showing a different report, split further either way, and drag the divider between them. Splitting always adds a pane — it never replaces the one you were reading.",
      },
      {
        title: "Called by their own names",
        body: "Reports are labelled with the name the portal gave them everywhere they appear, including the file you download, instead of a generated title or an internal id.",
      },
      {
        title: "Opening and closing, animated",
        body: "Moving between the archive and a report is a deliberate transition rather than an instant swap, so it is obvious which one you are looking at.",
      },
    ],
  },
  {
    id: "classes",
    title: "Reworked classes page",
    summary: "Classes was rebuilt on the new component system from scratch.",
    entries: [
      {
        title: "Everything about one class in one place",
        body: "Enrolment details, lessons, teachers, room history, per-class attendance rates, and the periods a class actually occupies, gathered from the class list, the timetable, and the attendance register together.",
      },
      {
        title: "Past classes stay separate",
        body: "Classes you are no longer in are kept and labelled rather than deleted or mixed into your current load, and you can hide or restore one yourself.",
      },
      {
        title: "Per-class colours",
        body: "Assign a colour to each class and it carries through the timetable, calendar, home cards, and reports.",
      },
      {
        title: "Subjects that stop disappearing",
        body: "A routine sync reports only the classes whose counters moved. Millennium now merges that into the subjects you already have instead of replacing them with it, which is what left the page showing one or two subjects until you signed in again.",
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
        body: "Add your own events alongside portal data, with recurrence, duplicate cleaning, and a description tooltip, and keep them entirely local to your account.",
      },
      {
        title: "Choose what appears",
        body: "Every calendar has a checkbox, including the school calendar built from portal data, which previously could not be switched off.",
      },
      {
        title: "Hovering means hovering",
        body: "Pointing at an event highlights the event. It no longer lights up the hour or day cell the event happens to start in.",
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
        title: "Simple or complete",
        body: "Generate a whole theme from one base colour, contrast, and appearance, or open the advanced builder and set every token — surfaces, borders, text tiers, accents, gradients, and syntax colours.",
      },
      {
        title: "A gallery to start from",
        body: "A set of curated colourways you can apply in one click. Picking one adds it to your own themes, so it is a starting point rather than a preset you are locked into.",
      },
      {
        title: "Consistent everywhere",
        body: "Themes drive both the modern component library and the remaining legacy dashboard styles at once, which removes the mismatched surfaces that used to appear on older pages.",
      },
      {
        title: "Save, switch, and share",
        body: "Keep multiple themes, switch between them instantly, and export or import one as a shareable code.",
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
        title: "A real curve editor",
        body: "Shape any category's easing by dragging points on a curve, scrub the timeline, and watch a live preview of the thing you are tuning.",
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
        body: "Sort notices into folders, and write rules that file new ones automatically so the things that matter to you are not buried under whole-school announcements.",
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
        body: "Read and unread state persists across devices and survives a re-sync, and the sidebar itself can be reordered, resized, and pruned.",
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
        title: "Data freshness in the open",
        body: "See exactly how current each part of your dashboard is, and trigger a fresh sync from the same place.",
      },
      {
        title: "Export and deletion",
        body: "Export a complete signed copy of your account data, or delete the account along with every cached copy in one coordinated operation.",
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
        body: "Card styling, sidebar order and visibility, attendance thresholds, sync sources, assistant providers, animation categories, flashcard review controls, and data retention are all configurable now.",
      },
      {
        title: "Search that finds the control",
        body: "Search settings by name and land on the individual switch, not the page that contains it.",
      },
      {
        title: "Sensible defaults and reset",
        body: "Every section can be reset to its default independently, so experimenting no longer risks a dashboard you cannot restore.",
      },
      {
        title: "Shortcuts you choose",
        body: "Every navigation and settings shortcut can be rebound, including multi-key sequences.",
      },
    ],
  },
  {
    id: "guides",
    title: "Guided tours",
    summary: "A walkthrough of the dashboard, for whichever version of it is new to you.",
    entries: [
      {
        title: "Two tours",
        body: "New accounts get the full walkthrough. Returning accounts get a shorter one covering only what changed, and can start the full tour from the end of it.",
      },
      {
        title: "Interactive, not a slideshow",
        body: "Steps that need a panel open, open it themselves, and the highlighted control stays fully usable while the guide is on it.",
      },
      {
        title: "Always replayable",
        body: "Both tours live in Settings and can be replayed at any time without touching your preferences or data.",
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
        title: "Reports fetched safely",
        body: "Stored report PDFs are served from your own account's storage path, verified before they are saved, and never reachable through a guessable URL.",
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
        title: "Data correctness",
        body: "Duplicate notices, drifting week rotations, stale timetable entries after a room change, and — the big one — subjects and timetable periods vanishing after a routine background sync until you signed in again.",
      },
      {
        title: "Layout and scrolling",
        body: "Clipped content, unreachable cards at browser zoom, sidebars that overlapped the content area, and modals that trapped scroll have all been addressed.",
      },
      {
        title: "Reading and marking up documents",
        body: "Selecting text in a report no longer paints a ghost copy of it over the page, the eraser has an eraser's cursor instead of a “not allowed” sign, and zooming quickly no longer leaves pages half-drawn.",
      },
      {
        title: "Waiting states",
        body: "Every flashcards tab now says it is loading instead of showing an empty panel that was indistinguishable from having nothing.",
      },
      {
        title: "Authentication reliability",
        body: "Intermittent false credential rejections, sessions lost after a successful remote login, and callbacks consumed twice have all been resolved.",
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
