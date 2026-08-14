# AI Tooling Strategy (Claude / Cowork)

Curated set of skills and MCP servers for working on Millennium as a solo developer, optimized for token efficiency, context efficiency, and code quality. Reference document, not an authoritative build spec — revisit as the project or tool ecosystem changes.

## The core principle

Every installed skill and connected MCP server has a standing cost even when unused: skill names and descriptions are re-injected into context on every turn, and any MCP server that is "connecting" or "requires authentication" generates a recurring system reminder until it's resolved one way or the other. For a solo project the right default is a small, high-signal standing set plus on-demand discovery (ToolSearch, web search) for everything else — not "install everything that might help."

Two concrete audit findings from this session: `plugin:engineering:atlassian`, `plugin:engineering:datadog`, `plugin:engineering:linear`, `plugin:engineering:notion`, and `plugin:engineering:slack` are all currently unauthenticated. They're generating reminder overhead every turn for zero benefit. Either authenticate the ones actually used, or disconnect the rest.

## External skills — keep / cut

Keep (map directly onto solo full-stack work on this repo):
- `engineering:code-review` — pairs with `qodo-pr-resolver` for pre-merge review on API routes and Tauri IPC boundaries.
- `engineering:debug` — structured repro/isolate/fix, useful given the portal-sync/JSDOM/Puppeteer surface area.
- `engineering:documentation` — for docs/runbooks, keeps the existing `docs/` conventions consistent.
- `engineering:testing-strategy` — actively useful given the split Vitest / `node:test` setup with no aggregate runner.
- `engineering:deploy-checklist` — wraps `docs/production-release-runbook.md` and `docs/desktop-release.md`.
- `engineering:tech-debt` — periodic audits; this repo already has an audit-doc habit (`dashboard-refactor-audit.md`, `conservative-cleanup-audit.md`).

Cut or leave dormant (team/ops-oriented, no team exists):
- `engineering:standup` — no one to report to.
- `engineering:incident-response` — only worth keeping if Datadog/PagerDuty get authenticated; otherwise it's a workflow shell with no live signal to run on.
- `engineering:system-design` — useful for genuinely new subsystems, but low frequency; fine to fetch via ToolSearch/skill listing on the rare occasion rather than keep always-on.

Already well-targeted, keep as-is:
- The six Stripe skills under `.agents/skills/` (`stripe-directory`, `stripe-projects`, `stripe-best-practices`, `stripe-docs`, `connect-recommend`, `upgrade-stripe`) — directly relevant given `docs/stripe-implementation-plan.md` and `docs/stripe-study-subscriptions.md`.
- `qodo-get-rules` / `qodo-pr-resolver` — keep only if Qodo is actually configured; otherwise remove, they're dead weight.

Situational, don't keep always-on: `docx`, `pdf`, `pptx`, `xlsx` — this is a pure code project; these are useful maybe a few times a year for investor/billing docs. Fine to leave installed since Cowork loads them lazily, but don't add more general-purpose document skills.

## MCP servers — keep / add / cut

Keep:
- **GitHub** — PRs, issues, commit history. Already connecting; this is the one collaboration tool worth having live for a solo dev shipping to a real repo.

Add (highest leverage for this specific codebase):
- **Supabase MCP** — direct schema/RLS/migration introspection. Given "migrations are authoritative ordered history" and "direct anonymous/authenticated table access is revoked," a live connection to actual schema state is worth more here than in a typical CRUD app — it removes a whole class of guessing about current RLS policies and column shapes.
- **A library-docs MCP (e.g. Context7)** — TanStack Start/Router, Tauri 2, and Base UI are all fast-moving and under-represented in training data. Fetching current API surface on demand instead of relying on memorized docs is a direct correctness win and avoids the token cost of you pasting doc excerpts manually.
- **Playwright or a browser-automation MCP** for the web dashboard, complementing (not replacing) Claude in Chrome — useful for scripted UI regression checks around auth/session flows and dashboard hash-routing, which are easy to silently break.

Cut / don't authenticate unless actually used day-to-day:
- **Slack, Asana, PagerDuty, Notion, Atlassian, Datadog** — no team, no on-call rotation, no ticket board to sync. Each one authenticated adds a permanent tool-schema footprint to every session.
- **GitKraken** — redundant. `.claude/settings.local.json` already grants broad `git *` Bash access, and the GitHub MCP covers PR/issue workflows; a second git-abstraction layer adds tool-selection ambiguity without new capability.

## Internal (project-specific) skills worth building

These encode CLAUDE.md conventions as enforced, low-token workflows instead of relying on Claude re-deriving them from the full CLAUDE.md every session. Recommend building with `skill-creator` and storing under `.agents/skills/`, matching the existing Stripe-skill convention rather than introducing a second skills directory.

1. **millennium-api-route** — scaffolds a new `src/routes/api/` handler with signed-session auth, same-origin/Fetch-Metadata check, bounded JSON parsing, and Supabase-backed rate limiting wired through the existing `lib/csrf.ts` / `lib/rate-limit.ts` helpers, plus a reminder that role checks must hit `public.users.role` server-side, never trust client state.
2. **millennium-dashboard-domain** — scaffolds a new `components/dashboard/<domain>/` feature (component + hook), keeping `src/screens/dashboard.tsx` thin and using hash-based navigation (`#domain/section`) instead of nested TanStack routes.
3. **millennium-migration** — walks through adding a new `supabase/migrations/*.sql` file in correct filename order, checks RLS implications against the "no anon/authenticated direct access" rule, and blocks destructive down-migrations against student data.
4. **millennium-assistant-tool** — scaffolds a new assistant tool against `lib/assistant/guardrails.ts`, forces an explicit read-only vs. mutating decision (mutating → server-side approval layer, no client-state execution), and updates `lib/assistant/actions.ts` plus `actions.test.js` together.
5. **millennium-release** — operationalizes `docs/production-release-runbook.md` and `docs/desktop-release.md`: runs `bun run verify:release`, checks that `package.json` and `src-tauri/Cargo.toml` versions match, and confirms a matching `desktop-v<version>` tag before a desktop build.
6. **millennium-test-router** — given "no reliable aggregate command" across Vitest and `node:test`, inspects a changed file's path and picks the correct runner/invocation automatically (e.g. `lib/desktop/links.test.js` → `node --test`, `lib/calendar-date.test.ts` → scoped Vitest), instead of guessing or running everything.
7. **millennium-theme-sync** — for any `lib/theme.ts` or `styles/globals.css` change, checks that both the legacy `--app-*` compatibility variables and the shadcn semantic variables (`--background`, `--primary`, `--border`, etc.) were updated together, since CLAUDE.md flags this dual-layer sync as an easy miss.

## A note on maintenance

Skill descriptions should stay as thin, imperative triggers ("scaffold a new dashboard-domain feature") rather than restating CLAUDE.md content — the full CLAUDE.md is already loaded once per session, so duplicating its content inside skill descriptions just burns tokens twice. Re-run `skill-creator`'s description-optimization pass periodically if any of the above skills start mis-triggering or under-triggering.
