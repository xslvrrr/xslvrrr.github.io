import { isDesktopApp } from "../desktop/utils";
import { fetchStudySyncPage, fetchStudySyncSnapshot, pushStudySyncBatch } from "./client";
import type { StudyCard, StudyPreferences } from "./domain";
import {
  studySyncOperationSchema,
  type StudySyncChange,
  type StudySyncOperation,
  type StudySyncPushOutcome,
  type StudySyncDeckEntity,
  type StudySyncNoteEntity,
} from "./sync";

/** Preferences are a single row per account; the local store keys them under one stable id. */
const LOCAL_PREFERENCE_ID = "preferences";
const PUSH_BATCH_SIZE = 50;
const MAX_PUSH_ROUNDS = 20;
const MAX_PULL_PAGES = 50;

export interface StudyOfflineStatus {
  cursor: number;
  deviceId: string;
  pendingCount: number;
  conflictCount: number;
  deckCount: number;
  noteCount: number;
  cardCount: number;
  oldestPendingAt: string | null;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
}

export interface StudyOfflineLibrary {
  cursor: number;
  deviceId: string;
  decks: StudySyncDeckEntity[];
  notes: StudySyncNoteEntity[];
  cards: StudyCard[];
  preferences: StudyPreferences | null;
}

export interface StudyOfflineConflict {
  operationId: string;
  kind: "review" | "undo";
  cardId: string;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: string;
}

interface LocalOutboxEntry extends StudyOfflineConflict {
  status: string;
  command: Record<string, unknown>;
}

export function isStudyOfflineHost(): boolean {
  return isDesktopApp();
}

async function invokeStudyLocal<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isDesktopApp()) throw new Error("Local Study storage is only available in Millennium Desktop.");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export function readStudyOfflineStatus(ownerId: string): Promise<StudyOfflineStatus> {
  return invokeStudyLocal<StudyOfflineStatus>("study_local_status", { ownerId });
}

export function readStudyOfflineLibrary(ownerId: string): Promise<StudyOfflineLibrary> {
  return invokeStudyLocal<StudyOfflineLibrary>("study_local_library", { ownerId });
}

export async function readStudyOfflineConflicts(ownerId: string): Promise<StudyOfflineConflict[]> {
  const entries = await invokeStudyLocal<LocalOutboxEntry[]>("study_local_conflicts", { ownerId });
  return entries.map(({ command: _command, status: _status, ...conflict }) => conflict);
}

export function discardStudyOfflineConflict(ownerId: string, operationId: string): Promise<void> {
  return invokeStudyLocal<void>("study_local_discard_conflict", { ownerId, operationId });
}

export function clearStudyOfflineData(ownerId: string): Promise<void> {
  return invokeStudyLocal<void>("study_local_clear", { ownerId });
}

/**
 * Queues one offline review. The optimistic card projection and the durable outbox command are
 * written in a single local transaction, so a crash cannot keep one without the other.
 */
export function recordStudyOfflineReview(
  ownerId: string,
  input: { operationId: string; cardId: string; command: unknown; card: StudyCard },
): Promise<void> {
  return invokeStudyLocal<void>("study_local_record_review", {
    ownerId,
    command: {
      operationId: input.operationId,
      kind: "review",
      cardId: input.cardId,
      command: input.command,
      card: input.card,
    },
  });
}

/** Queued commands are revalidated on the way out; a corrupted local row never reaches the API. */
function toSyncOperation(entry: LocalOutboxEntry): StudySyncOperation {
  return studySyncOperationSchema.parse({ kind: entry.kind, command: entry.command });
}

function toLocalChange(change: StudySyncChange): {
  kind: StudySyncChange["entityKind"];
  id: string;
  revision: number;
  payload: unknown | null;
} {
  return {
    kind: change.entityKind,
    id: change.entityKind === "preference" ? LOCAL_PREFERENCE_ID : change.entityId,
    revision: change.revision,
    payload: change.operation === "delete" ? null : change.entity,
  };
}

async function pushOutbox(ownerId: string, deviceId: string): Promise<StudySyncPushOutcome[]> {
  const outcomes: StudySyncPushOutcome[] = [];

  for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
    const pending = await invokeStudyLocal<LocalOutboxEntry[]>("study_local_pending", {
      ownerId,
      limit: PUSH_BATCH_SIZE,
    });
    if (pending.length === 0) return outcomes;

    const result = await pushStudySyncBatch(deviceId, pending.map(toSyncOperation));
    outcomes.push(...result.outcomes);

    await invokeStudyLocal<void>("study_local_resolve", {
      ownerId,
      resolutions: result.outcomes.map((outcome) => ({
        operationId: outcome.operationId,
        outcome: outcome.status,
        errorCode: outcome.errorCode ?? null,
        card: outcome.card ?? null,
      })),
    });

    // Every operation still pending means no progress; stop instead of spinning on the same batch.
    const settled = result.outcomes.some((outcome) => outcome.status !== "retry");
    if (!settled) return outcomes;
  }

  return outcomes;
}

async function pullChanges(ownerId: string, fromCursor: number): Promise<void> {
  let cursor = fromCursor;

  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const result = await fetchStudySyncPage(cursor);

    if (result.status === "reset-required") {
      await applySnapshot(ownerId);
      return;
    }

    await invokeStudyLocal<void>("study_local_apply_changes", {
      ownerId,
      batch: { cursor: result.nextCursor, changes: result.changes.map(toLocalChange) },
    });
    cursor = result.nextCursor;
    if (!result.hasMore) return;
  }
}

async function applySnapshot(ownerId: string): Promise<void> {
  const snapshot = await fetchStudySyncSnapshot();
  if (snapshot.status === "too-large") {
    // Storing part of an oversized library would look complete while hiding cards; stay online-only.
    throw new Error("This Study library is too large for offline review on this device.");
  }

  const entities = [
    ...snapshot.decks.map((deck) => ({ kind: "deck" as const, id: deck.id, revision: deck.revision, payload: deck })),
    ...snapshot.notes.map((note) => ({ kind: "note" as const, id: note.id, revision: note.revision, payload: note })),
    ...snapshot.cards.map((card) => ({
      kind: "card" as const,
      id: card.id,
      revision: card.scheduleRevision,
      payload: card,
    })),
    {
      kind: "preference" as const,
      id: LOCAL_PREFERENCE_ID,
      revision: snapshot.preferences.revision,
      payload: snapshot.preferences,
    },
  ];

  await invokeStudyLocal<void>("study_local_apply_snapshot", {
    ownerId,
    snapshot: { cursor: snapshot.cursor, entities },
  });
}

/**
 * Push first, then pull. Confirmed operations leave the outbox before new server state arrives, so
 * a local review is never overwritten by a projection that predates it.
 */
export async function synchronizeStudyOffline(ownerId: string): Promise<StudyOfflineStatus> {
  const before = await readStudyOfflineStatus(ownerId);
  await pushOutbox(ownerId, before.deviceId);

  const afterPush = await readStudyOfflineStatus(ownerId);
  if (afterPush.cursor === 0 && afterPush.cardCount === 0) await applySnapshot(ownerId);
  else await pullChanges(ownerId, afterPush.cursor);

  return readStudyOfflineStatus(ownerId);
}
