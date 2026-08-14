import { createFileRoute } from "@tanstack/react-router";

import { internalErrorResponse } from "../../../../lib/api-response";
import { crossOriginMutationResponse } from "../../../../lib/csrf";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJsonBody, requestBodyErrorResponse } from "../../../../lib/request-body";
import { readStartSession } from "../../../../lib/start-session";
import {
  createFlashcard,
  reviewFlashcard,
  type FlashcardReviewRating,
  type FlashcardSet,
} from "../../../../lib/study";
import { StudyServiceError } from "../../../../lib/study/errors";
import {
  getUserFlashcardSnapshot,
  saveUserFlashcardSets,
} from "../../../../lib/study-server";
import { supabaseAdmin } from "../../../../lib/supabase";

const noStoreHeaders = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie",
};
const RATINGS = new Set<FlashcardReviewRating>(["again", "hard", "good", "easy"]);

function sessionUser(request: Request): string | null {
  const session = readStartSession(request);
  return session.loggedIn && session.userId ? session.userId : null;
}

function text(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function studyErrorResponse(error: unknown): Response | null {
  if (!(error instanceof StudyServiceError)) return null;
  return Response.json({
    message: error.message,
    error: { code: error.code, retryable: error.status >= 500 },
  }, { status: error.status, headers: noStoreHeaders });
}

async function trialResult(userId: string) {
  const { data } = await supabaseAdmin
    .from("study_trial_uses")
    .select("status, result, used_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.status === "completed"
    ? { result: data.result, usedAt: data.used_at }
    : null;
}

async function saveSnapshot(userId: string, sets: FlashcardSet[], revision: number): Promise<Response> {
  const saved = await saveUserFlashcardSets(userId, sets, revision);
  return Response.json({ sets: saved.sets, revision: saved.revision }, { headers: noStoreHeaders });
}

export const Route = createFileRoute("/api/study/flashcards")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = sessionUser(request);
        if (!userId) return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        const limit = await consumeRateLimit("study-legacy-read", userId, 60, 60);
        if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
        try {
          const [snapshot, trial] = await Promise.all([getUserFlashcardSnapshot(userId), trialResult(userId)]);
          return Response.json({ sets: snapshot.sets, revision: snapshot.revision, trial }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          return internalErrorResponse("Flashcards load failed", "Failed to load flashcards", error, noStoreHeaders);
        }
      },
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const userId = sessionUser(request);
        if (!userId) return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        const limit = await consumeRateLimit("study-legacy-write", userId, 30, 5 * 60);
        if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
        try {
          const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
          const snapshot = await getUserFlashcardSnapshot(userId);
          let nextSets: FlashcardSet[];

          if (body.action === "create-set") {
            const title = text(body.title, 120);
            if (!title) return Response.json({ message: "A set title is required." }, { status: 400, headers: noStoreHeaders });
            if (snapshot.sets.length >= 60) return Response.json({ message: "Set limit reached." }, { status: 422, headers: noStoreHeaders });
            const now = new Date().toISOString();
            nextSets = [{
              id: crypto.randomUUID(),
              title,
              description: text(body.description, 500),
              pinned: false,
              createdAt: now,
              updatedAt: now,
              cards: [],
            }, ...snapshot.sets];
          } else if (body.action === "create-card") {
            const front = text(body.front, 2_000);
            const back = text(body.back, 4_000);
            const target = snapshot.sets.find((entry) => entry.id === body.setId);
            if (!target) return Response.json({ message: "Flashcard set not found." }, { status: 404, headers: noStoreHeaders });
            if (!front || !back) return Response.json({ message: "Question and answer are required." }, { status: 400, headers: noStoreHeaders });
            if (target.cards.length >= 500) return Response.json({ message: "Card limit reached for this set." }, { status: 422, headers: noStoreHeaders });
            const updatedAt = new Date().toISOString();
            nextSets = snapshot.sets.map((set) => set.id === target.id
              ? { ...set, updatedAt, cards: [...set.cards, createFlashcard(front, back)] }
              : set);
          } else {
            return Response.json({ message: "Invalid flashcard action." }, { status: 400, headers: noStoreHeaders });
          }

          return await saveSnapshot(userId, nextSets, snapshot.revision);
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const studyError = studyErrorResponse(error);
          if (studyError) return studyError;
          return internalErrorResponse("Flashcard creation failed", "Failed to save flashcard", error, noStoreHeaders);
        }
      },
      PUT: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const userId = sessionUser(request);
        if (!userId) return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        const limit = await consumeRateLimit("study-legacy-write", userId, 30, 5 * 60);
        if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
        try {
          const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
          const snapshot = await getUserFlashcardSnapshot(userId);
          const target = snapshot.sets.find((entry) => entry.id === body.setId);
          if (!target) return Response.json({ message: "Flashcard set not found." }, { status: 404, headers: noStoreHeaders });

          let updatedSet: FlashcardSet;
          if (body.action === "review-card") {
            const rating = body.rating as FlashcardReviewRating;
            const card = target.cards.find((entry) => entry.id === body.cardId);
            if (!card) return Response.json({ message: "Flashcard not found." }, { status: 404, headers: noStoreHeaders });
            if (!RATINGS.has(rating)) return Response.json({ message: "Invalid review rating." }, { status: 400, headers: noStoreHeaders });
            updatedSet = {
              ...target,
              cards: target.cards.map((entry) => entry.id === card.id ? reviewFlashcard(entry, rating) : entry),
            };
          } else if (body.action === "update-set") {
            const title = text(body.title, 120);
            if (!title) return Response.json({ message: "A set title is required." }, { status: 400, headers: noStoreHeaders });
            updatedSet = { ...target, title, description: text(body.description, 500) };
          } else if (body.action === "pin-set") {
            updatedSet = { ...target, pinned: body.pinned === true };
          } else if (body.action === "update-card") {
            const front = text(body.front, 2_000);
            const back = text(body.back, 4_000);
            const card = target.cards.find((entry) => entry.id === body.cardId);
            if (!card) return Response.json({ message: "Flashcard not found." }, { status: 404, headers: noStoreHeaders });
            if (!front || !back) return Response.json({ message: "Question and answer are required." }, { status: 400, headers: noStoreHeaders });
            updatedSet = {
              ...target,
              cards: target.cards.map((entry) => entry.id === card.id ? { ...entry, front, back } : entry),
            };
          } else {
            return Response.json({ message: "Invalid flashcard action." }, { status: 400, headers: noStoreHeaders });
          }

          const updatedAt = new Date().toISOString();
          const nextSets = snapshot.sets.map((set) => set.id === target.id ? { ...updatedSet, updatedAt } : set);
          return await saveSnapshot(userId, nextSets, snapshot.revision);
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const studyError = studyErrorResponse(error);
          if (studyError) return studyError;
          return internalErrorResponse("Flashcard update failed", "Failed to update flashcard", error, noStoreHeaders);
        }
      },
      DELETE: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) return crossOrigin;
        const userId = sessionUser(request);
        if (!userId) return Response.json({ message: "Not authenticated" }, { status: 401, headers: noStoreHeaders });
        const limit = await consumeRateLimit("study-legacy-delete", userId, 20, 5 * 60);
        if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders);
        try {
          const body = await readJsonBody<Record<string, unknown>>(request, 8 * 1024);
          const snapshot = await getUserFlashcardSnapshot(userId);
          let nextSets: FlashcardSet[];
          if (body.cardId) {
            const target = snapshot.sets.find((entry) => entry.id === body.setId);
            if (!target) return Response.json({ message: "Flashcard set not found." }, { status: 404, headers: noStoreHeaders });
            if (!target.cards.some((card) => card.id === body.cardId)) {
              return Response.json({ message: "Flashcard not found." }, { status: 404, headers: noStoreHeaders });
            }
            const updatedAt = new Date().toISOString();
            nextSets = snapshot.sets.map((set) => set.id === target.id
              ? { ...set, updatedAt, cards: set.cards.filter((card) => card.id !== body.cardId) }
              : set);
          } else {
            nextSets = snapshot.sets.filter((set) => set.id !== body.setId);
          }
          return await saveSnapshot(userId, nextSets, snapshot.revision);
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          const studyError = studyErrorResponse(error);
          if (studyError) return studyError;
          return internalErrorResponse("Flashcard deletion failed", "Failed to delete flashcard", error, noStoreHeaders);
        }
      },
    },
  },
});
