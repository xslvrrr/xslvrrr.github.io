import { z } from "zod";

import { StudyServiceError } from "./errors";
import {
  STUDY_IMPORT_PREVIEW_TTL_MINUTES,
  buildStudyImportPreview,
  studyImportCommitCommandSchema,
  studyImportPreviewCommandSchema,
  studyImportRollbackCommandSchema,
  type StudyImportSummary,
} from "./imports";
import type {
  StudyBackupRestoreResult,
  StudyImportCommitResult,
  StudyImportRollbackResult,
  StudyRepository,
} from "./repository";
import { FsrsStudyScheduler } from "./scheduler";
import { studySyncSnapshotSchema, type StudySyncSnapshotResult } from "./sync";

/** Restore reads a file the user supplied, so the whole Study section is validated as untrusted. */
const studyBackupSchema = z.object({
  schemaVersion: z.literal(2),
  library: studySyncSnapshotSchema,
  reviewEvents: z.array(z.record(z.string(), z.unknown())).max(100_000).default([]),
}).passthrough();

const HISTORY_PAGE_LIMIT = 1_000;
/** Bounds a single export so one request cannot stream an unbounded history. */
const HISTORY_MAX_PAGES = 50;

export interface StudyImportPreviewResult {
  jobId: string;
  summary: StudyImportSummary;
  expiresAt: string;
}

export interface StudyLibraryExport {
  schemaVersion: 2;
  exportedAt: string;
  library: StudySyncSnapshotResult;
  reviewEvents: Record<string, unknown>[];
  reviewEventsTruncated: boolean;
}

async function checksum(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function invalidInput(message: string): StudyServiceError {
  return new StudyServiceError("STUDY_INVALID_INPUT", message, 400);
}

/**
 * Import and export live beside the review service rather than inside it: they share the repository
 * but none of the scheduling transaction rules.
 */
export class StudyImportService {
  constructor(private readonly repository: StudyRepository) {}

  /**
   * Validates the whole file and stores the resulting plan. Nothing is written to Study content
   * here, so preview counts are exactly what a later commit applies.
   */
  async preview(userId: string, rawCommand: unknown): Promise<StudyImportPreviewResult> {
    const parsed = studyImportPreviewCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("This import request is invalid.");
    const command = parsed.data;

    const createsDeck = !command.deckId;
    const deckId = command.deckId ?? crypto.randomUUID();
    const existingContentKeys = command.deckId
      ? await this.repository.getDeckContentKeys(userId, command.deckId)
      : new Set<string>();

    const profile = command.deckId
      ? await this.repository.getDeckSchedulerProfile(userId, command.deckId)
      : null;
    const scheduler = new FsrsStudyScheduler(profile?.parameters);

    let preview;
    try {
      preview = buildStudyImportPreview({
        command,
        deck: {
          id: deckId,
          title: command.deckTitle || "Imported set",
          description: "",
        },
        existingContentKeys,
        // Imported cards start unscheduled. CSV carries no trustworthy scheduling history.
        initialState: scheduler.createState(),
        schedulerName: scheduler.name,
        schedulerVersion: scheduler.version,
        parametersVersion: profile?.parametersVersion ?? scheduler.parametersVersion,
        createId: () => crypto.randomUUID(),
      });
    } catch (cause: unknown) {
      throw invalidInput(cause instanceof Error ? cause.message : "This file could not be read.");
    }

    if (preview.plan.notes.length === 0) {
      throw invalidInput("No rows in this file could be imported. Check the column mapping.");
    }

    const jobId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + STUDY_IMPORT_PREVIEW_TTL_MINUTES * 60_000).toISOString();
    const summary = await this.repository.createImportJob(userId, {
      jobId,
      sourceKind: "csv",
      fileName: command.fileName,
      fileChecksum: await checksum(command.content),
      delimiter: preview.summary.delimiter,
      deckId: command.deckId,
      deckTitle: command.deckTitle || "Imported set",
      createsDeck,
      duplicatePolicy: command.duplicatePolicy,
      plan: preview.plan,
      summary: preview.summary,
      expiresAt,
    });

    return { jobId, summary, expiresAt };
  }

  async commit(userId: string, rawCommand: unknown): Promise<StudyImportCommitResult> {
    const parsed = studyImportCommitCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("This import request is invalid.");
    return this.repository.commitImportJob(userId, parsed.data.jobId);
  }

  async rollback(userId: string, rawCommand: unknown): Promise<StudyImportRollbackResult> {
    const parsed = studyImportRollbackCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("This import request is invalid.");
    return this.repository.rollbackImportJob(userId, parsed.data.jobId);
  }

  /**
   * Restores the Study section of an account backup. Same-account checks belong to the caller;
   * this applies only entries the backup is newer than and never removes review history.
   */
  async restoreBackup(userId: string, rawStudy: unknown): Promise<StudyBackupRestoreResult | null> {
    const parsed = studyBackupSchema.safeParse(rawStudy);
    if (!parsed.success) throw invalidInput("The Study section of this backup could not be read.");
    if (parsed.data.library.status !== "ok") return null;

    return this.repository.restoreBackup(userId, {
      decks: parsed.data.library.decks,
      notes: parsed.data.library.notes,
      cards: parsed.data.library.cards,
      reviewEvents: parsed.data.reviewEvents,
      preferences: parsed.data.library.preferences,
    });
  }

  /** Content plus review history, in the same shape the account backup embeds. */
  async exportLibrary(userId: string, includeHistory: boolean): Promise<StudyLibraryExport> {
    const library = await this.repository.getSyncSnapshot(userId);
    const reviewEvents: Record<string, unknown>[] = [];
    let truncated = false;

    if (includeHistory) {
      let cursor: string | null = null;
      for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
        const result = await this.repository.getReviewHistoryPage(userId, cursor, HISTORY_PAGE_LIMIT);
        reviewEvents.push(...result.events);
        cursor = result.nextCursor;
        if (!cursor) break;
        // An account with more history than this reports the limit instead of silently stopping.
        if (page === HISTORY_MAX_PAGES - 1) truncated = true;
      }
    }

    return {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      library,
      reviewEvents,
      reviewEventsTruncated: truncated,
    };
  }
}
