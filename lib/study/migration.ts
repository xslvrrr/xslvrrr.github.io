import { createHash } from "node:crypto";

import type { StudyCard, StudyDeck, StudyNote } from "./domain";

const MAX_SETS = 60;
const MAX_CARDS_PER_SET = 500;

interface LegacyCardValue {
  sourceKey: string;
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

interface LegacySetValue {
  sourceKey: string;
  title: string;
  description: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  cards: LegacyCardValue[];
}

export interface StudyMigrationEventPlan {
  id: string;
  userId: string;
  cardId: string;
  eventKind: "migration";
  reviewedAt: string;
  receivedAt: string;
  afterState: Pick<
    StudyCard,
    | "state"
    | "dueAt"
    | "stability"
    | "difficulty"
    | "elapsedDays"
    | "scheduledDays"
    | "learningSteps"
    | "repetitions"
    | "lapses"
    | "lastReviewedAt"
  >;
  schedulerName: "legacy-sm2-v1";
  schedulerVersion: "1";
  parametersVersion: "legacy";
}

export interface StudyMigrationSourceInspection {
  canUseBoundedMigration: boolean;
  errorCode: "STAGED_MIGRATION_REQUIRED" | "INVALID_LEGACY_SOURCE" | null;
  totalCards: number;
  serializedBytes: number;
}

export interface StudyMigrationPlan {
  userId: string;
  legacyDigest: string;
  decks: StudyDeck[];
  notes: StudyNote[];
  cards: StudyCard[];
  events: StudyMigrationEventPlan[];
  counts: {
    decks: number;
    notes: number;
    cards: number;
    events: number;
  };
}

function safeText(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function safeDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function safeNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function stableUuid(scope: string): string {
  const characters = createHash("sha256").update(`millennium-study\0${scope}`, "utf8").digest("hex").slice(0, 32).split("");
  characters[12] = "5";
  characters[16] = ((Number.parseInt(characters[16], 16) & 0x3) | 0x8).toString(16);
  const value = characters.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => ({
      ...result,
      [key]: canonicalize((value as Record<string, unknown>)[key]),
    }), {});
}

function legacyDigest(value: LegacySetValue[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function isValidOptionalDate(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isValidOptionalNumber(value: unknown, minimum: number, maximum: number): boolean {
  if (value === undefined || value === null || value === "") return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum;
}

export function inspectLegacyStudyMigrationSource(value: unknown): StudyMigrationSourceInspection {
  const serializedBytes = new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
  if (!Array.isArray(value)) {
    return { canUseBoundedMigration: false, errorCode: "INVALID_LEGACY_SOURCE", totalCards: 0, serializedBytes };
  }
  if (value.length > MAX_SETS || serializedBytes > 4 * 1024 * 1024) {
    return { canUseBoundedMigration: false, errorCode: "STAGED_MIGRATION_REQUIRED", totalCards: 0, serializedBytes };
  }

  let totalCards = 0;
  for (const rawSet of value) {
    if (!rawSet || typeof rawSet !== "object" || Array.isArray(rawSet)) {
      return { canUseBoundedMigration: false, errorCode: "INVALID_LEGACY_SOURCE", totalCards, serializedBytes };
    }
    const set = rawSet as Record<string, unknown>;
    if (
      typeof set.title !== "string"
      || set.title.trim().length < 1
      || set.title.trim().length > 120
      || (set.description !== undefined && (typeof set.description !== "string" || set.description.trim().length > 500))
      || !isValidOptionalDate(set.createdAt)
      || !isValidOptionalDate(set.updatedAt)
      || (set.id !== undefined && (typeof set.id !== "string" || set.id.trim().length > 100))
    ) {
      return { canUseBoundedMigration: false, errorCode: "INVALID_LEGACY_SOURCE", totalCards, serializedBytes };
    }
    if (set.cards !== undefined && !Array.isArray(set.cards)) {
      return { canUseBoundedMigration: false, errorCode: "INVALID_LEGACY_SOURCE", totalCards, serializedBytes };
    }
    const cards = Array.isArray(set.cards) ? set.cards : [];
    if (cards.length > MAX_CARDS_PER_SET) {
      return { canUseBoundedMigration: false, errorCode: "STAGED_MIGRATION_REQUIRED", totalCards, serializedBytes };
    }
    totalCards += cards.length;
    if (totalCards > 500) {
      return { canUseBoundedMigration: false, errorCode: "STAGED_MIGRATION_REQUIRED", totalCards, serializedBytes };
    }

    for (const rawCard of cards) {
      if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) {
        return { canUseBoundedMigration: false, errorCode: "INVALID_LEGACY_SOURCE", totalCards, serializedBytes };
      }
      const card = rawCard as Record<string, unknown>;
      if (
        typeof card.front !== "string"
        || card.front.trim().length < 1
        || card.front.trim().length > 2_000
        || typeof card.back !== "string"
        || card.back.trim().length < 1
        || card.back.trim().length > 4_000
        || (card.id !== undefined && (typeof card.id !== "string" || card.id.trim().length > 100))
        || !isValidOptionalDate(card.createdAt)
        || !isValidOptionalDate(card.dueAt)
        || !isValidOptionalDate(card.lastReviewedAt)
        || !isValidOptionalNumber(card.intervalDays, 0, 36_500)
        || !isValidOptionalNumber(card.easeFactor, 1.3, 3.5)
        || !isValidOptionalNumber(card.repetitions, 0, 100_000)
        || !isValidOptionalNumber(card.lapses, 0, 100_000)
      ) {
        return { canUseBoundedMigration: false, errorCode: "INVALID_LEGACY_SOURCE", totalCards, serializedBytes };
      }
    }
  }

  return { canUseBoundedMigration: true, errorCode: null, totalCards, serializedBytes };
}

function normalizeLegacySets(value: unknown, fallbackTimestamp: string): LegacySetValue[] {
  if (!Array.isArray(value)) return [];
  const seenSetIds = new Set<string>();

  return value.slice(0, MAX_SETS).flatMap((rawSet, setIndex): LegacySetValue[] => {
    if (!rawSet || typeof rawSet !== "object") return [];
    const row = rawSet as Record<string, unknown>;
    const title = safeText(row.title, 120);
    if (!title) return [];

    const candidateSetId = safeText(row.id, 100);
    const hasUniqueSetId = Boolean(candidateSetId) && !seenSetIds.has(candidateSetId);
    if (candidateSetId) seenSetIds.add(candidateSetId);
    const sourceKey = hasUniqueSetId ? `id:${candidateSetId}` : `ordinal:${setIndex}`;
    const seenCardIds = new Set<string>();

    const cards = Array.isArray(row.cards)
      ? row.cards.slice(0, MAX_CARDS_PER_SET).flatMap((rawCard, cardIndex): LegacyCardValue[] => {
        if (!rawCard || typeof rawCard !== "object") return [];
        const card = rawCard as Record<string, unknown>;
        const front = safeText(card.front, 2_000);
        const back = safeText(card.back, 4_000);
        if (!front || !back) return [];

        const candidateCardId = safeText(card.id, 100);
        const hasUniqueCardId = Boolean(candidateCardId) && !seenCardIds.has(candidateCardId);
        if (candidateCardId) seenCardIds.add(candidateCardId);

        return [{
          sourceKey: hasUniqueCardId ? `id:${candidateCardId}` : `ordinal:${cardIndex}`,
          front,
          back,
          createdAt: safeDate(card.createdAt, fallbackTimestamp),
          dueAt: safeDate(card.dueAt, fallbackTimestamp),
          intervalDays: safeNumber(card.intervalDays, 0, 0, 36_500),
          easeFactor: safeNumber(card.easeFactor, 2.5, 1.3, 3.5),
          repetitions: Math.round(safeNumber(card.repetitions, 0, 0, 100_000)),
          lapses: Math.round(safeNumber(card.lapses, 0, 0, 100_000)),
          lastReviewedAt: card.lastReviewedAt
            ? safeDate(card.lastReviewedAt, fallbackTimestamp)
            : null,
        }];
      })
      : [];

    return [{
      sourceKey,
      title,
      description: safeText(row.description, 500),
      pinned: row.pinned === true,
      createdAt: safeDate(row.createdAt, fallbackTimestamp),
      updatedAt: safeDate(row.updatedAt, fallbackTimestamp),
      cards,
    }];
  });
}

export function planLegacyStudyMigration(
  userId: string,
  value: unknown,
  now = new Date(),
): StudyMigrationPlan {
  const timestamp = now.toISOString();
  const legacySets = normalizeLegacySets(value, timestamp);
  const decks: StudyDeck[] = [];
  const notes: StudyNote[] = [];
  const cards: StudyCard[] = [];
  const events: StudyMigrationEventPlan[] = [];

  legacySets.forEach((legacySet, setIndex) => {
    const deckId = stableUuid(`${userId}\0deck\0${legacySet.sourceKey}`);
    decks.push({
      id: deckId,
      userId,
      parentDeckId: null,
      title: legacySet.title,
      description: legacySet.description,
      pinned: legacySet.pinned,
      sortOrder: setIndex,
      revision: 1,
      cardCount: legacySet.cards.length,
      dueCount: legacySet.cards.filter((card) => new Date(card.dueAt).getTime() <= now.getTime()).length,
      newCount: legacySet.cards.filter((card) => card.repetitions === 0).length,
      archivedAt: null,
      createdAt: legacySet.createdAt,
      updatedAt: legacySet.updatedAt,
      deletedAt: null,
    });

    legacySet.cards.forEach((legacyCard, cardIndex) => {
      const noteId = stableUuid(`${userId}\0note\0${legacySet.sourceKey}\0${legacyCard.sourceKey}`);
      const cardId = stableUuid(`${userId}\0card\0${legacySet.sourceKey}\0${legacyCard.sourceKey}\0forward`);
      const eventId = stableUuid(`${userId}\0migration-event\0${cardId}`);
      const state = legacyCard.repetitions === 0 ? "new" : "review";
      const schedulingState = {
        state,
        dueAt: legacyCard.dueAt,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: legacyCard.intervalDays,
        learningSteps: 0,
        repetitions: legacyCard.repetitions,
        lapses: legacyCard.lapses,
        lastReviewedAt: legacyCard.lastReviewedAt,
      } as const;

      notes.push({
        id: noteId,
        userId,
        deckId,
        noteType: "basic",
        schemaVersion: 1,
        fields: {
          prompt: legacyCard.front,
          answer: legacyCard.back,
        },
        tags: [],
        sourceKind: "legacy-jsonb",
        revision: 1,
        createdAt: legacyCard.createdAt,
        updatedAt: legacySet.updatedAt,
        deletedAt: null,
      });

      cards.push({
        id: cardId,
        userId,
        deckId,
        noteId,
        templateKey: "forward",
        ordinal: cardIndex,
        isSuspended: false,
        isBuried: false,
        ...schedulingState,
        schedulerName: "legacy-sm2-v1",
        schedulerVersion: "1",
        parametersVersion: "legacy",
        schedulerMetadata: {
          legacyIntervalDays: legacyCard.intervalDays,
          legacyEaseFactor: legacyCard.easeFactor,
          legacyCardKey: legacyCard.sourceKey,
        },
        scheduleRevision: 0,
        createdAt: legacyCard.createdAt,
        updatedAt: legacySet.updatedAt,
        deletedAt: null,
      });

      events.push({
        id: eventId,
        userId,
        cardId,
        eventKind: "migration",
        reviewedAt: timestamp,
        receivedAt: timestamp,
        afterState: schedulingState,
        schedulerName: "legacy-sm2-v1",
        schedulerVersion: "1",
        parametersVersion: "legacy",
      });
    });
  });

  return {
    userId,
    legacyDigest: legacyDigest(legacySets),
    decks,
    notes,
    cards,
    events,
    counts: {
      decks: decks.length,
      notes: notes.length,
      cards: cards.length,
      events: events.length,
    },
  };
}
