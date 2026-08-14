export type FlashcardReviewRating = "again" | "hard" | "good" | "easy";

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: string;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
}

export interface FlashcardSet {
  id: string;
  title: string;
  description: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  cards: Flashcard[];
}

const MAX_SETS = 60;
const MAX_CARDS_PER_SET = 500;
const DAY_MS = 86_400_000;

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeDate(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function safeNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function createFlashcard(front: string, back: string, now = new Date()): Flashcard {
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    front: safeText(front, 2_000),
    back: safeText(back, 4_000),
    createdAt: timestamp,
    dueAt: timestamp,
    intervalDays: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
    lastReviewedAt: null,
  };
}

export function normalizeFlashcardSets(value: unknown): FlashcardSet[] {
  if (!Array.isArray(value)) return [];
  const now = new Date().toISOString();

  return value.slice(0, MAX_SETS).flatMap((raw): FlashcardSet[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const title = safeText(row.title, 120);
    if (!title) return [];

    const cards = Array.isArray(row.cards)
      ? row.cards.slice(0, MAX_CARDS_PER_SET).flatMap((rawCard): Flashcard[] => {
        if (!rawCard || typeof rawCard !== "object") return [];
        const card = rawCard as Record<string, unknown>;
        const front = safeText(card.front, 2_000);
        const back = safeText(card.back, 4_000);
        if (!front || !back) return [];
        return [{
          id: safeText(card.id, 100) || crypto.randomUUID(),
          front,
          back,
          createdAt: safeDate(card.createdAt, now),
          dueAt: safeDate(card.dueAt, now),
          intervalDays: safeNumber(card.intervalDays, 0, 0, 36_500),
          easeFactor: safeNumber(card.easeFactor, 2.5, 1.3, 3.5),
          repetitions: Math.round(safeNumber(card.repetitions, 0, 0, 100_000)),
          lapses: Math.round(safeNumber(card.lapses, 0, 0, 100_000)),
          lastReviewedAt: card.lastReviewedAt
            ? safeDate(card.lastReviewedAt, now)
            : null,
        }];
      })
      : [];

    return [{
      id: safeText(row.id, 100) || crypto.randomUUID(),
      title,
      description: safeText(row.description, 500),
      pinned: row.pinned === true,
      createdAt: safeDate(row.createdAt, now),
      updatedAt: safeDate(row.updatedAt, now),
      cards,
    }];
  });
}

export function reviewFlashcard(
  card: Flashcard,
  rating: FlashcardReviewRating,
  now = new Date(),
): Flashcard {
  let intervalDays = card.intervalDays;
  let easeFactor = card.easeFactor;
  let repetitions = card.repetitions;
  let lapses = card.lapses;
  let dueAt: Date;

  if (rating === "again") {
    intervalDays = 0;
    repetitions = 0;
    lapses += 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    dueAt = new Date(now.getTime() + 10 * 60_000);
  } else if (rating === "hard") {
    intervalDays = Math.max(1, Math.round((intervalDays || 1) * 1.2));
    repetitions += 1;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
    dueAt = new Date(now.getTime() + intervalDays * DAY_MS);
  } else if (rating === "good") {
    intervalDays = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.max(1, Math.round(intervalDays * easeFactor));
    repetitions += 1;
    dueAt = new Date(now.getTime() + intervalDays * DAY_MS);
  } else {
    easeFactor = Math.min(3.5, easeFactor + 0.15);
    intervalDays = repetitions === 0 ? 4 : Math.max(4, Math.round((intervalDays || 1) * easeFactor));
    repetitions += 1;
    dueAt = new Date(now.getTime() + intervalDays * DAY_MS);
  }

  return {
    ...card,
    dueAt: dueAt.toISOString(),
    intervalDays,
    easeFactor,
    repetitions,
    lapses,
    lastReviewedAt: now.toISOString(),
  };
}

export function countDueFlashcards(sets: FlashcardSet[], now = new Date()) {
  const current = now.getTime();
  return sets.reduce(
    (total, set) => total + set.cards.filter((card) => new Date(card.dueAt).getTime() <= current).length,
    0,
  );
}
