import { getUserAssistantPortalSnapshot } from "../users";
import { subjectSlugOf } from "./domain.ts";
import { canonicalSubjectSlug } from "./taxonomy.ts";
import * as repository from "./repository.ts";
import * as library from "./repository-library.ts";
import type { StudentContext } from "./service.ts";

/**
 * What we know about the student, for ranking.
 *
 * Everything here is best-effort. A student whose portal has not synced, or who has no flashcard
 * history, still gets a working browser — the ranking simply falls back to "newest current-syllabus
 * paper first" rather than personalising. Failing the whole page because enrolment could not be
 * read would be a much worse trade.
 */

/** Maps a portal class name onto a catalogue subject slug. */
export function subjectSlugFromClassName(name: string): string {
  // Portal class names carry noise the catalogue does not: "12PHY1", "Physics (Yr 12)", "Yr11 Chem".
  const cleaned = name
    .replace(/\b(year|yr)\s*\d{1,2}\b/gi, " ")
    .replace(/^\s*\d{1,2}\s*/, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+\b/g, " ")
    .trim();
  return canonicalSubjectSlug(subjectSlugOf(cleaned || name));
}

/** Portal year strings vary ("Year 12", "12", "Yr12"); anything unrecognised stays null. */
export function yearLevelFromPortal(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = String(value).match(/\b(9|10|11|12)\b/);
  return match ? `yr${match[1]}` : null;
}

export async function loadStudentContext(userId: string): Promise<StudentContext> {
  const [portal, attempts, preferences] = await Promise.all([
    getUserAssistantPortalSnapshot(userId).catch(() => ({ portalData: null })),
    library.listAttempts(userId, 500).catch(() => []),
    repository.loadPreferences(userId).catch(() => null),
  ]);

  // Attempts record a paper id, not a subject, so the papers have to be resolved before the
  // history can be attributed to anything.
  const attemptedPapers = await repository
    .findPapersByIds([...new Set(attempts.map((attempt) => attempt.paperId))])
    .catch(() => []);
  const subjectByPaperId = new Map(attemptedPapers.map((paper) => [paper.id, paper.subjectSlug]));

  const portalData = (portal as { portalData: unknown }).portalData as
    | { classes?: Array<{ name?: unknown; enrolled?: unknown }>; year?: unknown; yearLevel?: unknown }
    | null;

  const detectedSubjectSlugs = [...new Set(
    (portalData?.classes ?? [])
      // An unenrolled class still sits in the portal grid; a dropped subject is not a subject.
      .filter((entry) => entry?.enrolled !== false)
      .flatMap((entry) => (typeof entry?.name === "string" ? [subjectSlugFromClassName(entry.name)] : []))
      .filter((slug) => slug.length > 0),
  )];

  /*
   * What the student told us outranks what we inferred.
   *
   * Portal class names are matched to catalogue subjects by string cleanup, which is a heuristic
   * that fails quietly — "12SCIL1" is not going to resolve to anything, and the student never sees
   * that it did not. The setup asks them directly, so once they have answered, the answer is the
   * authority and detection is only the fallback for an account that skipped it.
   */
  const enrolledSubjectSlugs = preferences?.subjectSlugs.length
    ? [...new Set(preferences.subjectSlugs.map((slug) => canonicalSubjectSlug(slug)))]
    : detectedSubjectSlugs;

  return {
    yearLevel: preferences?.yearLevel ?? yearLevelFromPortal(portalData?.yearLevel ?? portalData?.year),
    enrolledSubjectSlugs,
    standings: buildStandings(enrolledSubjectSlugs, attempts, subjectByPaperId),
  };
}

/**
 * Per-subject standing from attempt history.
 *
 * Retention is left null here rather than guessed. It belongs to the flashcard scheduler, which
 * keys on decks rather than on catalogue subject slugs; wiring the two together is a real mapping
 * problem, and a fabricated retention would drive the recommendation row's weakness signal off
 * nothing. Null is read as "no information" by design — see `weaknessSignal`.
 */
function buildStandings(
  subjectSlugs: readonly string[],
  attempts: readonly library.PaperAttempt[],
  subjectByPaperId: ReadonlyMap<string, string>,
): StudentContext["standings"] {
  const bySubject = new Map<string, { attempts: number; ratings: number[] }>();
  // Seeded with every enrolled subject, so a subject with no attempts is present with a count of
  // zero rather than absent. The recommendation row keys "you have not sat one of these yet" off
  // exactly that distinction, and an absent subject would read as unknown instead.
  for (const slug of subjectSlugs) bySubject.set(slug, { attempts: 0, ratings: [] });

  for (const attempt of attempts) {
    const subjectSlug = subjectByPaperId.get(attempt.paperId);
    if (!subjectSlug) continue;
    const entry = bySubject.get(subjectSlug) ?? { attempts: 0, ratings: [] };
    entry.attempts += 1;
    if (attempt.selfRating !== null) entry.ratings.push(attempt.selfRating);
    bySubject.set(subjectSlug, entry);
  }

  return [...bySubject.entries()].map(([subjectSlug, entry]) => ({
    subjectSlug,
    retention: null,
    reviewCount: 0,
    attempts: entry.attempts,
    meanRating: entry.ratings.length > 0
      ? entry.ratings.reduce((sum, rating) => sum + rating, 0) / entry.ratings.length
      : null,
  }));
}
