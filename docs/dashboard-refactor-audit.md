# Dashboard Refactor Audit

Last updated: 2026-06-09

## Current State

- `src/screens/dashboard.tsx` is 8,506 lines after the first extraction pass. It is still too large, but preference persistence, hash parsing, note markdown rendering, and core home-canvas math have moved into tested modules.
- `styles/Dashboard.module.css` is still 4,972 lines and remains the next major deletion target after page/component extraction.
- Current `dashboard.tsx` static counts: 38 `useState`, 31 `useEffect`, 46 `useMemo`, 107 `useCallback`, 173 inline `style={{ ... }}` blocks, 25 `window.` references, 6 `document.` references, 10 `localStorage` references, and 33 loose `any` occurrences.
- New tested extraction modules:
  - `components/dashboard/preferences/dashboardPreferences.ts`
  - `components/dashboard/navigation/useDashboardNavigation.ts`
  - `components/dashboard/home/homeMarkdown.ts`
  - `components/dashboard/home/homeCanvasMath.ts`
  - `components/dashboard/notifications/types.ts`
- The icon picker no longer imports the full `@hugeicons/core-free-icons` catalog. HugeIcons support is now a curated subpath-loader list in `components/ui/icon-explorer.tsx`.

## Verified In This Pass

- `node --test components/dashboard/preferences/dashboardPreferences.test.js`
- `node --test components/dashboard/navigation/useDashboardNavigation.test.js`
- `node --test components/dashboard/home/homeMarkdown.test.js`
- `node --test components/dashboard/home/homeCanvasMath.test.js`
- `npm run typecheck`

## Implemented Changes

### Preferences

- Added a typed `DashboardPreferences` model containing `homeSettings`, `homeLayout`, `notificationFolders`, and `relativeNotificationDates`.
- Added `DashboardPreferencesStore` with API-first load/save and localStorage fallback.
- Moved home-settings normalization, classroom sanitization, home-layout fallback loading, folder loading, relative-date loading, and debounced preference saving into `useDashboardPreferences`.
- `dashboard.tsx` no longer directly reads/writes `HOME_SETTINGS_KEY`, `HOME_LAYOUT_KEY`, `FOLDER_STORAGE_KEY`, or `NOTIFICATION_RELATIVE_DATES_KEY`.

### Navigation

- Added `DashboardViewId`, `parseDashboardHash`, `getSettingsHash`, and `pushNavigationHistory`.
- Added `useDashboardNavigation` to own `hashchange`, start-page hash initialization, settings subroute parsing, `previousHash`, and back/forward history.
- Rewired dashboard navigation handlers and shortcut handlers through the hook while preserving `#notifications`, `#settings`, and `#settings/<section>` URL semantics.

### Home Helpers

- Extracted note token substitution and markdown rendering into `homeMarkdown.ts`.
- Extracted canvas coordinate conversion, clamping, snap math, and zoom-around-point math into `homeCanvasMath.ts`.
- Wired the dashboard to use the extracted markdown and canvas math helpers.

### Icon Picker

- Replaced full HugeIcons dynamic catalog import with curated subpath loaders for common HugeIcons.
- Persisted provider-qualified names still work for curated HugeIcons; unknown HugeIcons safely fall back to the folder icon.

## Remaining High-Risk Debt

- `dashboard.tsx` still owns most rendering for Home, Notifications, Account/Profile, Timetable, Classes, Attendance, Reports, and Settings shell composition.
- Home rendering and interaction state still need extraction into `HomePage`, `HomeColumns`, `HomePegboardCanvas`, `HomeNoteCard`, `QuickAccessPanel`, `useHomeSettings`, and `useHomeLayout`.
- Notifications still need `useNotificationWorkspace`, `NotificationsPage`, folders panel, bulk toolbar, list item, and detail panel extraction.
- Profile image editor UI and crop/export math still live in the parent screen.
- Timetable, Classes, Attendance, and Reports should move into page modules with pure helper tests.
- CSS deletion should wait until component call sites move; deleting classes before extraction would be risky.

## Next Execution Checklist

- [x] Freeze baseline and update audit doc.
- [x] Extract shared dashboard preferences with focused tests.
- [x] Extract hash navigation with focused tests.
- [x] Extract Home markdown and canvas math helpers with focused tests.
- [x] Remove full HugeIcons catalog import from icon picker.
- [ ] Extract `useHomeSettings` and `useHomeLayout`.
- [ ] Extract `HomeNoteCard`, `QuickAccessPanel`, `HomeColumns`, and `HomePegboardCanvas`.
- [ ] Extract `useNotificationWorkspace` and notification page components.
- [ ] Extract `ProfileImageDialog` and `profileImageEditor`.
- [ ] Extract Timetable, Classes, Attendance, and Reports pages.
- [ ] Remove obsolete CSS module classes after their call sites are gone.
- [ ] Add browser smoke coverage for dashboard hash routes.

## Final Verification Targets

- `npm run lint -- --max-warnings=0`
- `npm run typecheck`
- `npm run test:home-layout`
- `npm run test:assistant`
- `npm run test:desktop-links`
- New focused dashboard tests
- `npm run build`
- Browser smoke on `/dashboard#home`, `#notifications`, `#calendar`, `#classes`, `#timetable`, `#account`, `#settings`, and `#settings/theme-builder`

