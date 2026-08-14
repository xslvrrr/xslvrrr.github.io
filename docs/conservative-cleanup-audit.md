# Conservative Cleanup Audit

Last updated: 2026-06-26

## Scope

- Scanned the TanStack Start/Vite app shell, API routes, Supabase helpers, extension sync/login flow, Vercel config, Tauri migration, styling setup, lint/typecheck scripts, tests, and major dashboard surfaces.
- Applied only locally verifiable, low-risk fixes. Browser QA is intentionally deferred to manual testing.
- This pass did not run a formal multi-agent deep security scan. The findings below come from local static review and command-based verification.

## Applied In This Pass

- Correctness: kept the forgot-password API behavior while replacing its only Axios call with the existing native `fetchWithTimeout` helper.
- Security: removed login-token and user-id log exposure from `lib/tokens.ts`, extension token-login/generate-token/sync routes, and Chromium/Firefox extension content scripts.
- Security: stopped token endpoints from returning raw server exception messages to clients.
- Security: replaced the concrete `.env.example` `SESSION_SECRET` value with a placeholder.
- Security/dependencies: removed unused `axios`, `axios-cookiejar-support`, `cheerio`, `googleapis`, `puppeteer`, and `tough-cookie`.
- Security/dependencies: ran `npm audit fix --legacy-peer-deps`; `npm audit --audit-level=moderate` now reports zero vulnerabilities.
- Maintainability/correctness: fixed calendar external prev/next hook dependencies with stable callbacks so lint is warning-free without changing calendar controls.

## Verified In This Pass

- `npm run typecheck`
- `npm run lint`
- `npm run test:desktop-links`
- `npm run test:assistant`
- `npm run test:home-layout`
- `npm audit --audit-level=moderate`
- `npm run build`

## Correctness

- The TanStack Start migration keeps compatibility shims in `start/session.tsx` and `start/router.ts`. `signIn()` still redirects to `/api/auth/signin`, but no matching route is present under `src/routes/api/auth`; trace callers before removing or re-implementing it.
- `lib/supabase.ts` exports `supabaseAdmin` as `null as any` when env vars are missing. That avoids type errors but converts configuration problems into later runtime failures.
- Several API routes return raw `error.message` in 500 responses. Token routes were cleaned up; user-preference, profile-image, desktop bootstrap, and extension data routes still need a response-shape audit before broad changes.

## Security

- Extension sync and token generation use wildcard CORS and token-based login handoff. Treat this as a public boundary: document expected callers, add abuse/rate-limit analysis, and verify token TTL/replay behavior against deployed infrastructure.
- The extension and server still exchange sensitive login tokens by design. Keep logs token-free and add regression tests around log-safe behavior if a test logger is introduced.
- Assistant actions and markdown rendering should receive a dedicated threat-model pass covering prompt-origin boundaries, local storage persistence, generated skills, and rendered assistant output.
- `eslint.config.js` ignores `**/*.js`, leaving extension scripts and Node tests outside lint coverage.

## Performance

- `vite.config.ts` raises `chunkSizeWarningLimit` to 4000, which can mask real bundle growth. Run bundle analysis before raising it further.
- Production build passes, but emits very noisy Rollup annotation warnings from `@hugeicons/core-free-icons` and large client chunk warnings, including multi-megabyte chunks.
- `components/ui/icon-explorer.tsx` supports several icon providers; the dynamic icon explorer is useful but should stay out of hot paths.
- `src/screens/dashboard.tsx` is about 9,000 lines and still owns many view states. Continue extracting tested modules from the existing dashboard audit rather than rewriting it wholesale.

## Maintainability

- The repo is mid-migration from Next/pages to TanStack Start/Vite, with many deleted legacy files and untracked new routes. Avoid mixing cleanup with migration semantics unless tests cover both.
- The current lint script does not cover JS extension code, while several extension files contain complex browser-message flows.
- Package install currently requires `--legacy-peer-deps` because of a TanStack peer-version mismatch involving `@tanstack/router-plugin`.

## UI/UX/Accessibility

- Existing shadcn/base-ui primitives are present, but large dashboard areas still use custom controls and modals. Prioritize keyboard, focus-trap, aria-label, and reduced-motion audits around calendar, theme builder, command menu, and assistant UI.
- Browser testing was not run in this pass by request; verify dashboard routes and extension login handoff manually after build issues are resolved.

## Database/Supabase

- No Supabase SQL migrations or RLS policy files are present in the repo; only the local Tauri SQLite migration exists under `src-tauri/migrations`.
- Server routes use the Supabase service-role client. That can be correct for trusted server handlers, but route-level auth/session checks need to remain explicit and testable.
- `.env.example` does not document required Supabase variables such as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Deployment/Vercel

- `vercel.json` only declares `"framework": "vite"`. Keep Vercel behavior conservative until TanStack Start build output and runtime env requirements are verified in CI.
- `npm run build` does not automatically typecheck. CI/deploy should run `npm run typecheck` before `npm run build`.
- Dependency audit is clean after this pass, but the install graph still depends on legacy peer resolution.

## Over-Engineering

- Multiple icon libraries remain in active use for the icon explorer and UI. Do not delete them until persisted icon provider data and explorer behavior are migrated.
- The removed scraping/API packages were not referenced by source after the Axios replacement; keep new external integration packages out until an actual caller needs them.
- Prefer continuing the existing tested extraction path in `docs/dashboard-refactor-audit.md` over introducing new framework abstractions.
