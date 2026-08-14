import { countDueFlashcards } from "../study";
import { getUserFlashcardSets } from "../study-server";
import { supabaseAdmin } from "../supabase";
import type {
  StudyBootstrap,
  StudyCard,
  StudyDeck,
  StudyDeckCommand,
  StudyDeckContentsPage,
  StudyDeckSummary,
  StudyNote,
  StudyPreferences,
  StudyQueueItem,
  StudyReviewResult,
  StudyUndoResult,
  StudyUndoableReview,
} from "./domain";
import { StudyServiceError } from "./errors";
import {
  inspectLegacyStudyMigrationSource,
  planLegacyStudyMigration,
} from "./migration";
import {
  parseStudyBrowserPage,
  type StudyBrowserPage,
  type StudyBrowserQuery,
  type StudyBulkCommand,
  type StudyBulkResult,
} from "./browser";
import { parseStudyAnalytics, type StudyAnalytics } from "./analytics";
import { studyImportContentKey, type StudyImportSummary } from "./imports";
import type { StudyCompiledQuery, StudyQueryNode } from "./query";
import {
  STUDY_SMART_SESSION_LIMIT,
  parseStudySmartSession,
  type StudySmartSession,
  type StudySmartSessionCommand,
} from "./smart-sessions";
import type {
  StudyBackupRestoreInput,
  StudyBackupRestoreResult,
  StudyDeckContentsQuery,
  StudyImportCommitResult,
  StudyImportJobRecord,
  StudyImportRollbackResult,
  StudyNoteCommit,
  StudyReviewHistoryPage,
  StudyQueueQuery,
  StudyRepository,
  StudyReviewCommit,
  StudySchedulerProfileRecord,
  StudyStoredReviewResult,
  StudySyncPullQuery,
  StudyUndoCommit,
} from "./repository";
import {
  STUDY_SNAPSHOT_ENTITY_LIMIT,
  parseStudySyncPullPage,
  parseStudySyncSnapshot,
  type StudySyncPullPage,
  type StudySyncSnapshotResult,
} from "./sync";
import {
  parseStudyBootstrap,
  parseStudyCard,
  parseStudyDeckContents,
  parseStudyDeckSummary,
  parseStudyPreferences,
  parseStudyQueueItems,
  parseStudyReviewCommand,
  parseStudyReviewResult,
  parseStudyUndoResult,
  parseStudyUndoableReview,
} from "./schemas";
import {
  FsrsStudyScheduler,
  defaultStudySchedulerParameters,
} from "./scheduler";

/**
 * Study capability switches.
 *
 * These were opt-in rollout gates while the reworked Flashcards experience was being staged. It has
 * shipped, so every one of them now defaults to on and the environment variable exists only as a
 * kill switch: set it to the literal string "false" to turn a capability off for a deployment.
 *
 * They stay server-owned either way. A client never decides what it is allowed to do.
 */
function studyCapabilityEnabled(value: string | undefined): boolean {
  return value !== "false";
}

function studyOfflineSyncEnabled(): boolean {
  return studyCapabilityEnabled(process.env.STUDY_OFFLINE_SYNC_ENABLED);
}

/** Source-grounded drafting. Off means the assistant cannot create Study drafts at all. */
function studyAiWorkshopEnabled(): boolean {
  return studyCapabilityEnabled(process.env.STUDY_AI_WORKSHOP_ENABLED);
}

/** Rich note types are a rollback boundary: once authored, legacy JSONB can no longer hold them. */
function studyRichNotesEnabled(): boolean {
  return studyCapabilityEnabled(process.env.STUDY_RICH_NOTES_ENABLED);
}

/** Gates the per-account move onto normalized storage. */
function studyCutoverEnabled(): boolean {
  return studyCapabilityEnabled(process.env.STUDY_NORMALIZED_CUTOVER_ENABLED);
}

interface MigrationStateRow {
  status?: string;
  started_at?: string | null;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Study database row is missing ${field}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cardRowToDomain(value: unknown): StudyCard {
  const row = asRecord(value, "Invalid Study card row");
  return parseStudyCard({
    id: requiredString(row.id, "id"),
    userId: requiredString(row.user_id, "user_id"),
    deckId: requiredString(row.deck_id, "deck_id"),
    noteId: requiredString(row.note_id, "note_id"),
    templateKey: requiredString(row.template_key, "template_key"),
    ordinal: numberValue(row.ordinal),
    isSuspended: row.is_suspended === true,
    isBuried: row.is_buried === true,
    state: requiredString(row.card_state, "card_state"),
    dueAt: requiredString(row.due_at, "due_at"),
    stability: numberValue(row.stability),
    difficulty: numberValue(row.difficulty),
    elapsedDays: numberValue(row.elapsed_days),
    scheduledDays: numberValue(row.scheduled_days),
    learningSteps: numberValue(row.learning_steps),
    repetitions: numberValue(row.repetitions),
    lapses: numberValue(row.lapses),
    lastReviewedAt: nullableString(row.last_reviewed_at),
    schedulerName: requiredString(row.scheduler_name, "scheduler_name"),
    schedulerVersion: requiredString(row.scheduler_version, "scheduler_version"),
    parametersVersion: requiredString(row.parameters_version, "parameters_version"),
    schedulerMetadata: asRecord(row.scheduler_metadata ?? {}, "Invalid scheduler metadata"),
    scheduleRevision: numberValue(row.schedule_revision),
    createdAt: requiredString(row.created_at, "created_at"),
    updatedAt: requiredString(row.updated_at, "updated_at"),
    deletedAt: nullableString(row.deleted_at),
  });
}

export class SupabaseStudyRepository implements StudyRepository {
  private async migrationState(userId: string): Promise<MigrationStateRow | null> {
    const { data, error } = await supabaseAdmin
      .from("study_migration_state")
      .select("status, started_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as MigrationStateRow | null;
  }

  /** Which storage an account actually reads. Callers outside Study need this to stay honest. */
  async getStorageMode(userId: string): Promise<"legacy" | "normalized"> {
    const migration = await this.migrationState(userId);
    return migration?.status === "cutover" ? "normalized" : "legacy";
  }

  private async requireCutover(userId: string): Promise<void> {
    const migration = await this.migrationState(userId);
    if (migration?.status !== "cutover") {
      throw new StudyServiceError(
        "STUDY_CLIENT_UPGRADE_REQUIRED",
        "Adaptive Study storage is not active for this account yet.",
        409,
      );
    }
  }

  async migrateLegacyStudy(userId: string): Promise<Record<string, unknown>> {
    const leaseOwner = crypto.randomUUID();
    const { data: beginData, error: beginError } = await supabaseAdmin.rpc("begin_study_migration_v1", {
      p_user_id: userId,
      p_lease_owner: leaseOwner,
    });
    if (beginError) throw beginError;
    const begin = asRecord(beginData, "Invalid Study migration source");
    if (begin.status === "not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "Study account was not found.", 404);
    }
    if (begin.status === "cutover" || begin.status === "verified" || begin.status === "in-progress") return begin;

    const sourceChecksum = requiredString(begin.sourceChecksum, "source checksum");
    const startedAt = requiredString(begin.startedAt, "migration start time");
    const inspection = inspectLegacyStudyMigrationSource(begin.source);
    if (!inspection.canUseBoundedMigration) {
      const { data: deferredData, error: deferredError } = await supabaseAdmin.rpc("defer_study_migration_v1", {
        p_user_id: userId,
        p_lease_owner: leaseOwner,
        p_error_code: inspection.errorCode,
      });
      if (deferredError) throw deferredError;
      return asRecord(deferredData, "Invalid Study migration deferral");
    }
    const plan = planLegacyStudyMigration(userId, begin.source, new Date(startedAt));
    const { data, error } = await supabaseAdmin.rpc("backfill_study_legacy_v1", {
      p_user_id: userId,
      p_lease_owner: leaseOwner,
      p_expected_source: begin.source,
      p_expected_source_checksum: sourceChecksum,
      p_decks: plan.decks,
      p_notes: plan.notes,
      p_cards: plan.cards,
      p_events: plan.events,
    });
    if (error) throw error;
    return asRecord(data, "Invalid Study migration result");
  }

  async cutoverStudy(userId: string): Promise<Record<string, unknown>> {
    if (!studyCutoverEnabled()) {
      throw new StudyServiceError(
        "STUDY_OPERATION_REJECTED",
        "Normalized Study cutover is not enabled for this deployment.",
        409,
      );
    }
    const { data, error } = await supabaseAdmin.rpc("cutover_study_v1", {
      p_user_id: userId,
    });
    if (error) throw error;
    return asRecord(data, "Invalid Study cutover result");
  }

  async getBootstrap(userId: string): Promise<StudyBootstrap> {
    const migration = await this.migrationState(userId);
    if (migration?.status === "cutover") {
      const { data, error } = await supabaseAdmin.rpc("get_study_bootstrap_v1", {
        p_user_id: userId,
      });
      if (error) throw error;
      const bootstrap = parseStudyBootstrap(data);
      return {
        ...bootstrap,
        capabilities: {
          ...bootstrap.capabilities,
          offlineSync: studyOfflineSyncEnabled(),
          richNotes: studyRichNotesEnabled(),
          aiWorkshop: studyAiWorkshopEnabled(),
          cutoverAvailable: studyCutoverEnabled(),
        },
      };
    }

    const sets = await getUserFlashcardSets(userId);
    const now = new Date();
    return {
      schemaVersion: 1,
      decks: sets.map((set) => ({
        id: set.id,
        title: set.title,
        description: set.description,
        pinned: set.pinned,
        revision: 1,
        cardCount: set.cards.length,
        dueCount: countDueFlashcards([set], now),
        newCount: set.cards.filter((card) => card.repetitions === 0).length,
        updatedAt: set.updatedAt,
      })),
      preferences: {
        experienceMode: "beginner",
        desiredRetention: 0.9,
        dailyTimeBudgetMinutes: 20,
        dailyNewLimit: 20,
        dailyReviewLimit: 200,
        dayBoundaryHour: 4,
        timeZone: "UTC",
        defaultMixingStrategy: "adaptive",
        showStreaks: true,
        revision: 1,
      },
      dueCount: countDueFlashcards(sets, now),
      activeSessionId: null,
      syncCursor: 0,
      capabilities: {
        normalizedStorage: false,
        fsrs: false,
        offlineSync: false,
        richNotes: false,
        aiWorkshop: false,
        cutoverAvailable: studyCutoverEnabled(),
      },
    };
  }

  async listDecks(userId: string): Promise<StudyDeckSummary[]> {
    return (await this.getBootstrap(userId)).decks;
  }

  async getDeck(userId: string, deckId: string): Promise<StudyDeck | null> {
    await this.requireCutover(userId);
    const summary = (await this.listDecks(userId)).find((deck) => deck.id === deckId);
    if (!summary) return null;
    const { data, error } = await supabaseAdmin
      .from("study_decks")
      .select("*")
      .eq("id", deckId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      ...summary,
      userId,
      parentDeckId: nullableString(data.parent_deck_id),
      sortOrder: numberValue(data.sort_order),
      archivedAt: nullableString(data.archived_at),
      createdAt: requiredString(data.created_at, "created_at"),
      deletedAt: nullableString(data.deleted_at),
    };
  }

  async getNote(userId: string, noteId: string): Promise<StudyNote | null> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin
      .from("study_notes")
      .select("*")
      .eq("id", noteId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const rawTags: unknown = data.tags;
    return {
      id: requiredString(data.id, "id"),
      userId,
      deckId: requiredString(data.deck_id, "deck_id"),
      noteType: requiredString(data.note_type, "note_type") as StudyNote["noteType"],
      schemaVersion: numberValue(data.schema_version, 1),
      fields: asRecord(data.fields, "Invalid Study note fields"),
      tags: Array.isArray(rawTags) ? rawTags.filter((tag: unknown): tag is string => typeof tag === "string") : [],
      sourceKind: nullableString(data.source_kind),
      revision: numberValue(data.revision, 1),
      createdAt: requiredString(data.created_at, "created_at"),
      updatedAt: requiredString(data.updated_at, "updated_at"),
      deletedAt: nullableString(data.deleted_at),
    };
  }

  async getCard(userId: string, cardId: string): Promise<StudyCard | null> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin
      .from("study_cards")
      .select("*")
      .eq("id", cardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? cardRowToDomain(data) : null;
  }

  async getPreferences(userId: string): Promise<StudyPreferences> {
    return (await this.getBootstrap(userId)).preferences;
  }

  async getSchedulerProfile(
    userId: string,
    card: StudyCard,
  ): Promise<StudySchedulerProfileRecord> {
    return this.getDeckSchedulerProfile(userId, card.deckId);
  }

  async getDeckSchedulerProfile(
    userId: string,
    deckId: string,
  ): Promise<StudySchedulerProfileRecord> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin
      .from("study_scheduler_profiles")
      .select("id, deck_id, parameters_version, parameters")
      .eq("user_id", userId)
      .eq("active", true)
      .or(`deck_id.eq.${deckId},deck_id.is.null`);
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const selected = rows.find((row) => row.deck_id === deckId)
      ?? rows.find((row) => row.deck_id === null);
    if (selected) {
      return {
        id: requiredString(selected.id, "scheduler profile id"),
        parametersVersion: requiredString(selected.parameters_version, "parameters version"),
        parameters: selected.parameters,
      };
    }

    const parameters = defaultStudySchedulerParameters();
    const scheduler = new FsrsStudyScheduler(parameters);
    const profileId = crypto.randomUUID();
    const { error: insertError } = await supabaseAdmin
      .from("study_scheduler_profiles")
      .insert({
        id: profileId,
        user_id: userId,
        deck_id: null,
        name: "Balanced",
        algorithm: scheduler.name,
        algorithm_version: scheduler.version,
        parameters_version: scheduler.parametersVersion,
        parameters,
        desired_retention: parameters.desiredRetention,
        maximum_interval_days: parameters.maximumIntervalDays,
        active: true,
      });

    if (!insertError) {
      return {
        id: profileId,
        parametersVersion: scheduler.parametersVersion,
        parameters,
      };
    }

    const { data: concurrent, error: concurrentError } = await supabaseAdmin
      .from("study_scheduler_profiles")
      .select("id, parameters_version, parameters")
      .eq("user_id", userId)
      .is("deck_id", null)
      .eq("active", true)
      .maybeSingle();
    if (concurrentError) throw concurrentError;
    if (!concurrent) throw insertError;
    return {
      id: requiredString(concurrent.id, "scheduler profile id"),
      parametersVersion: requiredString(concurrent.parameters_version, "parameters version"),
      parameters: concurrent.parameters,
    };
  }

  async findReviewResult(
    userId: string,
    clientOperationId: string,
  ): Promise<StudyStoredReviewResult | null> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin
      .from("study_review_events")
      .select("result, request")
      .eq("user_id", userId)
      .eq("client_operation_id", clientOperationId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.result || !data.request) return null;
    return {
      result: parseStudyReviewResult(data.result),
      request: parseStudyReviewCommand(data.request),
    };
  }

  async commitReview(commit: StudyReviewCommit): Promise<StudyReviewResult> {
    const beforeState = {
      ...commit.transition.before,
      schedulerName: commit.beforeCard.schedulerName,
      schedulerVersion: commit.beforeCard.schedulerVersion,
      parametersVersion: commit.beforeCard.parametersVersion,
      schedulerMetadata: commit.beforeCard.schedulerMetadata,
    };
    const { data, error } = await supabaseAdmin.rpc("apply_study_review_v1", {
      p_user_id: commit.userId,
      p_card_id: commit.command.cardId,
      p_event_id: commit.eventId,
      p_client_operation_id: commit.command.clientOperationId,
      p_expected_schedule_revision: commit.command.expectedScheduleRevision,
      p_rating: commit.command.rating,
      p_reviewed_at: commit.command.reviewedAt,
      p_duration_ms: commit.command.durationMs ?? null,
      p_device_id: commit.command.deviceId ?? null,
      p_session_id: commit.command.sessionId ?? null,
      p_before_state: beforeState,
      p_after_state: commit.transition.after,
      p_preview: commit.preview,
      p_scheduler_name: commit.afterCard.schedulerName,
      p_scheduler_version: commit.afterCard.schedulerVersion,
      p_parameters_version: commit.afterCard.parametersVersion,
      p_scheduler_profile_id: commit.schedulerProfileId,
      p_retrievability_before: commit.transition.retrievabilityBefore,
      p_next_interval_seconds: commit.transition.nextIntervalSeconds,
    });
    if (error) throw error;
    const result = asRecord(data, "Invalid Study review result");
    if (result.status === "not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "Flashcard was not found.", 404);
    }
    if (result.status === "unavailable") {
      throw new StudyServiceError("STUDY_OPERATION_REJECTED", "Flashcard is not available for review.", 409);
    }
    if (result.status === "conflict") {
      throw new StudyServiceError(
        "STUDY_CONFLICT",
        "Flashcard schedule changed on another device. Refresh before rating it.",
        409,
      );
    }
    if (result.status === "invalid-review-time") {
      throw new StudyServiceError("STUDY_INVALID_INPUT", "Review cannot predate the previous review.", 400);
    }
    if (result.status === "invalid-session") {
      throw new StudyServiceError("STUDY_OPERATION_REJECTED", "Study session is no longer active.", 409);
    }
    return parseStudyReviewResult(result);
  }

  private async callStudyRpc(
    name: string,
    parameters: Record<string, unknown>,
    messages: Partial<Record<string, string>> = {},
  ): Promise<Record<string, unknown>> {
    const { data, error } = await supabaseAdmin.rpc(name, parameters);
    if (error) throw error;
    const result = asRecord(data, `Invalid ${name} result`);
    const status = typeof result.status === "string" ? result.status : "";

    if (status === "not-found" || status === "deck-not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", messages[status] ?? "Study item was not found.", 404);
    }
    if (status === "limit-reached") {
      throw new StudyServiceError(
        "STUDY_LIMIT_REACHED",
        messages[status] ?? "This account reached its Study storage limit.",
        422,
      );
    }
    if (status === "conflict") {
      throw new StudyServiceError(
        "STUDY_CONFLICT",
        messages[status] ?? "This item changed on another device. Refresh before saving again.",
        409,
      );
    }
    if (status === "superseded" || status === "already-undone" || status === "not-undoable") {
      throw new StudyServiceError(
        "STUDY_OPERATION_REJECTED",
        messages[status] ?? "This review can no longer be undone.",
        409,
      );
    }
    return result;
  }

  async saveDeck(userId: string, command: StudyDeckCommand): Promise<StudyDeckSummary> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("upsert_study_deck_v1", {
      p_user_id: userId,
      p_deck_id: command.deckId,
      p_title: command.title,
      p_description: command.description,
      p_pinned: command.pinned ?? null,
      p_expected_revision: command.expectedRevision ?? null,
    }, {
      "not-found": "Flashcard set was not found.",
      "limit-reached": "Set limit reached.",
      conflict: "This set changed on another device. Refresh before saving again.",
    });
    return parseStudyDeckSummary(result.deck);
  }

  async deleteDeck(userId: string, deckId: string): Promise<void> {
    await this.requireCutover(userId);
    await this.callStudyRpc("delete_study_deck_v1", {
      p_user_id: userId,
      p_deck_id: deckId,
    }, { "not-found": "Flashcard set was not found." });
  }

  async saveNote(userId: string, commit: StudyNoteCommit): Promise<StudyDeckSummary> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("upsert_study_note_v1", {
      p_user_id: userId,
      p_note_id: commit.command.noteId,
      p_deck_id: commit.command.deckId,
      p_note_type: commit.command.noteType,
      p_fields: commit.command.fields,
      p_tags: commit.command.tags,
      p_expected_revision: commit.command.expectedRevision ?? null,
      p_templates: commit.templates,
      p_initial_state: commit.initialState,
      p_scheduler_name: commit.schedulerName,
      p_scheduler_version: commit.schedulerVersion,
      p_parameters_version: commit.parametersVersion,
    }, {
      "deck-not-found": "Flashcard set was not found.",
      "not-found": "Flashcard was not found.",
      "limit-reached": "Card limit reached for this set.",
      conflict: "This flashcard changed on another device. Refresh before saving again.",
    });

    if (result.deck) return parseStudyDeckSummary(result.deck);
    const summary = (await this.listDecks(userId)).find((deck) => deck.id === commit.command.deckId);
    if (!summary) throw new StudyServiceError("STUDY_NOT_FOUND", "Flashcard set was not found.", 404);
    return summary;
  }

  async deleteNote(userId: string, noteId: string): Promise<StudyDeckSummary> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("delete_study_note_v1", {
      p_user_id: userId,
      p_note_id: noteId,
    }, { "not-found": "Flashcard was not found." });
    return parseStudyDeckSummary(result.deck);
  }

  async getDeckContents(
    userId: string,
    query: StudyDeckContentsQuery,
  ): Promise<StudyDeckContentsPage> {
    await this.requireCutover(userId);
    const separator = query.cursor ? query.cursor.lastIndexOf("|") : -1;
    const result = await this.callStudyRpc("get_study_deck_contents_v1", {
      p_user_id: userId,
      p_deck_id: query.deckId,
      p_after_created_at: separator > 0 ? query.cursor?.slice(0, separator) : null,
      p_after_id: separator > 0 ? query.cursor?.slice(separator + 1) : null,
      p_limit: query.limit,
    }, { "not-found": "Flashcard set was not found." });
    return parseStudyDeckContents({
      notes: result.notes,
      nextCursor: result.nextCursor ?? null,
    });
  }

  async getReviewQueue(userId: string, query: StudyQueueQuery): Promise<StudyQueueItem[]> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("get_study_review_queue_v1", {
      p_user_id: userId,
      p_deck_id: query.deckId ?? null,
      p_limit: query.limit,
      p_include_new: query.includeNew,
    });
    return parseStudyQueueItems(result.items);
  }

  async findUndoableReview(userId: string, cardId?: string): Promise<StudyUndoableReview | null> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin.rpc("get_study_undoable_review_v1", {
      p_user_id: userId,
      p_card_id: cardId ?? null,
    });
    if (error) throw error;
    const result = asRecord(data, "Invalid Study undo lookup result");
    if (result.status !== "ok") return null;
    return parseStudyUndoableReview(result);
  }

  async commitUndo(userId: string, commit: StudyUndoCommit): Promise<StudyUndoResult> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("undo_study_review_v1", {
      p_user_id: userId,
      p_target_event_id: commit.command.targetEventId,
      p_undo_event_id: commit.undoEventId,
      p_client_operation_id: commit.command.clientOperationId,
      p_device_id: commit.command.deviceId ?? null,
    }, {
      "not-found": "That review was not found.",
      "already-undone": "That review was already undone.",
      superseded: "A newer review replaced this one, so it can no longer be undone.",
      "not-undoable": "That review has no restorable state.",
    });
    return parseStudyUndoResult(result);
  }

  async pullSyncChanges(userId: string, query: StudySyncPullQuery): Promise<StudySyncPullPage> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin.rpc("pull_study_sync_v1", {
      p_user_id: userId,
      p_after_cursor: query.cursor,
      p_limit: query.limit,
    });
    if (error) throw error;
    return parseStudySyncPullPage(data);
  }

  async getSyncSnapshot(userId: string): Promise<StudySyncSnapshotResult> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin.rpc("get_study_snapshot_v1", {
      p_user_id: userId,
      p_limit: STUDY_SNAPSHOT_ENTITY_LIMIT,
    });
    if (error) throw error;
    return parseStudySyncSnapshot(data);
  }

  async getDeckContentKeys(userId: string, deckId: string): Promise<Set<string>> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin
      .from("study_notes")
      .select("fields")
      .eq("user_id", userId)
      .eq("deck_id", deckId)
      .is("deleted_at", null)
      .limit(1_000);
    if (error) throw error;

    const keys = new Set<string>();
    for (const row of data ?? []) {
      const fields = asRecord(row.fields ?? {}, "Invalid Study note fields");
      const prompt = typeof fields.prompt === "string" ? fields.prompt : "";
      const answer = typeof fields.answer === "string" ? fields.answer : "";
      if (prompt && answer) keys.add(studyImportContentKey(prompt, answer));
    }
    return keys;
  }

  async createImportJob(userId: string, job: StudyImportJobRecord): Promise<StudyImportSummary> {
    await this.requireCutover(userId);
    await this.callStudyRpc("create_study_import_job_v1", {
      p_user_id: userId,
      p_job_id: job.jobId,
      p_source_kind: job.sourceKind,
      p_file_name: job.fileName,
      p_file_checksum: job.fileChecksum,
      p_delimiter: job.delimiter,
      p_deck_id: job.deckId,
      p_deck_title: job.deckTitle,
      p_creates_deck: job.createsDeck,
      p_duplicate_policy: job.duplicatePolicy,
      p_plan: job.plan,
      p_summary: job.summary,
      p_expires_at: job.expiresAt,
    }, {
      "deck-not-found": "Flashcard set was not found.",
      "limit-reached": "This import would pass the card limit for this set.",
      "too-large": "This file has more cards than one import can add.",
    });
    return job.summary;
  }

  async commitImportJob(userId: string, jobId: string): Promise<StudyImportCommitResult> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("commit_study_import_v1", {
      p_user_id: userId,
      p_job_id: jobId,
    }, {
      "not-found": "That import was not found.",
      "deck-not-found": "Flashcard set was not found.",
      "limit-reached": "This import would pass the card limit for this set.",
      expired: "This import preview expired. Upload the file again.",
    });
    return {
      status: result.status === "duplicate" ? "duplicate" : "accepted",
      importedNotes: numberValue(result.importedNotes),
      deck: result.deck ? parseStudyDeckSummary(result.deck) : null,
    };
  }

  async rollbackImportJob(userId: string, jobId: string): Promise<StudyImportRollbackResult> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("rollback_study_import_v1", {
      p_user_id: userId,
      p_job_id: jobId,
    }, {
      "not-found": "That import was not found.",
      "not-committed": "That import was never committed, so there is nothing to undo.",
    });
    return {
      status: result.status === "duplicate" ? "duplicate" : "accepted",
      removedNotes: numberValue(result.removedNotes),
      keptReviewedNotes: numberValue(result.keptReviewedNotes),
      deck: result.deck ? parseStudyDeckSummary(result.deck) : null,
    };
  }

  async getReviewHistoryPage(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<StudyReviewHistoryPage> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin.rpc("export_study_review_events_v1", {
      p_user_id: userId,
      p_after_id: cursor,
      p_limit: limit,
    });
    if (error) throw error;
    const result = asRecord(data, "Invalid Study history page");
    return {
      events: Array.isArray(result.events) ? (result.events as Record<string, unknown>[]) : [],
      nextCursor: nullableString(result.nextCursor),
    };
  }

  async restoreBackup(
    userId: string,
    backup: StudyBackupRestoreInput,
  ): Promise<StudyBackupRestoreResult> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("restore_study_backup_v1", {
      p_user_id: userId,
      p_decks: backup.decks,
      p_notes: backup.notes,
      p_cards: backup.cards,
      p_events: backup.reviewEvents,
      p_preferences: backup.preferences ?? null,
    });
    if (result.status === "too-large") {
      throw new StudyServiceError(
        "STUDY_LIMIT_REACHED",
        "This backup holds more Study data than one restore can apply.",
        422,
      );
    }
    return {
      decksRestored: numberValue(result.decksRestored),
      notesRestored: numberValue(result.notesRestored),
      cardsRestored: numberValue(result.cardsRestored),
      reviewEventsRestored: numberValue(result.reviewEventsRestored),
    };
  }

  /** Browser filters and compiled expert queries share one search function. */
  private async runSearch(
    userId: string,
    compiled: Partial<StudyCompiledQuery> & { deckIds?: string[] },
    page: { sort: string; limit: number; offset: number },
  ): Promise<StudyBrowserPage> {
    const result = await this.callStudyRpc("search_study_cards_v2", {
      p_user_id: userId,
      p_text: compiled.text ?? null,
      p_deck_ids: compiled.deckIds ?? [],
      p_deck_titles: compiled.deckTitles ?? [],
      p_exclude_deck_titles: compiled.excludeDeckTitles ?? [],
      p_tags: compiled.tags ?? [],
      p_exclude_tags: compiled.excludeTags ?? [],
      p_note_types: compiled.noteTypes ?? [],
      p_exclude_note_types: compiled.excludeNoteTypes ?? [],
      p_states: compiled.states ?? [],
      p_exclude_states: compiled.excludeStates ?? [],
      p_only_due: compiled.onlyDue ?? false,
      p_only_lapsed: compiled.onlyLapsed ?? false,
      p_minimum_lapses: compiled.minimumLapses ?? null,
      p_maximum_lapses: compiled.maximumLapses ?? null,
      p_minimum_stability: compiled.minimumStability ?? null,
      p_maximum_stability: compiled.maximumStability ?? null,
      p_minimum_difficulty: compiled.minimumDifficulty ?? null,
      p_maximum_difficulty: compiled.maximumDifficulty ?? null,
      p_minimum_repetitions: compiled.minimumRepetitions ?? null,
      p_added_within_days: compiled.addedWithinDays ?? null,
      p_rated_within_days: compiled.ratedWithinDays ?? null,
      p_sort: page.sort,
      p_limit: page.limit,
      p_offset: page.offset,
    });
    return parseStudyBrowserPage(result);
  }

  async searchCards(userId: string, query: StudyBrowserQuery): Promise<StudyBrowserPage> {
    await this.requireCutover(userId);
    return this.runSearch(userId, {
      text: query.text ?? null,
      deckIds: query.deckIds,
      tags: query.tags,
      noteTypes: query.noteTypes,
      states: query.states,
      minimumLapses: query.minimumLapses ?? null,
    }, { sort: query.sort, limit: query.limit, offset: query.offset });
  }

  async searchCompiledQuery(
    userId: string,
    compiled: StudyCompiledQuery,
    page: { sort: string; limit: number; offset: number },
  ): Promise<StudyBrowserPage> {
    await this.requireCutover(userId);
    return this.runSearch(userId, compiled, page);
  }

  async listSmartSessions(userId: string): Promise<StudySmartSession[]> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin
      .from("study_smart_sessions")
      .select("id, name, description, query_text, query_ast, ordering_strategy, configuration, revision, updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(STUDY_SMART_SESSION_LIMIT);
    if (error) throw error;

    return (data ?? []).map((row) => parseStudySmartSession({
      id: row.id,
      name: row.name,
      description: row.description,
      queryText: row.query_text,
      queryAst: row.query_ast,
      orderingStrategy: row.ordering_strategy,
      configuration: row.configuration,
      revision: row.revision,
      updatedAt: row.updated_at,
    }));
  }

  async saveSmartSession(
    userId: string,
    command: StudySmartSessionCommand & { queryAst: StudyQueryNode },
  ): Promise<StudySmartSession> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("save_study_smart_session_v1", {
      p_user_id: userId,
      p_session_id: command.sessionId,
      p_name: command.name,
      p_description: command.description,
      p_query_text: command.queryText,
      p_query_ast: command.queryAst,
      p_ordering_strategy: command.orderingStrategy,
      p_configuration: command.configuration,
      p_expected_revision: command.expectedRevision ?? null,
    }, {
      "not-found": "That saved session was not found.",
      "limit-reached": "You already have the maximum number of saved sessions.",
      conflict: "This session changed on another device. Refresh before saving again.",
    });
    return parseStudySmartSession(result.session);
  }

  async deleteSmartSession(userId: string, sessionId: string): Promise<void> {
    await this.requireCutover(userId);
    await this.callStudyRpc("delete_study_smart_session_v1", {
      p_user_id: userId,
      p_session_id: sessionId,
    }, { "not-found": "That saved session was not found." });
  }

  async getAnalytics(
    userId: string,
    historyDays: number,
    forecastDays: number,
  ): Promise<StudyAnalytics> {
    await this.requireCutover(userId);
    const { data, error } = await supabaseAdmin.rpc("get_study_analytics_v1", {
      p_user_id: userId,
      p_history_days: historyDays,
      p_forecast_days: forecastDays,
    });
    if (error) throw error;
    return parseStudyAnalytics(data);
  }

  async bulkUpdateCards(userId: string, command: StudyBulkCommand): Promise<StudyBulkResult> {
    await this.requireCutover(userId);
    const value: Record<string, unknown> = {};
    if (command.action === "reschedule") value.dueAt = command.dueAt;
    if (command.action === "move") value.deckId = command.deckId;
    if (command.action === "add-tag" || command.action === "remove-tag") value.tag = command.tag;

    const result = await this.callStudyRpc("bulk_update_study_cards_v1", {
      p_user_id: userId,
      p_card_ids: command.cardIds,
      p_action: command.action,
      p_value: value,
    }, {
      "not-found": "Those flashcards were not found.",
      "deck-not-found": "Flashcard set was not found.",
      "too-large": "Select fewer flashcards for one action.",
    });
    return { affected: numberValue(result.affected) };
  }

  async savePreferences(
    userId: string,
    command: Partial<StudyPreferences> & { expectedRevision?: number },
  ): Promise<StudyPreferences> {
    await this.requireCutover(userId);
    const result = await this.callStudyRpc("save_study_preferences_v1", {
      p_user_id: userId,
      p_experience_mode: command.experienceMode ?? null,
      p_desired_retention: command.desiredRetention ?? null,
      p_daily_time_budget_minutes: command.dailyTimeBudgetMinutes ?? null,
      p_daily_new_limit: command.dailyNewLimit ?? null,
      p_daily_review_limit: command.dailyReviewLimit ?? null,
      p_day_boundary_hour: command.dayBoundaryHour ?? null,
      p_time_zone: command.timeZone ?? null,
      p_default_mixing_strategy: command.defaultMixingStrategy ?? null,
      p_show_streaks: command.showStreaks ?? null,
      p_expected_revision: command.expectedRevision ?? null,
    }, { conflict: "Study preferences changed on another device. Refresh before saving again." });
    return parseStudyPreferences(result.preferences);
  }
}
