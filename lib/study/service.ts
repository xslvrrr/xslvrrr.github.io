import type {
  StudyCard,
  StudyDeckContentsPage,
  StudyDeckSummary,
  StudyPreferences,
  StudyQueueItem,
  StudyReviewCommand,
  StudyReviewResult,
  StudySchedulingState,
  StudyUndoResult,
  StudyUndoableReview,
} from "./domain";
import { z } from "zod";

import { studyAnalyticsQuerySchema, type StudyAnalytics } from "./analytics";
import {
  studyBrowserQuerySchema,
  studyBulkCommandSchema,
  type StudyBrowserItem,
  type StudyBrowserPage,
  type StudyBulkResult,
} from "./browser";
import { StudyServiceError } from "./errors";
import {
  StudyQueryError,
  compileStudyQuery,
  parseStudyQuery,
  type StudyCompiledQuery,
  type StudyQueryNode,
} from "./query";
import { buildStudySessionQueue } from "./session-queue";
import {
  studySmartSessionCommandSchema,
  type StudySmartSession,
} from "./smart-sessions";
import type {
  StudyDeckContentsQuery,
  StudyQueueQuery,
  StudyRepository,
} from "./repository";
import {
  parseStudyDeckCommand,
  parseStudyNoteCommand,
  parseStudyReviewCommand,
  parseStudyUndoCommand,
  studyDeckContentsQuerySchema,
  studyDeleteCommandSchema,
  studyPreferencesCommandSchema,
  studyQueueQuerySchema,
} from "./schemas";
import {
  deriveStudyCardTemplates,
  isAuthorableNoteType,
  parseStudyNoteFields,
} from "./note-types";
import { FsrsStudyScheduler } from "./scheduler";
import {
  studySyncPullQuerySchema,
  studySyncPushCommandSchema,
  type StudySyncPullPage,
  type StudySyncPushOutcome,
  type StudySyncPushResult,
  type StudySyncSnapshotResult,
} from "./sync";


function invalidInput(message: string): StudyServiceError {
  return new StudyServiceError("STUDY_INVALID_INPUT", message, 400);
}

export interface StudySmartSessionRun {
  queryAst: StudyQueryNode;
  total: number;
  items: StudyQueueItem[];
  strategy: "adaptive" | "blocked" | "mixed";
  explanation: string;
}

const studySmartSessionRunSchema = z.object({
  queryText: z.string().trim().min(1).max(2_000),
  orderingStrategy: z.enum(["adaptive", "blocked", "mixed"]).default("adaptive"),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  // A stable seed is what makes a paused or offline session replay in the same order.
  seed: z.string().min(1).max(200).default("default"),
}).strict();

/** Query text is parsed and compiled here so an unsupported query fails with its own message. */
function compileQueryText(queryText: string): {
  ast: StudyQueryNode;
  compiled: StudyCompiledQuery;
} {
  try {
    const ast = parseStudyQuery(queryText);
    return { ast, compiled: compileStudyQuery(ast) };
  } catch (cause: unknown) {
    if (cause instanceof StudyQueryError) {
      throw new StudyServiceError("STUDY_INVALID_INPUT", cause.message, 400);
    }
    throw invalidInput("That search could not be read.");
  }
}

function browserItemToQueueItem(item: StudyBrowserItem & {
  cardState?: string;
  elapsedDays?: number;
  scheduledDays?: number;
  learningSteps?: number;
}): StudyQueueItem {
  return {
    cardId: item.cardId,
    noteId: item.noteId,
    deckId: item.deckId,
    deckTitle: item.deckTitle,
    templateKey: item.templateKey,
    scheduleRevision: item.scheduleRevision,
    noteRevision: item.noteRevision,
    noteType: item.noteType,
    fields: item.fields,
    tags: item.tags,
    state: (item.cardState ?? "new") as StudyQueueItem["state"],
    dueAt: item.dueAt,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsedDays: item.elapsedDays ?? 0,
    scheduledDays: item.scheduledDays ?? 0,
    learningSteps: item.learningSteps ?? 0,
    repetitions: item.repetitions,
    lapses: item.lapses,
    lastReviewedAt: item.lastReviewedAt,
  };
}

/**
 * Classifies a failed offline operation. Server faults stay retryable; ownership, validation, and
 * scheduling conflicts are terminal so the desktop client stops replaying them.
 */
function pushFailureOutcome(
  operationId: string,
  kind: "review" | "undo",
  cause: unknown,
): StudySyncPushOutcome {
  if (!(cause instanceof StudyServiceError)) {
    return { operationId, kind, status: "retry", message: "Sync failed. It will be retried." };
  }
  const status = cause.code === "STUDY_CONFLICT"
    ? "conflict"
    : cause.status >= 500
      ? "retry"
      : "rejected";
  return { operationId, kind, status, errorCode: cause.code, message: cause.message };
}

function reviewCommandIdentity(command: StudyReviewCommand): string {
  return JSON.stringify({
    cardId: command.cardId,
    clientOperationId: command.clientOperationId,
    expectedScheduleRevision: command.expectedScheduleRevision,
    rating: command.rating,
    reviewedAt: command.reviewedAt,
    durationMs: command.durationMs ?? null,
    deviceId: command.deviceId ?? null,
    sessionId: command.sessionId ?? null,
  });
}

function schedulingState(card: StudyCard): StudySchedulingState {
  return {
    state: card.state,
    dueAt: card.dueAt,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    repetitions: card.repetitions,
    lapses: card.lapses,
    lastReviewedAt: card.lastReviewedAt,
  };
}

export class StudyService {
  constructor(private readonly repository: StudyRepository) {}

  async reviewCard(userId: string, rawCommand: unknown): Promise<StudyReviewResult> {
    let command: StudyReviewCommand;
    try {
      command = parseStudyReviewCommand(rawCommand);
    } catch {
      throw new StudyServiceError("STUDY_INVALID_INPUT", "Review request is invalid.", 400);
    }

    const reviewedAt = new Date(command.reviewedAt);
    const receivedAt = new Date();
    if (
      reviewedAt.getTime() < receivedAt.getTime() - 7 * 24 * 60 * 60 * 1_000
      || reviewedAt.getTime() > receivedAt.getTime() + 5 * 60 * 1_000
    ) {
      throw new StudyServiceError("STUDY_INVALID_INPUT", "Review timestamp is outside the accepted range.", 400);
    }

    const duplicate = await this.repository.findReviewResult(userId, command.clientOperationId);
    if (duplicate) {
      if (reviewCommandIdentity(duplicate.request) !== reviewCommandIdentity(command)) {
        throw new StudyServiceError(
          "STUDY_OPERATION_REJECTED",
          "Review operation ID was already used for another request.",
          409,
        );
      }
      return { ...duplicate.result, status: "duplicate" };
    }

    const card = await this.repository.getCard(userId, command.cardId);
    if (!card || card.deletedAt) {
      throw new StudyServiceError("STUDY_NOT_FOUND", "Flashcard was not found.", 404);
    }
    if (card.isSuspended || card.isBuried) {
      throw new StudyServiceError("STUDY_OPERATION_REJECTED", "Flashcard is not available for review.", 409);
    }
    if (card.scheduleRevision !== command.expectedScheduleRevision) {
      throw new StudyServiceError(
        "STUDY_CONFLICT",
        "Flashcard schedule changed on another device. Refresh before rating it.",
        409,
      );
    }

    if (card.lastReviewedAt && reviewedAt.getTime() < new Date(card.lastReviewedAt).getTime()) {
      throw new StudyServiceError("STUDY_INVALID_INPUT", "Review cannot predate the previous review.", 400);
    }

    const profile = await this.repository.getSchedulerProfile(userId, card);
    const scheduler = new FsrsStudyScheduler(profile.parameters);
    const before = schedulingState(card);
    const preview = scheduler.preview(before, reviewedAt);
    const transition = preview[command.rating];
    const timestamp = new Date().toISOString();
    const afterCard: StudyCard = {
      ...card,
      ...transition.after,
      schedulerName: scheduler.name,
      schedulerVersion: scheduler.version,
      parametersVersion: profile.parametersVersion,
      scheduleRevision: card.scheduleRevision + 1,
      updatedAt: timestamp,
    };

    return this.repository.commitReview({
      eventId: crypto.randomUUID(),
      userId,
      command,
      beforeCard: card,
      afterCard,
      transition,
      preview,
      schedulerProfileId: profile.id,
    });
  }

  async saveDeck(userId: string, rawCommand: unknown): Promise<StudyDeckSummary> {
    let command;
    try {
      command = parseStudyDeckCommand(rawCommand);
    } catch {
      throw invalidInput("Flashcard set details are invalid.");
    }
    return this.repository.saveDeck(userId, command);
  }

  async saveNote(userId: string, rawCommand: unknown): Promise<StudyDeckSummary> {
    let command;
    try {
      command = parseStudyNoteCommand(rawCommand);
    } catch {
      throw invalidInput("Flashcard details are invalid.");
    }

    if (!isAuthorableNoteType(command.noteType)) {
      throw invalidInput("This flashcard type cannot be edited here.");
    }

    let fields: Record<string, unknown>;
    try {
      fields = parseStudyNoteFields(command.noteType, command.fields);
    } catch {
      throw invalidInput("Flashcard details are invalid for this card type.");
    }

    const templates = deriveStudyCardTemplates(command.noteType, fields);
    if (templates.length === 0) {
      throw invalidInput("This flashcard does not produce any cards yet.");
    }

    const profile = await this.repository.getDeckSchedulerProfile(userId, command.deckId);
    const scheduler = new FsrsStudyScheduler(profile.parameters);

    return this.repository.saveNote(userId, {
      command: { ...command, fields },
      // Card identity comes from the template key, so an edit that keeps a key keeps its schedule.
      templates: templates.map((template) => ({
        cardId: crypto.randomUUID(),
        templateKey: template.templateKey,
        ordinal: template.ordinal,
      })),
      initialState: scheduler.createState(),
      schedulerName: scheduler.name,
      schedulerVersion: scheduler.version,
      parametersVersion: profile.parametersVersion,
    });
  }

  async deleteContent(userId: string, rawCommand: unknown): Promise<StudyDeckSummary | null> {
    const parsed = studyDeleteCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("Provide exactly one flashcard set or flashcard to delete.");
    if (parsed.data.deckId) {
      await this.repository.deleteDeck(userId, parsed.data.deckId);
      return null;
    }
    return this.repository.deleteNote(userId, parsed.data.noteId as string);
  }

  async getDeckContents(userId: string, rawQuery: unknown): Promise<StudyDeckContentsPage> {
    const parsed = studyDeckContentsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw invalidInput("Flashcard set request is invalid.");
    return this.repository.getDeckContents(userId, parsed.data as StudyDeckContentsQuery);
  }

  async getReviewQueue(userId: string, rawQuery: unknown): Promise<StudyQueueItem[]> {
    const parsed = studyQueueQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw invalidInput("Review queue request is invalid.");
    return this.repository.getReviewQueue(userId, parsed.data as StudyQueueQuery);
  }

  async findUndoableReview(userId: string, cardId?: string): Promise<StudyUndoableReview | null> {
    return this.repository.findUndoableReview(userId, cardId);
  }

  async undoReview(userId: string, rawCommand: unknown): Promise<StudyUndoResult> {
    let command;
    try {
      command = parseStudyUndoCommand(rawCommand);
    } catch {
      throw invalidInput("Undo request is invalid.");
    }
    return this.repository.commitUndo(userId, {
      command,
      undoEventId: crypto.randomUUID(),
    });
  }

  async searchCards(userId: string, rawQuery: unknown): Promise<StudyBrowserPage> {
    const parsed = studyBrowserQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw invalidInput("Browser filters are invalid.");
    return this.repository.searchCards(userId, parsed.data);
  }

  async bulkUpdateCards(userId: string, rawCommand: unknown): Promise<StudyBulkResult> {
    const parsed = studyBulkCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That bulk action is invalid.");
    return this.repository.bulkUpdateCards(userId, parsed.data);
  }

  async listSmartSessions(userId: string): Promise<StudySmartSession[]> {
    return this.repository.listSmartSessions(userId);
  }

  async saveSmartSession(userId: string, rawCommand: unknown): Promise<StudySmartSession> {
    const parsed = studySmartSessionCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("Saved session details are invalid.");

    // The stored AST is only ever produced from text that already compiled successfully.
    const { ast } = compileQueryText(parsed.data.queryText);
    return this.repository.saveSmartSession(userId, { ...parsed.data, queryAst: ast });
  }

  async deleteSmartSession(userId: string, sessionId: string): Promise<void> {
    if (!/^[0-9a-fA-F-]{36}$/.test(sessionId)) throw invalidInput("That saved session is invalid.");
    return this.repository.deleteSmartSession(userId, sessionId);
  }

  /**
   * Runs a query and orders the result for review. Ordering is deterministic for a given seed, so
   * pausing, resuming, or replaying the session offline produces the same sequence.
   */
  async runSmartSession(userId: string, rawCommand: unknown): Promise<StudySmartSessionRun> {
    const parsed = studySmartSessionRunSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("Session request is invalid.");

    const { ast, compiled } = compileQueryText(parsed.data.queryText);
    const page = await this.repository.searchCompiledQuery(userId, compiled, {
      sort: "due",
      limit: parsed.data.limit,
      offset: 0,
    });

    const items = page.items
      .filter((item) => item.state !== "suspended" && item.state !== "buried")
      .map(browserItemToQueueItem);
    const queue = buildStudySessionQueue(items, {
      strategy: parsed.data.orderingStrategy,
      seed: parsed.data.seed,
      now: new Date(),
    });

    return {
      queryAst: ast,
      total: page.total,
      items: queue.items,
      strategy: queue.strategy,
      explanation: queue.explanation,
    };
  }

  async getAnalytics(userId: string, rawQuery: unknown): Promise<StudyAnalytics> {
    const parsed = studyAnalyticsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw invalidInput("Analytics request is invalid.");
    return this.repository.getAnalytics(userId, parsed.data.historyDays, parsed.data.forecastDays);
  }

  async pullSyncChanges(userId: string, rawQuery: unknown): Promise<StudySyncPullPage> {
    const parsed = studySyncPullQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw invalidInput("Sync request is invalid.");
    return this.repository.pullSyncChanges(userId, parsed.data);
  }

  async getSyncSnapshot(userId: string): Promise<StudySyncSnapshotResult> {
    return this.repository.getSyncSnapshot(userId);
  }

  /**
   * Replays a bounded offline outbox. Every operation is idempotent by client operation ID, so a
   * duplicate delivery reports `duplicate` instead of scheduling the card twice. Conflicting and
   * rejected operations are reported per operation and never abort the rest of the batch.
   */
  async pushSyncBatch(userId: string, rawCommand: unknown): Promise<StudySyncPushResult> {
    const parsed = studySyncPushCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("Offline sync batch is invalid.");

    const outcomes: StudySyncPushOutcome[] = [];
    for (const operation of parsed.data.operations) {
      const operationId = operation.command.clientOperationId;
      try {
        if (operation.kind === "review") {
          const result = await this.reviewCard(userId, {
            ...operation.command,
            deviceId: operation.command.deviceId ?? parsed.data.deviceId,
          });
          outcomes.push({
            operationId,
            kind: "review",
            status: result.status,
            card: result.card,
          });
          continue;
        }
        const result = await this.undoReview(userId, {
          ...operation.command,
          deviceId: operation.command.deviceId ?? parsed.data.deviceId,
        });
        outcomes.push({ operationId, kind: "undo", status: result.status, card: result.card });
      } catch (cause: unknown) {
        outcomes.push(pushFailureOutcome(operationId, operation.kind, cause));
      }
    }

    const bootstrap = await this.repository.getBootstrap(userId);
    return { outcomes, cursor: bootstrap.syncCursor };
  }

  async savePreferences(userId: string, rawCommand: unknown): Promise<StudyPreferences> {
    const parsed = studyPreferencesCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("Study preferences are invalid.");
    return this.repository.savePreferences(userId, parsed.data);
  }
}
