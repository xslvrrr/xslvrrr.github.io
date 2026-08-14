export type ClassroomSnapshotIntegrity = 'complete' | 'partial' | 'verified-empty';

export type ClassroomItemKind = 'assignment' | 'material' | 'question' | 'announcement' | 'unknown';

export type ClassroomSubmissionStatus =
  | 'assigned'
  | 'turned-in'
  | 'returned'
  | 'missing'
  | 'graded'
  | 'unknown';

export type ClassroomAttachmentKind = 'document' | 'spreadsheet' | 'presentation' | 'drive-file' | 'link';

export interface ClassroomAttachment {
  id: string;
  name: string;
  url: string;
  kind: ClassroomAttachmentKind;
}

export interface ClassroomSubmission {
  status: ClassroomSubmissionStatus;
  grade?: number;
  maxPoints?: number;
}

export interface ClassroomCourse {
  id: string;
  title: string;
  url: string;
  section?: string;
  room?: string;
  teacher?: string;
}

export interface ClassroomItem {
  id: string;
  courseId: string;
  kind: ClassroomItemKind;
  title: string;
  url: string;
  description?: string;
  postedAt?: string;
  dueAt?: string;
  submission?: ClassroomSubmission;
  attachments: ClassroomAttachment[];
}

export interface ClassroomCoverage {
  courseListVisited: boolean;
  courseListComplete: boolean;
  emptyStateObserved: boolean;
  coursesObserved: number;
  coursePagesVisited: number;
  coursePagesFailed: number;
  issues: string[];
}

export interface ClassroomCounts {
  courses: number;
  items: number;
  attachments: number;
  assigned: number;
  turnedIn: number;
  returned: number;
  missing: number;
  graded: number;
}

export interface ClassroomSyncMetadata {
  source: 'desktop-browser';
  extractorVersion: string;
  syncedAt: string;
  accountHint?: string;
  integrity: ClassroomSnapshotIntegrity;
  counts: ClassroomCounts;
}

export interface ClassroomSnapshot {
  version: 1;
  courses: ClassroomCourse[];
  items: ClassroomItem[];
  coverage: ClassroomCoverage;
  sync: ClassroomSyncMetadata;
}

export type ClassroomSyncSessionStatus =
  | 'pending'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface ClassroomSyncSession {
  id: string;
  status: ClassroomSyncSessionStatus;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  completedAt?: string;
  errorCode?: string;
}
