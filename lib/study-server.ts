import { StudyServiceError } from "./study/errors";
import { normalizeFlashcardSets, type FlashcardSet } from "./study";
import { supabaseAdmin } from "./supabase";

export interface FlashcardSetSnapshot {
  sets: FlashcardSet[];
  revision: number;
}

function validateCompatibilityLimits(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new StudyServiceError("STUDY_INVALID_INPUT", "Flashcard sets must be an array.", 400);
  }
  if (value.length > 60) {
    throw new StudyServiceError("STUDY_LIMIT_REACHED", "Flashcard set limit reached.", 422);
  }
  for (const rawSet of value) {
    if (!rawSet || typeof rawSet !== "object") continue;
    const cards = (rawSet as Record<string, unknown>).cards;
    if (Array.isArray(cards) && cards.length > 500) {
      throw new StudyServiceError("STUDY_LIMIT_REACHED", "Card limit reached for a flashcard set.", 422);
    }
  }
}

export async function getUserFlashcardSnapshot(userId: string): Promise<FlashcardSetSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("flashcard_sets, flashcard_sets_revision")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    sets: normalizeFlashcardSets(data?.flashcard_sets),
    revision: Math.max(0, Number(data?.flashcard_sets_revision) || 0),
  };
}

export async function getUserFlashcardSets(userId: string): Promise<FlashcardSet[]> {
  return (await getUserFlashcardSnapshot(userId)).sets;
}

export async function saveUserFlashcardSets(
  userId: string,
  value: unknown,
  expectedRevision: number,
): Promise<FlashcardSetSnapshot> {
  validateCompatibilityLimits(value);
  const flashcardSets = normalizeFlashcardSets(value);
  const { data, error } = await supabaseAdmin.rpc("save_legacy_flashcard_sets_v1", {
    p_user_id: userId,
    p_expected_revision: expectedRevision,
    p_sets: flashcardSets,
  });
  if (error) throw error;
  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  if (result?.status === "conflict") {
    throw new StudyServiceError(
      "STUDY_CONFLICT",
      "Flashcards changed on another device. Refresh and try again.",
      409,
    );
  }
  if (result?.status === "client-upgrade-required") {
    throw new StudyServiceError(
      "STUDY_CLIENT_UPGRADE_REQUIRED",
      "This Study library requires the latest client.",
      409,
    );
  }
  if (result?.status === "not-found") {
    throw new StudyServiceError("STUDY_NOT_FOUND", "Study account was not found.", 404);
  }
  if (result?.status !== "accepted") {
    throw new Error("Invalid legacy Study save result");
  }
  return {
    sets: normalizeFlashcardSets(result.sets),
    revision: Math.max(0, Number(result.revision) || 0),
  };
}
