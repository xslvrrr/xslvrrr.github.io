import type { StudyQueueItem } from "./domain";

/**
 * Queue ordering for a review session.
 *
 * Interleaving helps conditionally — mainly when a learner has to tell similar categories apart,
 * and once they are familiar enough with each one for the comparison to mean anything. Randomly
 * mixing unrelated material is not supported as a universal improvement, so mixing here is a
 * decision with stated conditions rather than a default.
 *
 * Thresholds are product heuristics. They are not derived from a specific study and should be
 * evaluated against real usage rather than treated as settled numbers.
 */

export type StudyMixingStrategy = "adaptive" | "blocked" | "mixed";

/** Overdue by more than this multiple of its interval means the schedule matters more than mixing. */
const MATERIAL_OVERDUE_MULTIPLIER = 2;
const MATERIAL_OVERDUE_MINIMUM_DAYS = 7;
/** A category needs this many already-seen cards before mixing it in helps rather than confuses. */
const FAMILIARITY_THRESHOLD = 3;
/** Consecutive cards from one category before the queue tries to switch. */
const MAX_SAME_CATEGORY_RUN = 3;
/** Unfamiliar categories get a short blocked run first, so the first exposure is not scattered. */
const BLOCKED_INTRODUCTION_SIZE = 4;

export interface StudySessionQueueOptions {
  strategy: StudyMixingStrategy;
  seed: string;
  now: Date;
}

export interface StudySessionQueue {
  items: StudyQueueItem[];
  strategy: StudyMixingStrategy;
  /** Plain-language reason shown to the user. No neuroscience claims. */
  explanation: string;
  categories: string[];
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Deterministic generator so a paused, resumed, or offline session replays the same order. */
function createRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The topic a card belongs to, as a student would name it: its first tag, else the set's title.
 * The set id is only a last resort — surfacing it puts a raw UUID in front of the reader.
 */
export function studyCategoryOf(item: StudyQueueItem): string {
  return item.tags[0] || item.deckTitle || item.deckId;
}

function isMateriallyOverdue(item: StudyQueueItem, now: Date): boolean {
  const overdueDays = (now.getTime() - new Date(item.dueAt).getTime()) / 86_400_000;
  if (overdueDays <= 0) return false;
  if (overdueDays >= MATERIAL_OVERDUE_MINIMUM_DAYS) return true;
  return item.scheduledDays > 0 && overdueDays >= item.scheduledDays * MATERIAL_OVERDUE_MULTIPLIER;
}

function isFamiliar(item: StudyQueueItem): boolean {
  return item.state !== "new" && item.repetitions > 0;
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function groupByCategory(items: StudyQueueItem[]): Map<string, StudyQueueItem[]> {
  const groups = new Map<string, StudyQueueItem[]>();
  for (const item of items) {
    const category = studyCategoryOf(item);
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return groups;
}

/** Round-robin across categories, never leaving one category running for too long. */
function interleave(groups: Map<string, StudyQueueItem[]>, random: () => number): StudyQueueItem[] {
  const queues = shuffle([...groups.entries()], random).map(([category, items]) => ({
    category,
    items: [...items],
  }));
  const ordered: StudyQueueItem[] = [];
  let lastCategory: string | null = null;
  let run = 0;

  while (queues.some((queue) => queue.items.length > 0)) {
    const available = queues.filter((queue) => queue.items.length > 0);
    const alternatives = available.filter((queue) => queue.category !== lastCategory);
    const pool = run >= MAX_SAME_CATEGORY_RUN && alternatives.length > 0 ? alternatives : available;
    // Longest queue first keeps one category from bunching at the end of the session.
    const chosen = pool.reduce((longest, queue) => (queue.items.length > longest.items.length ? queue : longest));

    ordered.push(chosen.items.shift() as StudyQueueItem);
    run = chosen.category === lastCategory ? run + 1 : 1;
    lastCategory = chosen.category;
  }

  return ordered;
}

export function buildStudySessionQueue(
  items: StudyQueueItem[],
  options: StudySessionQueueOptions,
): StudySessionQueue {
  const random = createRandom(options.seed);
  const categories = [...new Set(items.map(studyCategoryOf))];

  if (options.strategy === "blocked" || categories.length < 2) {
    return {
      items: [...items],
      strategy: "blocked",
      explanation: categories.length < 2
        ? "One topic in this session, so cards stay in due order."
        : "Cards stay grouped by topic, in due order.",
      categories,
    };
  }

  if (options.strategy === "mixed") {
    return {
      items: interleave(groupByCategory(items), random),
      strategy: "mixed",
      explanation: "Topics are mixed so you practise telling them apart.",
      categories,
    };
  }

  // Adaptive: schedule first, then a short blocked introduction, then mixing where it is warranted.
  const overdue = items.filter((item) => isMateriallyOverdue(item, options.now));
  const remaining = items.filter((item) => !isMateriallyOverdue(item, options.now));

  const familiarityByCategory = new Map<string, number>();
  for (const item of items) {
    if (!isFamiliar(item)) continue;
    const category = studyCategoryOf(item);
    familiarityByCategory.set(category, (familiarityByCategory.get(category) ?? 0) + 1);
  }

  const readyCategories = categories.filter(
    (category) => (familiarityByCategory.get(category) ?? 0) >= FAMILIARITY_THRESHOLD,
  );
  const introductions = remaining.filter(
    (item) => !readyCategories.includes(studyCategoryOf(item)) && !isFamiliar(item),
  );
  const mixable = remaining.filter((item) => !introductions.includes(item));

  const blockedIntroduction = [...groupByCategory(introductions).values()]
    .flatMap((group) => group.slice(0, BLOCKED_INTRODUCTION_SIZE));
  const laterIntroduction = introductions.filter((item) => !blockedIntroduction.includes(item));

  if (readyCategories.length < 2) {
    return {
      items: [...overdue, ...blockedIntroduction, ...mixable, ...laterIntroduction],
      strategy: "adaptive",
      explanation: overdue.length > 0
        ? "Overdue cards come first. New topics stay grouped until you have seen them a few times."
        : "New topics stay grouped until you have seen them a few times.",
      categories,
    };
  }

  const mixed = interleave(groupByCategory(mixable), random);
  return {
    items: [...overdue, ...blockedIntroduction, ...mixed, ...laterIntroduction],
    strategy: "adaptive",
    explanation: overdue.length > 0
      ? `Overdue cards come first, then ${readyCategories.length} familiar topics are mixed so you practise telling them apart.`
      : `${readyCategories.length} familiar topics are mixed so you practise telling them apart.`,
    categories,
  };
}
