/**
 * Persistence for the dashboard tab strip.
 *
 * Tabs are account-scoped browser state: they describe where a reader left off, not user data,
 * so they stay in local storage rather than the preferences API. Marketing preview frames never
 * read or write them (see `lib/dashboard-preview.ts`).
 */

import { isDashboardPreview } from './dashboard-preview';
import { scopedBrowserStorageKey } from './storage-scope';

export const DASHBOARD_TABS_KEY = 'millennium-dashboard-tabs';

/** Guards against a corrupted or hand-edited payload restoring an unusable strip. */
export const MAX_RESTORED_TABS = 24;

export interface DashboardTab {
  id: string;
  target: string;
  pinned: boolean;
}

export interface DashboardTabsSnapshot {
  tabs: DashboardTab[];
  activeTabId: string;
}

function isDashboardTab(value: unknown): value is DashboardTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Partial<DashboardTab>;
  return (
    typeof tab.id === 'string' && tab.id.length > 0 &&
    typeof tab.target === 'string' && tab.target.length > 0 &&
    typeof tab.pinned === 'boolean'
  );
}

export function normalizeDashboardTabsSnapshot(value: unknown): DashboardTabsSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Partial<DashboardTabsSnapshot>;
  if (!Array.isArray(snapshot.tabs)) return null;

  const seenIds = new Set<string>();
  const tabs = snapshot.tabs
    .filter(isDashboardTab)
    .filter((tab) => {
      if (seenIds.has(tab.id)) return false;
      seenIds.add(tab.id);
      return true;
    })
    .slice(0, MAX_RESTORED_TABS)
    .map((tab) => ({ id: tab.id, target: tab.target, pinned: tab.pinned }));

  if (tabs.length === 0) return null;

  const activeTabId = typeof snapshot.activeTabId === 'string' && seenIds.has(snapshot.activeTabId)
    ? snapshot.activeTabId
    : tabs[0].id;

  return { tabs, activeTabId };
}

/**
 * Highest numeric suffix across restored ids, so newly opened tabs cannot collide with
 * restored ones after a reload.
 */
export function highestTabSequence(tabs: readonly DashboardTab[]): number {
  return tabs.reduce((highest, tab) => {
    const match = /^tab-(\d+)$/.exec(tab.id);
    if (!match) return highest;
    return Math.max(highest, Number.parseInt(match[1], 10));
  }, 0);
}

export function loadDashboardTabs(userId?: string): DashboardTabsSnapshot | null {
  if (typeof window === 'undefined' || isDashboardPreview()) return null;
  const key = scopedBrowserStorageKey(DASHBOARD_TABS_KEY, userId);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? normalizeDashboardTabsSnapshot(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveDashboardTabs(snapshot: DashboardTabsSnapshot, userId?: string): void {
  if (typeof window === 'undefined' || isDashboardPreview()) return;
  const key = scopedBrowserStorageKey(DASHBOARD_TABS_KEY, userId);
  if (!key) return;

  try {
    window.localStorage.setItem(key, JSON.stringify({
      tabs: snapshot.tabs.slice(0, MAX_RESTORED_TABS),
      activeTabId: snapshot.activeTabId,
    }));
  } catch {
    // A full or unavailable quota only costs tab restoration, never the session itself.
  }
}
