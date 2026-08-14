import { supabaseAdmin } from "../supabase";
import { StudyServiceError } from "./errors";
import { StudyMediaError, studyMediaUploadSchema, validateStudyMedia, type StudyMedia } from "./media";
import { deriveStudyCardTemplates, isAuthorableNoteType, parseStudyNoteFields } from "./note-types";
import type { StudyRepository } from "./repository";
import { FsrsStudyScheduler } from "./scheduler";
import {
  STUDY_DRAFT_TTL_HOURS,
  extractStudySourceText,
  reviewStudyDraft,
  studyDraftApprovalCommandSchema,
  studyDraftBatchCommandSchema,
  studyDraftRejectionCommandSchema,
  studySourceChecksum,
  type StudyDraft,
} from "./workshop";

function invalidInput(message: string): StudyServiceError {
  return new StudyServiceError("STUDY_INVALID_INPUT", message, 400);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface StudyDraftBatchResult {
  batchId: string;
  draftCount: number;
}

export interface StudyDraftApprovalResult {
  approvedCount: number;
  deckId: string;
}

/**
 * The drafting workshop. Nothing here writes a note directly: model output becomes a stored draft,
 * and a separate approval — always initiated by the user — is what commits it.
 */
export class StudyWorkshopService {
  constructor(private readonly repository: StudyRepository) {}

  async createDrafts(userId: string, rawCommand: unknown): Promise<StudyDraftBatchResult> {
    const parsed = studyDraftBatchCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That draft batch is invalid.");
    const command = parsed.data;

    const sourceText = extractStudySourceText(command.source.text);
    if (!sourceText) throw invalidInput("The source has no readable text.");

    // Each draft is linted and support-checked before it is ever shown as a suggestion.
    const reviewed = command.drafts.map((draft) => reviewStudyDraft({
      noteType: draft.noteType,
      fields: draft.fields,
      tags: draft.tags,
      citation: draft.citation,
    }, sourceText));

    const batchId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + STUDY_DRAFT_TTL_HOURS * 3_600_000).toISOString();

    const { data, error } = await supabaseAdmin.rpc("create_study_drafts_v1", {
      p_user_id: userId,
      p_batch_id: batchId,
      p_deck_id: command.deckId,
      p_source: {
        sourceKind: command.source.sourceKind,
        title: command.source.title,
        reference: command.source.reference,
        contentHash: await studySourceChecksum(sourceText),
        extractedCharacters: sourceText.length,
        retention: command.source.retention,
      },
      p_drafts: reviewed.map((draft, index) => ({
        id: command.drafts[index].id ?? crypto.randomUUID(),
        noteType: draft.noteType,
        fields: draft.fields,
        tags: draft.tags,
        citation: draft.citation,
        lint: draft.lint,
        origin: "assistant",
      })),
      p_provider: command.provider,
      p_model: command.model,
      p_expires_at: expiresAt,
    });
    if (error) throw error;

    const result = asRecord(data);
    if (result.status === "deck-not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "Flashcard set was not found.", 404);
    }
    if (result.status === "limit-reached") {
      throw new StudyServiceError(
        "STUDY_LIMIT_REACHED",
        "There are too many drafts waiting for review. Approve or reject some first.",
        422,
      );
    }
    if (result.status === "invalid-batch-size") throw invalidInput("That draft batch is the wrong size.");

    return { batchId, draftCount: reviewed.length };
  }

  async listPendingDrafts(userId: string): Promise<StudyDraft[]> {
    const { data, error } = await supabaseAdmin
      .from("study_drafts")
      .select(`
        id, batch_id, deck_id, note_type, fields, tags, citation, lint, status,
        provider, model, generated_at,
        source:study_sources (id, title, reference)
      `)
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;

    return (data ?? []).map((row) => {
      const source = Array.isArray(row.source) ? row.source[0] : row.source;
      return {
        id: row.id as string,
        batchId: row.batch_id as string,
        deckId: (row.deck_id as string | null) ?? null,
        noteType: row.note_type as string,
        fields: asRecord(row.fields),
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        citation: (row.citation as string) ?? "",
        lint: Array.isArray(row.lint) ? (row.lint as StudyDraft["lint"]) : [],
        status: "pending" as const,
        provider: (row.provider as string) ?? "",
        model: (row.model as string) ?? "",
        generatedAt: row.generated_at as string,
        source: source
          ? {
            id: (source as { id: string }).id,
            title: (source as { title: string }).title,
            reference: (source as { reference: string }).reference,
          }
          : null,
      };
    });
  }

  /**
   * Commits the user's edited version of the selected drafts. What gets written is what the user
   * approved, not what the model originally produced.
   */
  async approveDrafts(userId: string, rawCommand: unknown): Promise<StudyDraftApprovalResult> {
    const parsed = studyDraftApprovalCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That approval is invalid.");
    const command = parsed.data;

    const profile = await this.repository.getDeckSchedulerProfile(userId, command.deckId);
    const scheduler = new FsrsStudyScheduler(profile.parameters);

    const notes = command.drafts.map((draft) => {
      if (!isAuthorableNoteType(draft.noteType)) {
        throw invalidInput("That card type cannot be created here.");
      }
      let fields: Record<string, unknown>;
      try {
        fields = parseStudyNoteFields(draft.noteType, draft.fields);
      } catch {
        throw invalidInput("One of these cards is missing something it needs.");
      }
      return {
        id: crypto.randomUUID(),
        draftId: draft.draftId,
        noteType: draft.noteType,
        fields,
        tags: draft.tags,
        cards: deriveStudyCardTemplates(draft.noteType, fields).map((template) => ({
          id: crypto.randomUUID(),
          templateKey: template.templateKey,
          ordinal: template.ordinal,
        })),
      };
    });

    const { data, error } = await supabaseAdmin.rpc("approve_study_drafts_v1", {
      p_user_id: userId,
      p_draft_ids: command.drafts.map((draft) => draft.draftId),
      p_deck_id: command.deckId,
      p_notes: notes,
      p_initial_state: scheduler.createState(),
      p_scheduler_name: scheduler.name,
      p_scheduler_version: scheduler.version,
      p_parameters_version: profile.parametersVersion,
    });
    if (error) throw error;

    const result = asRecord(data);
    if (result.status === "deck-not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "Flashcard set was not found.", 404);
    }
    if (result.status === "already-resolved") {
      throw new StudyServiceError(
        "STUDY_OPERATION_REJECTED",
        "Some of these drafts were already approved or rejected.",
        409,
      );
    }
    if (result.status === "limit-reached") {
      throw new StudyServiceError("STUDY_LIMIT_REACHED", "This set is full.", 422);
    }

    return {
      approvedCount: Number(result.approvedCount ?? 0),
      deckId: command.deckId,
    };
  }

  async rejectDrafts(userId: string, rawCommand: unknown): Promise<{ rejectedCount: number }> {
    const parsed = studyDraftRejectionCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That rejection is invalid.");

    const { data, error } = await supabaseAdmin.rpc("reject_study_drafts_v1", {
      p_user_id: userId,
      p_draft_ids: parsed.data.draftIds,
    });
    if (error) throw error;
    return { rejectedCount: Number(asRecord(data).rejectedCount ?? 0) };
  }

  /**
   * Stores one image in the private bucket. Deduplicated per account by checksum, so re-uploading
   * the same picture does not consume quota twice.
   */
  async uploadMedia(userId: string, rawCommand: unknown): Promise<StudyMedia> {
    const parsed = studyMediaUploadSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That image upload is invalid.");

    let validated;
    try {
      validated = await validateStudyMedia(parsed.data.data);
    } catch (cause: unknown) {
      throw invalidInput(cause instanceof StudyMediaError ? cause.message : "That image could not be read.");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("study_media")
      .select("id, mime_type, byte_size, width, height, alt_text, created_at")
      .eq("user_id", userId)
      .eq("checksum", validated.checksum)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return {
        id: existing.id as string,
        mimeType: existing.mime_type as StudyMedia["mimeType"],
        byteSize: existing.byte_size as number,
        width: (existing.width as number | null) ?? null,
        height: (existing.height as number | null) ?? null,
        altText: existing.alt_text as string,
        createdAt: existing.created_at as string,
      };
    }

    const mediaId = crypto.randomUUID();
    const extension = validated.mimeType.split("/")[1];
    const storagePath = `${userId}/${mediaId}.${extension}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("study-media")
      .upload(storagePath, validated.bytes, {
        contentType: validated.mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabaseAdmin.from("study_media").insert({
      id: mediaId,
      user_id: userId,
      storage_path: storagePath,
      mime_type: validated.mimeType,
      byte_size: validated.bytes.byteLength,
      checksum: validated.checksum,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      alt_text: parsed.data.altText,
    });
    if (insertError) {
      // Leaving an orphan object behind would consume quota no record accounts for.
      await supabaseAdmin.storage.from("study-media").remove([storagePath]);
      throw insertError;
    }

    return {
      id: mediaId,
      mimeType: validated.mimeType,
      byteSize: validated.bytes.byteLength,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      altText: parsed.data.altText,
      createdAt: new Date().toISOString(),
    };
  }

  /** Short-lived signed URL. Media is never public, and the link is not durable. */
  async createMediaUrl(userId: string, mediaId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("study_media")
      .select("storage_path")
      .eq("id", mediaId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new StudyServiceError("STUDY_NOT_FOUND", "That image was not found.", 404);

    const signed = await supabaseAdmin.storage
      .from("study-media")
      .createSignedUrl(data.storage_path as string, 300);
    if (signed.error || !signed.data) throw signed.error ?? new Error("Failed to sign Study media URL");
    return signed.data.signedUrl;
  }
}
