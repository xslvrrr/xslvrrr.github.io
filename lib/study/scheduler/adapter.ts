import type {
  StudyReviewPreview,
  StudyReviewRating,
  StudyReviewTransition,
  StudySchedulerParameters,
  StudySchedulingState,
} from "../domain";

export interface StudySchedulerAdapter {
  readonly name: string;
  readonly version: string;
  readonly parametersVersion: string;
  readonly parameters: StudySchedulerParameters;
  createState: (now?: Date) => StudySchedulingState;
  preview: (state: StudySchedulingState, reviewedAt?: Date) => StudyReviewPreview;
  apply: (
    state: StudySchedulingState,
    rating: StudyReviewRating,
    reviewedAt?: Date,
  ) => StudyReviewTransition;
  retrievability: (state: StudySchedulingState, now?: Date) => number | null;
}
