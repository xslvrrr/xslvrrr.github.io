import type {
  StudyBootstrap,
  StudyDeckCommand,
  StudyDeckContentsPage,
  StudyDeckSummary,
  StudyNoteCommand,
  StudyPreferences,
  StudyQueueItem,
  StudyReviewCommand,
  StudyReviewResult,
  StudyUndoCommand,
  StudyUndoResult,
  StudyUndoableReview,
} from "./domain";
import {
  parseStudyBrowserPage,
  studyBrowserQueryToSearchParams,
  type StudyBrowserPage,
  type StudyBrowserQuery,
  type StudyBulkCommand,
} from "./browser";
import { parseStudyAnalytics, type StudyAnalytics } from "./analytics";
import { StudyServiceError, type StudyErrorCode } from "./errors";
import {
  parseStudyExamCoverage,
  parseStudyExamPlan,
  type StudyExamCoverage,
  type StudyExamPlan,
  type StudyExamPlanCommand,
} from "./exam-plans";
import { parseStudyPublication, type StudyPublication } from "./sharing";
import { parseStudyMedia, type StudyMedia } from "./media";
import { parseStudyDraft, type StudyDraft } from "./workshop";
import {
  parseStudySmartSession,
  type StudySmartSession,
  type StudySmartSessionCommand,
} from "./smart-sessions";
import type { StudyImportPreviewCommand, StudyImportSummary } from "./imports";
import {
  parseStudyBootstrap,
  parseStudyDeckContents,
  parseStudyDeckSummary,
  parseStudyPreferences,
  parseStudyQueueItems,
  parseStudyReviewResult,
  parseStudyUndoResult,
  parseStudyUndoableReview,
} from "./schemas";
import {
  parseStudySyncPullPage,
  parseStudySyncPushResult,
  parseStudySyncSnapshot,
  type StudySyncOperation,
  type StudySyncPullPage,
  type StudySyncPushResult,
  type StudySyncSnapshotResult,
} from "./sync";

const STUDY_ERROR_CODES = new Set<string>([
  "STUDY_NOT_FOUND",
  "STUDY_CONFLICT",
  "STUDY_LIMIT_REACHED",
  "STUDY_INVALID_INPUT",
  "STUDY_CLIENT_UPGRADE_REQUIRED",
  "STUDY_OPERATION_REJECTED",
]);

interface StudyEnvelope {
  success?: boolean;
  message?: string;
  data?: unknown;
  error?: { code?: string };
}

async function studyFetch(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    cache: "no-store",
  });

  let body: StudyEnvelope = {};
  try {
    body = (await response.json()) as StudyEnvelope;
  } catch {
    body = {};
  }

  if (!response.ok || body.success === false) {
    const code = body.error?.code;
    throw new StudyServiceError(
      STUDY_ERROR_CODES.has(code ?? "") ? (code as StudyErrorCode) : "STUDY_OPERATION_REJECTED",
      body.message || "Study request failed.",
      response.status,
    );
  }
  return body.data;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function fetchStudyBootstrap(): Promise<StudyBootstrap> {
  return parseStudyBootstrap(await studyFetch("/api/study/bootstrap"));
}

/**
 * Copies this account's legacy flashcard JSONB into normalized tables and verifies
 * the copy. Safe to repeat: the server leases the work and compares checksums.
 */
export async function migrateStudy(): Promise<Record<string, unknown>> {
  return record(await studyFetch("/api/study/migrate", { method: "POST", body: "{}" }));
}

/**
 * Points this account at normalized storage. Rejected with 409 until a migration
 * has verified, so callers should run {@link migrateStudy} first.
 */
export async function cutoverStudy(): Promise<Record<string, unknown>> {
  return record(await studyFetch("/api/study/cutover", { method: "POST", body: "{}" }));
}

export async function fetchStudyDeckContents(
  deckId: string,
  cursor?: string,
  limit = 50,
): Promise<StudyDeckContentsPage> {
  const query = new URLSearchParams({ deckId, limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return parseStudyDeckContents(await studyFetch(`/api/study/decks?${query.toString()}`));
}

export async function saveStudyDeck(command: StudyDeckCommand): Promise<StudyDeckSummary> {
  const data = record(await studyFetch("/api/study/decks", {
    method: "POST",
    body: JSON.stringify(command),
  }));
  return parseStudyDeckSummary(data.deck);
}

export async function deleteStudyDeck(deckId: string): Promise<void> {
  await studyFetch("/api/study/decks", {
    method: "DELETE",
    body: JSON.stringify({ deckId }),
  });
}

export async function saveStudyNote(command: StudyNoteCommand): Promise<StudyDeckSummary> {
  const data = record(await studyFetch("/api/study/notes", {
    method: "POST",
    body: JSON.stringify(command),
  }));
  return parseStudyDeckSummary(data.deck);
}

export async function deleteStudyNote(noteId: string): Promise<StudyDeckSummary> {
  const data = record(await studyFetch("/api/study/notes", {
    method: "DELETE",
    body: JSON.stringify({ noteId }),
  }));
  return parseStudyDeckSummary(data.deck);
}

export async function fetchStudyQueue(
  deckId?: string,
  limit = 50,
  includeNew = true,
): Promise<StudyQueueItem[]> {
  const query = new URLSearchParams({ limit: String(limit), includeNew: String(includeNew) });
  if (deckId) query.set("deckId", deckId);
  const data = record(await studyFetch(`/api/study/queue?${query.toString()}`));
  return parseStudyQueueItems(data.items);
}

export async function submitStudyReview(command: StudyReviewCommand): Promise<StudyReviewResult> {
  return parseStudyReviewResult(await studyFetch("/api/study/reviews", {
    method: "POST",
    body: JSON.stringify(command),
  }));
}

export async function fetchStudyUndoableReview(cardId?: string): Promise<StudyUndoableReview | null> {
  const query = cardId ? `?cardId=${encodeURIComponent(cardId)}` : "";
  const data = record(await studyFetch(`/api/study/undo${query}`));
  return data.review ? parseStudyUndoableReview(data.review) : null;
}

export async function undoStudyReview(command: StudyUndoCommand): Promise<StudyUndoResult> {
  return parseStudyUndoResult(await studyFetch("/api/study/undo", {
    method: "POST",
    body: JSON.stringify(command),
  }));
}

export async function fetchStudySyncPage(cursor: number, limit = 200): Promise<StudySyncPullPage> {
  const query = new URLSearchParams({ cursor: String(cursor), limit: String(limit) });
  const data = record(await studyFetch(`/api/study/sync?${query.toString()}`));
  return parseStudySyncPullPage(data.page);
}

export async function fetchStudySyncSnapshot(): Promise<StudySyncSnapshotResult> {
  const data = record(await studyFetch("/api/study/sync?reset=1"));
  return parseStudySyncSnapshot(data.snapshot);
}

export async function pushStudySyncBatch(
  deviceId: string,
  operations: StudySyncOperation[],
): Promise<StudySyncPushResult> {
  return parseStudySyncPushResult(await studyFetch("/api/study/sync", {
    method: "POST",
    body: JSON.stringify({ deviceId, operations }),
  }));
}

export async function searchStudyCards(query: Partial<StudyBrowserQuery>): Promise<StudyBrowserPage> {
  const params = studyBrowserQueryToSearchParams(query);
  return parseStudyBrowserPage(await studyFetch(`/api/study/browser?${params.toString()}`));
}

export async function bulkUpdateStudyCards(command: StudyBulkCommand): Promise<{ affected: number }> {
  const data = record(await studyFetch("/api/study/browser", {
    method: "POST",
    body: JSON.stringify(command),
  }));
  return { affected: typeof data.affected === "number" ? data.affected : 0 };
}

export async function fetchStudySmartSessions(): Promise<StudySmartSession[]> {
  const data = record(await studyFetch("/api/study/sessions"));
  return Array.isArray(data.sessions) ? data.sessions.map(parseStudySmartSession) : [];
}

export interface StudySmartSessionRunResult {
  total: number;
  items: StudyQueueItem[];
  strategy: "adaptive" | "blocked" | "mixed";
  explanation: string;
}

export async function runStudySmartSession(command: {
  queryText: string;
  orderingStrategy?: "adaptive" | "blocked" | "mixed";
  limit?: number;
  seed?: string;
}): Promise<StudySmartSessionRunResult> {
  const data = record(await studyFetch("/api/study/sessions", {
    method: "POST",
    body: JSON.stringify({ action: "run", ...command }),
  }));
  return {
    total: typeof data.total === "number" ? data.total : 0,
    items: parseStudyQueueItems(data.items),
    strategy: (data.strategy as StudySmartSessionRunResult["strategy"]) ?? "adaptive",
    explanation: typeof data.explanation === "string" ? data.explanation : "",
  };
}

export async function saveStudySmartSession(
  command: StudySmartSessionCommand,
): Promise<StudySmartSession> {
  const data = record(await studyFetch("/api/study/sessions", {
    method: "POST",
    body: JSON.stringify({ action: "save", ...command }),
  }));
  return parseStudySmartSession(data.session);
}

export async function deleteStudySmartSession(sessionId: string): Promise<void> {
  await studyFetch("/api/study/sessions", {
    method: "DELETE",
    body: JSON.stringify({ sessionId }),
  });
}

export async function fetchStudyAnalytics(historyDays = 90, forecastDays = 30): Promise<StudyAnalytics> {
  const query = new URLSearchParams({
    historyDays: String(historyDays),
    forecastDays: String(forecastDays),
  });
  return parseStudyAnalytics(await studyFetch(`/api/study/analytics?${query.toString()}`));
}

export async function fetchStudyDrafts(): Promise<StudyDraft[]> {
  const data = record(await studyFetch("/api/study/workshop"));
  return Array.isArray(data.drafts) ? data.drafts.map(parseStudyDraft) : [];
}

export async function createStudyDrafts(command: {
  deckId: string | null;
  source: { sourceKind: string; title: string; reference: string; text: string; retention?: string };
  drafts: Array<{ noteType: string; fields: Record<string, unknown>; tags?: string[]; citation: string }>;
  provider?: string;
  model?: string;
}): Promise<{ batchId: string; draftCount: number }> {
  const data = record(await studyFetch("/api/study/workshop", {
    method: "POST",
    body: JSON.stringify({ action: "draft", ...command }),
  }));
  return {
    batchId: typeof data.batchId === "string" ? data.batchId : "",
    draftCount: typeof data.draftCount === "number" ? data.draftCount : 0,
  };
}

export async function approveStudyDrafts(command: {
  deckId: string;
  drafts: Array<{
    draftId: string;
    noteType: string;
    fields: Record<string, unknown>;
    tags?: string[];
  }>;
}): Promise<{ approvedCount: number }> {
  const data = record(await studyFetch("/api/study/workshop", {
    method: "POST",
    body: JSON.stringify({ action: "approve", ...command }),
  }));
  return { approvedCount: typeof data.approvedCount === "number" ? data.approvedCount : 0 };
}

export async function rejectStudyDrafts(draftIds: string[]): Promise<{ rejectedCount: number }> {
  const data = record(await studyFetch("/api/study/workshop", {
    method: "POST",
    body: JSON.stringify({ action: "reject", draftIds }),
  }));
  return { rejectedCount: typeof data.rejectedCount === "number" ? data.rejectedCount : 0 };
}

export async function uploadStudyMedia(command: {
  data: string;
  altText: string;
  width?: number;
  height?: number;
}): Promise<StudyMedia> {
  const data = record(await studyFetch("/api/study/media", {
    method: "POST",
    body: JSON.stringify(command),
  }));
  return parseStudyMedia(data.media);
}

export async function fetchStudyMediaUrl(mediaId: string): Promise<string> {
  const query = new URLSearchParams({ mediaId });
  const data = record(await studyFetch(`/api/study/media?${query.toString()}`));
  return typeof data.url === "string" ? data.url : "";
}

export interface StudyPlanningSnapshot {
  plans: StudyExamPlan[];
  publications: StudyPublication[];
  coverage: StudyExamCoverage;
}

export async function fetchStudyPlanning(deckIds: string[] = []): Promise<StudyPlanningSnapshot> {
  const query = new URLSearchParams();
  for (const deckId of deckIds) query.append("deckId", deckId);
  const data = record(await studyFetch(`/api/study/planning?${query.toString()}`));
  return {
    plans: Array.isArray(data.plans) ? data.plans.map(parseStudyExamPlan) : [],
    publications: Array.isArray(data.publications) ? data.publications.map(parseStudyPublication) : [],
    coverage: parseStudyExamCoverage(data.coverage ?? {}),
  };
}

export async function saveStudyExamPlan(command: StudyExamPlanCommand): Promise<StudyExamPlan> {
  const data = record(await studyFetch("/api/study/planning", {
    method: "POST",
    body: JSON.stringify({ action: "save-plan", ...command }),
  }));
  return parseStudyExamPlan(data.plan);
}

export async function publishStudyDeck(command: {
  deckId: string;
  publicationId?: string;
  changelog?: string;
}): Promise<{ shareCode: string; version: number; noteCount: number }> {
  const data = record(await studyFetch("/api/study/planning", {
    method: "POST",
    body: JSON.stringify({ action: "publish", ...command }),
  }));
  return {
    shareCode: typeof data.shareCode === "string" ? data.shareCode : "",
    version: typeof data.version === "number" ? data.version : 1,
    noteCount: typeof data.noteCount === "number" ? data.noteCount : 0,
  };
}

export async function revokeStudyPublication(publicationId: string): Promise<void> {
  await studyFetch("/api/study/planning", {
    method: "POST",
    body: JSON.stringify({ action: "revoke", publicationId }),
  });
}

export async function subscribeToStudyDeck(command: {
  shareCode: string;
  deckId: string;
}): Promise<{ addedNotes: number; version: number }> {
  const data = record(await studyFetch("/api/study/planning", {
    method: "POST",
    body: JSON.stringify({ action: "subscribe", ...command }),
  }));
  return {
    addedNotes: typeof data.addedNotes === "number" ? data.addedNotes : 0,
    version: typeof data.version === "number" ? data.version : 1,
  };
}

export interface StudyImportPreviewResponse {
  jobId: string;
  summary: StudyImportSummary;
  expiresAt: string;
}

export async function previewStudyImport(
  command: StudyImportPreviewCommand,
): Promise<StudyImportPreviewResponse> {
  return await studyFetch("/api/study/import", {
    method: "POST",
    body: JSON.stringify({ action: "preview", ...command }),
  }) as StudyImportPreviewResponse;
}

export async function commitStudyImport(jobId: string): Promise<{
  importedNotes: number;
  deck: StudyDeckSummary | null;
}> {
  const data = record(await studyFetch("/api/study/import", {
    method: "POST",
    body: JSON.stringify({ action: "commit", jobId }),
  }));
  return {
    importedNotes: typeof data.importedNotes === "number" ? data.importedNotes : 0,
    deck: data.deck ? parseStudyDeckSummary(data.deck) : null,
  };
}

export async function rollbackStudyImport(jobId: string): Promise<{
  removedNotes: number;
  keptReviewedNotes: number;
}> {
  const data = record(await studyFetch("/api/study/import", {
    method: "POST",
    body: JSON.stringify({ action: "rollback", jobId }),
  }));
  return {
    removedNotes: typeof data.removedNotes === "number" ? data.removedNotes : 0,
    keptReviewedNotes: typeof data.keptReviewedNotes === "number" ? data.keptReviewedNotes : 0,
  };
}

export async function saveStudyPreferences(
  command: Partial<StudyPreferences> & { expectedRevision?: number },
): Promise<StudyPreferences> {
  const data = record(await studyFetch("/api/study/preferences", {
    method: "PUT",
    body: JSON.stringify(command),
  }));
  return parseStudyPreferences(data.preferences);
}
