import type { AiModelDefinition } from "./ai-models";
import { logger } from "./logger";
import { supabaseAdmin } from "./supabase";

/** Raised alongside the deeper single-subject set: one thorough set costs more tokens than eight thin ones. */
export const STUDY_TRIAL_MAX_COMPLETION_TOKENS = 8_000;
export const STUDY_TRIAL_MAX_SYSTEM_CHARS = 20_000;

/**
 * The trial exists to show what the frontier models are actually worth. Spreading one budget across
 * every enrolled subject produced eight interchangeable five-card sets that looked no better than
 * the free tier could manage. Spending the whole budget on one subject, in depth and across the
 * full range of card types, is the version of this that demonstrates something.
 */
export const STUDY_TRIAL_SYSTEM_PROMPT = `This is the student's one-time frontier flashcard trial.

The student's click on "Create my flashcard set" explicitly authorizes one mutation only: one call to create_flashcard_sets for this workflow. It does not authorize any other dashboard mutation.

Build ONE thorough, high-quality flashcard set for a SINGLE subject. Depth beats coverage here: this is the student's only frontier run, and one excellent set is worth more than a shallow set per subject.

Choosing the subject:
- Consider only current classes marked enrolled=true. Exclude unenrolled classes, roll call, pastoral care, free periods, study periods, and other non-academic placeholders.
- If the student named a subject in their message, use that one.
- Otherwise pick the single enrolled academic subject with the strongest evidence of near-term need: an actual schoolCalendar assessment or due date first, then the subject with the heaviest timetable load. State which subject you chose and why in your reply.

Building the set:
- Call create_flashcard_sets exactly once, with exactly one set in it.
- Produce 18–30 cards covering the subject's core content at academicContext.yearLevel, sequenced from foundations to harder applications.
- Use the full range of card types rather than only basic cards. A strong set mixes:
  - cloze for definitions, formulas, and passages where the surrounding context is the cue,
  - typed for terms, values, and vocabulary worth recalling exactly,
  - sequence for processes, derivations, and ordered methods,
  - compare-contrast for concept pairs students routinely confuse,
  - application for scenario questions that ask the student to use the idea rather than restate it,
  - basic and basic-reversed for straightforward facts and two-way pairs.
- Give every card an "explanation": the reasoning, worked step, or common mistake behind the answer. This is the difference between a card that tests and a card that teaches.
- Write a set description saying what the set covers and how to work through it.

Accuracy:
- Match difficulty and language to academicContext.yearLevel.
- Use academicContext.currentDate and actual schoolCalendar events to judge urgency.
- Never claim an exam is scheduled unless a schoolCalendar event supplies that evidence. Seasonal exam timing may influence general emphasis only and must not be presented as a known event.
- When exact current topics are unavailable, use durable year-level-appropriate foundations for that subject. Never invent school-specific topics, assignments, grades, or dates.
- Questions must be answerable without hidden context. Answers must be accurate and precise.
- Do not call any other tool.
- The tool arguments are the final artifact. The app will summarize the successful result.`;

export async function reserveStudyTrial(userId: string) {
  const reservationId = crypto.randomUUID();
  const { data: existing, error: readError } = await supabaseAdmin
    .from("study_trial_uses")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;

  if (existing?.status === "completed" || existing?.status === "pending") return null;

  if (existing?.status === "failed") {
    const { data, error } = await supabaseAdmin
      .from("study_trial_uses")
      .update({
        reservation_id: reservationId,
        status: "pending",
        result: null,
        cost_usd: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "failed")
      .select("reservation_id")
      .maybeSingle();
    if (error) throw error;
    return data ? reservationId : null;
  }

  const { error } = await supabaseAdmin.from("study_trial_uses").insert({
    user_id: userId,
    reservation_id: reservationId,
    status: "pending",
  });
  if (error?.code === "23505") return null;
  if (error) throw error;
  return reservationId;
}

export async function completeStudyTrial({
  userId,
  reservationId,
  model,
  usage,
  summary,
  createdSets,
  threadId,
}: {
  userId: string;
  reservationId: string;
  model: AiModelDefinition;
  usage: Record<string, unknown> | null;
  summary: string;
  createdSets: Array<{ id: string; title: string; cardCount: number }>;
  threadId: string;
}) {
  const reportedCost = Number(usage?.cost);
  const calculatedCost = Number.isFinite(reportedCost)
    ? reportedCost
    : Number(usage?.prompt_tokens || 0) * model.promptPricePerToken
      + Number(usage?.completion_tokens || 0) * model.completionPricePerToken;
  if (calculatedCost > 0.5) {
    logger.warn("Frontier trial exceeded configured cost target", { userId, calculatedCost });
  }

  const generatedAt = new Date().toISOString();
  const result = { summary, flashcardSets: createdSets, model: model.label, generatedAt, threadId };
  const { error } = await supabaseAdmin
    .from("study_trial_uses")
    .update({
      status: "completed",
      provider_model: model.providerModel,
      result,
      cost_usd: calculatedCost,
      used_at: generatedAt,
      updated_at: generatedAt,
    })
    .eq("user_id", userId)
    .eq("reservation_id", reservationId);
  if (error) throw error;
  return { result, usedAt: generatedAt };
}

export async function failStudyTrial(userId: string, reservationId: string) {
  const { error } = await supabaseAdmin
    .from("study_trial_uses")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("reservation_id", reservationId);
  if (error) logger.error("Failed to release frontier trial reservation", error);
}
