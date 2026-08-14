import { supabaseAdmin } from "../supabase";
import { StudyServiceError } from "./errors";
import {
  parseStudyExamCoverage,
  parseStudyExamPlan,
  studyExamPlanCommandSchema,
  type StudyExamCoverage,
  type StudyExamPlan,
} from "./exam-plans";
import { deriveStudyCardTemplates, isAuthorableNoteType, parseStudyNoteFields } from "./note-types";
import type { StudyRepository } from "./repository";
import { FsrsStudyScheduler } from "./scheduler";
import {
  createStudyShareCode,
  parseStudyPublication,
  studyPublishCommandSchema,
  studyPublishedNoteSchema,
  studyRevokeCommandSchema,
  studySubscribeCommandSchema,
  type StudyPublication,
  type StudySubscriptionResult,
} from "./sharing";

function invalidInput(message: string): StudyServiceError {
  return new StudyServiceError("STUDY_INVALID_INPUT", message, 400);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface StudyPublishResult {
  publicationId: string;
  shareCode: string;
  version: number;
  noteCount: number;
}

/**
 * Exam plans and deck sharing. Shared decks carry content only: a subscriber gets their own notes,
 * their own cards, and their own schedule, and an update adds material without touching it.
 */
export class StudyPlanningService {
  constructor(private readonly repository: StudyRepository) {}

  async listExamPlans(userId: string): Promise<StudyExamPlan[]> {
    const { data, error } = await supabaseAdmin
      .from("study_exam_plans")
      .select("id, title, exam_date, deck_ids, daily_minutes, target_retention, status, revision, updated_at")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("exam_date", { ascending: true })
      .limit(20);
    if (error) throw error;

    return (data ?? []).map((row) => parseStudyExamPlan({
      id: row.id,
      title: row.title,
      examDate: row.exam_date,
      deckIds: row.deck_ids ?? [],
      dailyMinutes: row.daily_minutes,
      targetRetention: row.target_retention,
      status: row.status,
      revision: row.revision,
      updatedAt: row.updated_at,
    }));
  }

  async saveExamPlan(userId: string, rawCommand: unknown): Promise<StudyExamPlan> {
    const parsed = studyExamPlanCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That exam plan is invalid.");
    const command = parsed.data;

    const { data, error } = await supabaseAdmin.rpc("save_study_exam_plan_v1", {
      p_user_id: userId,
      p_plan_id: command.planId,
      p_title: command.title,
      p_exam_date: command.examDate,
      p_deck_ids: command.deckIds,
      p_daily_minutes: command.dailyMinutes,
      p_target_retention: command.targetRetention,
      p_expected_revision: command.expectedRevision ?? null,
    });
    if (error) throw error;

    const result = asRecord(data);
    if (result.status === "deck-not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "One of those sets was not found.", 404);
    }
    if (result.status === "not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "That exam plan was not found.", 404);
    }
    if (result.status === "conflict") {
      throw new StudyServiceError(
        "STUDY_CONFLICT",
        "This plan changed on another device. Refresh before saving again.",
        409,
      );
    }
    if (result.status === "limit-reached") {
      throw new StudyServiceError("STUDY_LIMIT_REACHED", "You already have 20 active exam plans.", 422);
    }
    return parseStudyExamPlan(result.plan);
  }

  async getExamCoverage(userId: string, deckIds: string[]): Promise<StudyExamCoverage> {
    const { data, error } = await supabaseAdmin.rpc("get_study_exam_coverage_v1", {
      p_user_id: userId,
      p_deck_ids: deckIds,
    });
    if (error) throw error;
    return parseStudyExamCoverage(data);
  }

  /**
   * Active publications only. A revoked link cannot be copied, re-shared, or un-revoked, so
   * listing it forever left the owner with a growing column of dead rows they could not clear;
   * the row itself is kept so an existing subscriber still resolves to a revoked answer.
   */
  async listPublications(userId: string): Promise<StudyPublication[]> {
    const { data, error } = await supabaseAdmin
      .from("study_deck_publications")
      .select("id, deck_id, title, description, share_code, current_version, revoked_at, updated_at")
      .eq("owner_id", userId)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    return (data ?? []).map((row) => parseStudyPublication({
      id: row.id,
      deckId: row.deck_id,
      title: row.title,
      description: row.description,
      shareCode: row.share_code,
      currentVersion: row.current_version,
      revokedAt: row.revoked_at,
      updatedAt: row.updated_at,
    }));
  }

  async publishDeck(userId: string, rawCommand: unknown): Promise<StudyPublishResult> {
    const parsed = studyPublishCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That publish request is invalid.");
    const command = parsed.data;

    const { data, error } = await supabaseAdmin.rpc("publish_study_deck_v1", {
      p_owner_id: userId,
      p_publication_id: command.publicationId ?? crypto.randomUUID(),
      p_deck_id: command.deckId,
      p_share_code: createStudyShareCode(),
      p_changelog: command.changelog,
    });
    if (error) throw error;

    const result = asRecord(data);
    if (result.status === "deck-not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "Flashcard set was not found.", 404);
    }
    if (result.status === "empty") {
      throw invalidInput("There is nothing to share in this set yet.");
    }
    if (result.status === "too-large") {
      throw new StudyServiceError("STUDY_LIMIT_REACHED", "Sets over 500 cards cannot be shared.", 422);
    }
    if (result.status === "revoked") {
      throw new StudyServiceError("STUDY_OPERATION_REJECTED", "This share link was revoked.", 409);
    }

    return {
      publicationId: String(result.publicationId ?? ""),
      shareCode: String(result.shareCode ?? ""),
      version: Number(result.version ?? 1),
      noteCount: Number(result.noteCount ?? 0),
    };
  }

  async revokePublication(userId: string, rawCommand: unknown): Promise<void> {
    const parsed = studyRevokeCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That request is invalid.");

    const { data, error } = await supabaseAdmin.rpc("revoke_study_publication_v1", {
      p_owner_id: userId,
      p_publication_id: parsed.data.publicationId,
    });
    if (error) throw error;
    if (asRecord(data).status === "not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "That share link was not found.", 404);
    }
  }

  /**
   * Copies the published version into the subscriber's own set. Notes they already have from this
   * publication are skipped, so an update never resets a card they have been reviewing.
   */
  async applySubscription(userId: string, rawCommand: unknown): Promise<StudySubscriptionResult> {
    const parsed = studySubscribeCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw invalidInput("That subscription request is invalid.");
    const command = parsed.data;

    const { data: publication, error: publicationError } = await supabaseAdmin
      .from("study_deck_publications")
      .select("id, current_version, revoked_at")
      .eq("share_code", command.shareCode)
      .maybeSingle();
    if (publicationError) throw publicationError;
    if (!publication || publication.revoked_at) {
      throw new StudyServiceError("STUDY_NOT_FOUND", "That share link is not available.", 404);
    }

    const { data: version, error: versionError } = await supabaseAdmin
      .from("study_publication_versions")
      .select("notes")
      .eq("publication_id", publication.id)
      .eq("version", publication.current_version)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!version) throw new StudyServiceError("STUDY_NOT_FOUND", "That shared set has no content.", 404);

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("study_deck_subscriptions")
      .select("note_map")
      .eq("user_id", userId)
      .eq("publication_id", publication.id)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    const known = asRecord(subscription?.note_map ?? {});

    const profile = await this.repository.getDeckSchedulerProfile(userId, command.deckId);
    const scheduler = new FsrsStudyScheduler(profile.parameters);

    const published = Array.isArray(version.notes) ? version.notes : [];
    const notes = published
      .map((entry) => studyPublishedNoteSchema.safeParse(entry))
      .filter((parsedNote) => parsedNote.success)
      .map((parsedNote) => parsedNote.data)
      // Shared content is untrusted: it is validated against the same note schemas as anything else.
      .filter((note) => isAuthorableNoteType(note.noteType) && !(note.key in known))
      .flatMap((note) => {
        let fields: Record<string, unknown>;
        try {
          fields = parseStudyNoteFields(note.noteType as never, note.fields);
        } catch {
          return [];
        }
        const id = crypto.randomUUID();
        return [{
          id,
          key: note.key,
          noteType: note.noteType,
          fields,
          tags: note.tags,
          cards: deriveStudyCardTemplates(note.noteType as never, fields).map((template) => ({
            id: crypto.randomUUID(),
            templateKey: template.templateKey,
            ordinal: template.ordinal,
          })),
        }];
      });

    if (notes.length === 0) {
      return { addedNotes: 0, version: publication.current_version, deckId: command.deckId };
    }

    const { data, error } = await supabaseAdmin.rpc("apply_study_subscription_v1", {
      p_user_id: userId,
      p_share_code: command.shareCode,
      p_deck_id: command.deckId,
      p_notes: notes,
      p_initial_state: scheduler.createState(),
      p_scheduler_name: scheduler.name,
      p_scheduler_version: scheduler.version,
      p_parameters_version: profile.parametersVersion,
    });
    if (error) throw error;

    const result = asRecord(data);
    if (result.status === "not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "That share link is not available.", 404);
    }
    if (result.status === "deck-not-found") {
      throw new StudyServiceError("STUDY_NOT_FOUND", "Flashcard set was not found.", 404);
    }
    if (result.status === "limit-reached") {
      throw new StudyServiceError("STUDY_LIMIT_REACHED", "This set would go over the card limit.", 422);
    }

    return {
      addedNotes: Number(result.addedNotes ?? 0),
      version: Number(result.version ?? publication.current_version),
      deckId: command.deckId,
    };
  }
}
