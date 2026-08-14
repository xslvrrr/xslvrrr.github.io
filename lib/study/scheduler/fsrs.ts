import {
  FSRSVersion,
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type CardInput,
  type FSRSParameters,
  type Grade,
  type RecordLogItem,
} from "ts-fsrs";

import {
  STUDY_DEFAULT_DESIRED_RETENTION,
  STUDY_MAXIMUM_INTERVAL_DAYS,
  type StudyReviewLogSnapshot,
  type StudyReviewPreview,
  type StudyReviewRating,
  type StudyReviewTransition,
  type StudySchedulerParameters,
  type StudySchedulingState,
} from "../domain";
import { parseStudySchedulerParameters } from "../schemas";
import type { StudySchedulerAdapter } from "./adapter";

const RATING_MAP: Record<StudyReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_TO_FSRS: Record<StudySchedulingState["state"], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_FROM_FSRS: Record<State, StudySchedulingState["state"]> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

function toFsrsParameters(parameters: StudySchedulerParameters): FSRSParameters {
  return generatorParameters({
    request_retention: parameters.desiredRetention,
    maximum_interval: parameters.maximumIntervalDays,
    enable_fuzz: parameters.enableFuzz,
    enable_short_term: parameters.enableShortTerm,
    learning_steps: parameters.learningSteps as FSRSParameters["learning_steps"],
    relearning_steps: parameters.relearningSteps as FSRSParameters["relearning_steps"],
    w: parameters.weights,
  });
}

function toFsrsCard(state: StudySchedulingState): CardInput {
  return {
    state: STATE_TO_FSRS[state.state],
    due: state.dueAt,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.repetitions,
    lapses: state.lapses,
    last_review: state.lastReviewedAt,
  };
}

function fromFsrsCard(card: Card): StudySchedulingState {
  return {
    state: STATE_FROM_FSRS[card.state],
    dueAt: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    repetitions: card.reps,
    lapses: card.lapses,
    lastReviewedAt: card.last_review?.toISOString() ?? null,
  };
}

function toReviewLog(
  rating: StudyReviewRating,
  result: RecordLogItem,
): StudyReviewLogSnapshot {
  return {
    rating,
    state: STATE_FROM_FSRS[result.log.state],
    dueAt: result.log.due.toISOString(),
    stability: result.log.stability,
    difficulty: result.log.difficulty,
    elapsedDays: result.log.elapsed_days,
    scheduledDays: result.log.scheduled_days,
    learningSteps: result.log.learning_steps,
    reviewedAt: result.log.review.toISOString(),
  };
}

function intervalSeconds(reviewedAt: Date, dueAt: string): number {
  return Math.max(0, Math.round((new Date(dueAt).getTime() - reviewedAt.getTime()) / 1_000));
}

function parameterVersion(parameters: StudySchedulerParameters): string {
  const serialized = JSON.stringify(parameters);
  let hash = 2_166_136_261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fsrs-${FSRSVersion}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function defaultStudySchedulerParameters(): StudySchedulerParameters {
  const generated = generatorParameters({
    request_retention: STUDY_DEFAULT_DESIRED_RETENTION,
    maximum_interval: STUDY_MAXIMUM_INTERVAL_DAYS,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ["1m", "10m"],
    relearning_steps: ["10m"],
  });

  return {
    desiredRetention: generated.request_retention,
    maximumIntervalDays: generated.maximum_interval,
    enableFuzz: generated.enable_fuzz,
    enableShortTerm: generated.enable_short_term,
    learningSteps: [...generated.learning_steps],
    relearningSteps: [...generated.relearning_steps],
    weights: [...generated.w],
  };
}

export class FsrsStudyScheduler implements StudySchedulerAdapter {
  readonly name = "fsrs";
  readonly version = FSRSVersion;
  readonly parametersVersion: string;
  readonly parameters: StudySchedulerParameters;

  private readonly scheduler: ReturnType<typeof fsrs>;

  constructor(parameters: StudySchedulerParameters = defaultStudySchedulerParameters()) {
    this.parameters = parseStudySchedulerParameters(parameters);
    this.parametersVersion = parameterVersion(this.parameters);
    this.scheduler = fsrs(toFsrsParameters(this.parameters));
  }

  createState(now = new Date()): StudySchedulingState {
    return fromFsrsCard(createEmptyCard(now));
  }

  preview(state: StudySchedulingState, reviewedAt = new Date()): StudyReviewPreview {
    const preview = this.scheduler.repeat(toFsrsCard(state), reviewedAt);
    const retrievabilityBefore = this.retrievability(state, reviewedAt);

    return (Object.keys(RATING_MAP) as StudyReviewRating[]).reduce<StudyReviewPreview>(
      (transitions, rating) => {
        const result = preview[RATING_MAP[rating]];
        const after = fromFsrsCard(result.card);
        return {
          ...transitions,
          [rating]: {
            rating,
            before: state,
            after,
            log: toReviewLog(rating, result),
            nextIntervalSeconds: intervalSeconds(reviewedAt, after.dueAt),
            retrievabilityBefore,
          },
        };
      },
      {} as StudyReviewPreview,
    );
  }

  apply(
    state: StudySchedulingState,
    rating: StudyReviewRating,
    reviewedAt = new Date(),
  ): StudyReviewTransition {
    const retrievabilityBefore = this.retrievability(state, reviewedAt);
    const result = this.scheduler.next(toFsrsCard(state), reviewedAt, RATING_MAP[rating]);
    const after = fromFsrsCard(result.card);

    return {
      rating,
      before: state,
      after,
      log: toReviewLog(rating, result),
      nextIntervalSeconds: intervalSeconds(reviewedAt, after.dueAt),
      retrievabilityBefore,
    };
  }

  retrievability(state: StudySchedulingState, now = new Date()): number | null {
    if (state.state === "new" || state.stability <= 0 || !state.lastReviewedAt) return null;
    return this.scheduler.get_retrievability(toFsrsCard(state), now, false);
  }
}
