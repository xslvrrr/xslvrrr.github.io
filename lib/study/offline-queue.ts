import type { StudyBootstrap, StudyDeckSummary, StudyQueueItem } from "./domain";
import type { StudyOfflineLibrary } from "./desktop-sync";

export interface StudyOfflineQueueQuery {
  deckId?: string | null;
  limit: number;
  includeNew: boolean;
  now: Date;
}

/**
 * Mirrors `get_study_review_queue_v1`: due-first, ties broken by card id, suspended and buried
 * cards excluded. Ordering must match the server so a reconnect does not reshuffle the session.
 */
export function buildStudyOfflineQueue(
  library: StudyOfflineLibrary,
  query: StudyOfflineQueueQuery,
): StudyQueueItem[] {
  const decks = new Map(library.decks.map((deck) => [deck.id, deck]));
  const notes = new Map(library.notes.map((note) => [note.id, note]));
  const dueBefore = query.now.getTime();

  return library.cards
    .filter((card) => {
      if (card.deletedAt || card.isSuspended || card.isBuried) return false;
      if (query.deckId && card.deckId !== query.deckId) return false;
      if (!query.includeNew && card.state === "new") return false;
      if (new Date(card.dueAt).getTime() > dueBefore) return false;
      const deck = decks.get(card.deckId);
      return Boolean(deck && !deck.archivedAt && notes.has(card.noteId));
    })
    .sort((left, right) => {
      const difference = new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
      return difference !== 0 ? difference : left.id.localeCompare(right.id);
    })
    .slice(0, query.limit)
    .map((card) => {
      const note = notes.get(card.noteId);
      const deck = decks.get(card.deckId);
      return {
        cardId: card.id,
        noteId: card.noteId,
        deckId: card.deckId,
        deckTitle: deck?.title ?? "",
        templateKey: card.templateKey,
        scheduleRevision: card.scheduleRevision,
        noteRevision: note?.revision ?? 1,
        noteType: note?.noteType ?? "basic",
        fields: note?.fields ?? { prompt: "", answer: "" },
        tags: note?.tags ?? [],
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
      } satisfies StudyQueueItem;
    });
}

/**
 * Bootstrap rebuilt from local data when the server is unreachable. Local Study data only exists
 * after a successful sync, so reaching this path already implies normalized storage and FSRS.
 */
export function buildStudyOfflineBootstrap(
  library: StudyOfflineLibrary,
  now: Date,
): StudyBootstrap {
  const decks = buildStudyOfflineDecks(library, now);
  return {
    schemaVersion: 1,
    decks,
    preferences: library.preferences ?? {
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
    dueCount: decks.reduce((total, deck) => total + deck.dueCount, 0),
    activeSessionId: null,
    syncCursor: library.cursor,
    capabilities: {
      normalizedStorage: true,
      fsrs: true,
      offlineSync: true,
      richNotes: false,
      aiWorkshop: false,
      // Cutover is a server operation; an offline snapshot cannot offer it.
      cutoverAvailable: false,
    },
  };
}

/** Deck summaries for the offline library view, counted from locally stored cards. */
export function buildStudyOfflineDecks(
  library: StudyOfflineLibrary,
  now: Date,
): StudyDeckSummary[] {
  const dueBefore = now.getTime();

  return library.decks
    .filter((deck) => !deck.archivedAt)
    .map((deck) => {
      const cards = library.cards.filter((card) => card.deckId === deck.id && !card.deletedAt);
      const active = cards.filter((card) => !card.isSuspended && !card.isBuried);
      return {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        pinned: deck.pinned,
        revision: deck.revision,
        cardCount: cards.length,
        dueCount: active.filter((card) => new Date(card.dueAt).getTime() <= dueBefore).length,
        newCount: cards.filter((card) => card.state === "new").length,
        updatedAt: deck.updatedAt,
      } satisfies StudyDeckSummary;
    })
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return left.title.localeCompare(right.title);
    });
}
