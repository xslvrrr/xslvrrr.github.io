import type {
  StudyBootstrap,
  StudyCard,
  StudyDeck,
  StudyDeckCommand,
  StudyDeckContentsPage,
  StudyDeckSummary,
  StudyNote,
  StudyNoteCommand,
  StudyPreferences,
  StudyQueueItem,
  StudyReviewCommand,
  StudyReviewResult,
  StudyReviewTransition,
  StudySchedulerParameters,
  StudySchedulingState,
  StudyUndoCommand,
  StudyUndoResult,
  StudyUndoableReview,
} from "./domain";
import type {
  StudyBrowserPage,
  StudyBrowserQuery,
  StudyBulkCommand,
  StudyBulkResult,
} from "./browser";
import type { StudyAnalytics } from "./analytics";
import type { StudyImportPlan, StudyImportSummary } from "./imports";
import type { StudyCompiledQuery, StudyQueryNode } from "./query";
import type { StudySmartSession, StudySmartSessionCommand } from "./smart-sessions";
import type { StudySyncPullPage, StudySyncSnapshotResult } from "./sync";

export interface StudySchedulerProfileRecord {
  id: string;
  parametersVersion: string;
  parameters: StudySchedulerParameters;
}

export interface StudyStoredReviewResult {
  result: StudyReviewResult;
  request: StudyReviewCommand;
}

export interface StudyReviewCommit {
  eventId: string;
  userId: string;
  command: StudyReviewCommand;
  beforeCard: StudyCard;
  afterCard: StudyCard;
  transition: StudyReviewTransition;
  preview: StudyReviewResult["preview"];
  schedulerProfileId: string;
}

export interface StudyNoteCardTemplate {
  cardId: string;
  templateKey: string;
  ordinal: number;
}

export interface StudyNoteCommit {
  command: StudyNoteCommand;
  templates: StudyNoteCardTemplate[];
  initialState: StudySchedulingState;
  schedulerName: string;
  schedulerVersion: string;
  parametersVersion: string;
}

export interface StudyDeckContentsQuery {
  deckId: string;
  cursor?: string;
  limit: number;
}

export interface StudyQueueQuery {
  deckId?: string;
  limit: number;
  includeNew: boolean;
}

export interface StudyUndoCommit {
  command: StudyUndoCommand;
  undoEventId: string;
}

export interface StudySyncPullQuery {
  cursor: number;
  limit: number;
}

export interface StudyImportJobRecord {
  jobId: string;
  sourceKind: "csv" | "package";
  fileName: string;
  fileChecksum: string;
  delimiter: string;
  deckId: string | null;
  deckTitle: string;
  createsDeck: boolean;
  duplicatePolicy: "skip" | "import";
  plan: StudyImportPlan;
  summary: StudyImportSummary;
  expiresAt: string;
}

export interface StudyImportCommitResult {
  status: "accepted" | "duplicate";
  importedNotes: number;
  deck: StudyDeckSummary | null;
}

export interface StudyImportRollbackResult {
  status: "accepted" | "duplicate";
  removedNotes: number;
  keptReviewedNotes: number;
  deck: StudyDeckSummary | null;
}

export interface StudyReviewHistoryPage {
  events: Record<string, unknown>[];
  nextCursor: string | null;
}

export interface StudyBackupRestoreInput {
  decks: unknown[];
  notes: unknown[];
  cards: unknown[];
  reviewEvents: unknown[];
  preferences: unknown;
}

export interface StudyBackupRestoreResult {
  decksRestored: number;
  notesRestored: number;
  cardsRestored: number;
  reviewEventsRestored: number;
}

export interface StudyRepository {
  getBootstrap: (userId: string) => Promise<StudyBootstrap>;
  listDecks: (userId: string) => Promise<StudyDeckSummary[]>;
  getDeck: (userId: string, deckId: string) => Promise<StudyDeck | null>;
  getNote: (userId: string, noteId: string) => Promise<StudyNote | null>;
  getCard: (userId: string, cardId: string) => Promise<StudyCard | null>;
  getPreferences: (userId: string) => Promise<StudyPreferences>;
  getSchedulerProfile: (userId: string, card: StudyCard) => Promise<StudySchedulerProfileRecord>;
  getDeckSchedulerProfile: (userId: string, deckId: string) => Promise<StudySchedulerProfileRecord>;
  findReviewResult: (userId: string, clientOperationId: string) => Promise<StudyStoredReviewResult | null>;
  commitReview: (commit: StudyReviewCommit) => Promise<StudyReviewResult>;
  saveDeck: (userId: string, command: StudyDeckCommand) => Promise<StudyDeckSummary>;
  deleteDeck: (userId: string, deckId: string) => Promise<void>;
  saveNote: (userId: string, commit: StudyNoteCommit) => Promise<StudyDeckSummary>;
  deleteNote: (userId: string, noteId: string) => Promise<StudyDeckSummary>;
  getDeckContents: (userId: string, query: StudyDeckContentsQuery) => Promise<StudyDeckContentsPage>;
  getReviewQueue: (userId: string, query: StudyQueueQuery) => Promise<StudyQueueItem[]>;
  findUndoableReview: (userId: string, cardId?: string) => Promise<StudyUndoableReview | null>;
  commitUndo: (userId: string, commit: StudyUndoCommit) => Promise<StudyUndoResult>;
  savePreferences: (userId: string, command: Partial<StudyPreferences> & { expectedRevision?: number }) => Promise<StudyPreferences>;
  pullSyncChanges: (userId: string, query: StudySyncPullQuery) => Promise<StudySyncPullPage>;
  getSyncSnapshot: (userId: string) => Promise<StudySyncSnapshotResult>;
  getDeckContentKeys: (userId: string, deckId: string) => Promise<Set<string>>;
  createImportJob: (userId: string, job: StudyImportJobRecord) => Promise<StudyImportSummary>;
  commitImportJob: (userId: string, jobId: string) => Promise<StudyImportCommitResult>;
  rollbackImportJob: (userId: string, jobId: string) => Promise<StudyImportRollbackResult>;
  getReviewHistoryPage: (userId: string, cursor: string | null, limit: number) => Promise<StudyReviewHistoryPage>;
  restoreBackup: (userId: string, backup: StudyBackupRestoreInput) => Promise<StudyBackupRestoreResult>;
  searchCards: (userId: string, query: StudyBrowserQuery) => Promise<StudyBrowserPage>;
  bulkUpdateCards: (userId: string, command: StudyBulkCommand) => Promise<StudyBulkResult>;
  searchCompiledQuery: (
    userId: string,
    compiled: StudyCompiledQuery,
    page: { sort: string; limit: number; offset: number },
  ) => Promise<StudyBrowserPage>;
  listSmartSessions: (userId: string) => Promise<StudySmartSession[]>;
  saveSmartSession: (
    userId: string,
    command: StudySmartSessionCommand & { queryAst: StudyQueryNode },
  ) => Promise<StudySmartSession>;
  deleteSmartSession: (userId: string, sessionId: string) => Promise<void>;
  getAnalytics: (userId: string, historyDays: number, forecastDays: number) => Promise<StudyAnalytics>;
}
