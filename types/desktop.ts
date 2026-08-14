import type { ClassroomSnapshot } from './classroom';
import type { PortalData } from './portal';

export type SyncOpType =
  | 'CAL_EVENT_CREATE'
  | 'CAL_EVENT_UPDATE'
  | 'CAL_EVENT_DELETE'
  | 'LOCAL_CALENDAR_UPDATE'
  | 'PREFERENCE_UPDATE'
  | 'NOTIFICATION_STATE_UPDATE'
  | 'ANNOTATION_UPSERT'
  | 'ANNOTATION_DELETE';

export interface SyncOp<T = any> {
  id: string;
  type: SyncOpType;
  payload: T;
  timestamp: string;
}

export interface SyncConflict {
  opId: string;
  entityType: string;
  serverValue: any;
  clientValue: any;
  resolutionHint?: string;
}

export type DesktopBootState =
  | 'booting'
  | 'cache-ready-offline'
  | 'online-authenticated'
  | 'reauth-required'
  | 'first-run'
  | 'fatal-local-storage-error';

export type DesktopSecureRecordKind = 'portal-data' | 'classroom-data' | 'bootstrap';

export interface DesktopClassroomSnapshot extends ClassroomSnapshot {
  ownerId: string;
}

export interface DesktopIdentity {
  ownerId: string;
  portalUid?: string;
  displayName: string;
  school: string;
  role?: 'user' | 'admin';
  lastAuthenticatedAt: string;
  lastBootstrapAt?: string;
  schemaVersion: 1;
}

export interface DesktopBootstrapCache {
  ownerId?: string;
  identity?: DesktopIdentity;
  portalData?: PortalData | null;
  classroomData?: DesktopClassroomSnapshot | null;
  preferences?: unknown;
  notificationStates?: unknown;
  localCalendar?: { events?: unknown[]; calendars?: unknown[] };
  googleMirror?: { events?: unknown[]; calendars?: unknown[] };
  themeBuilder?: { state?: unknown; customThemes?: unknown[] };
  annotations?: unknown[];
  lastSync?: string | null;
}

export interface DesktopBootstrapPayload extends DesktopBootstrapCache {
  ownerId: string;
  identity: DesktopIdentity;
  portalData: PortalData | null;
  classroomData: DesktopClassroomSnapshot | null;
}

export type DesktopRecordReconciliation<T> =
  | { action: 'preserve' }
  | { action: 'replace'; payload: T };

export interface DesktopBootstrapWriteRequest {
  identity: DesktopIdentity;
  portalData: DesktopRecordReconciliation<PortalData>;
  classroomData: DesktopRecordReconciliation<DesktopClassroomSnapshot>;
  bootstrap: DesktopBootstrapCache;
}
