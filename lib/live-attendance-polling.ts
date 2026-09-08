import { mergePortalData } from './portal-data-merge';
import type { PortalData } from '../types/portal';

/** Apply a live delta without moving the full-sync clock or clearing its diagnostics. */
export function mergeLiveAttendanceData(current: PortalData, incoming: PortalData): PortalData {
  const merged = mergePortalData(current, incoming)!;
  return {
    ...merged,
    lastUpdated: current.lastUpdated,
    syncMeta: current.syncMeta,
    sync: { ...current.sync, liveAttendanceOnly: true },
  };
}
