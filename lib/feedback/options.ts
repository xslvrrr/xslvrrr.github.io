/**
 * Shared vocabulary for the bug report / feature suggestion system.
 *
 * The dialog uses these lists to build its comboboxes and to decide when the send button becomes
 * enabled; the API route uses the same lists to validate what arrives. Keeping one definition means
 * a new category cannot be offered in the UI and rejected by the server.
 */

export type FeedbackKind = "bug" | "suggestion"
export type FeedbackStatus = "pending" | "accepted" | "dismissed"

export type BugCategory =
  | "performance"
  | "looks-wrong"
  | "crashes"
  | "not-working"
  | "other"

export type SuggestionType =
  | "new-page"
  | "page-addition"
  | "new-concept"
  | "settings-addition"

export interface FeedbackOption<Value extends string> {
  readonly value: Value
  readonly label: string
}

export const FEEDBACK_KIND_OPTIONS: readonly FeedbackOption<FeedbackKind>[] = [
  { value: "bug", label: "Bug report" },
  { value: "suggestion", label: "Feature suggestion" },
]

export const BUG_CATEGORY_OPTIONS: readonly FeedbackOption<BugCategory>[] = [
  { value: "performance", label: "Performance" },
  { value: "looks-wrong", label: "Looks wrong" },
  { value: "crashes", label: "Site crashes" },
  { value: "not-working", label: "Doesn't work" },
  { value: "other", label: "Other" },
]

export const SUGGESTION_TYPE_OPTIONS: readonly FeedbackOption<SuggestionType>[] = [
  { value: "new-page", label: "New page" },
  { value: "page-addition", label: "Addition to an existing page" },
  { value: "new-concept", label: "New concept" },
  { value: "settings-addition", label: "Addition to settings" },
]

/** Free-text limits. The API rejects anything longer so a single report cannot fill a row. */
export const FEEDBACK_AREA_MAX_LENGTH = 200
export const FEEDBACK_CATEGORY_OTHER_MAX_LENGTH = 120
export const FEEDBACK_DETAILS_MAX_LENGTH = 4000
export const FEEDBACK_DETAILS_MIN_LENGTH = 20

/** Administrator reply attached to a decision, and the reason recorded with a suspension. */
export const FEEDBACK_ADMIN_MESSAGE_MAX_LENGTH = 1000
export const FEEDBACK_SUSPENSION_REASON_MAX_LENGTH = 300

/** A suspended account may write one appeal, so it is worth a sentence or two. */
export const FEEDBACK_APPEAL_MIN_LENGTH = 20
export const FEEDBACK_APPEAL_MAX_LENGTH = 1500

export function feedbackStatusLabel(status: FeedbackStatus): string {
  if (status === "accepted") return "Accepted"
  if (status === "dismissed") return "Dismissed"
  return "Awaiting review"
}

/** What the dialog holds while the user fills it in. Every field is optional until submission. */
export interface FeedbackDraft {
  kind: FeedbackKind | null
  area: string
  bugCategory: BugCategory | null
  bugCategoryOther: string
  suggestionType: SuggestionType | null
  details: string
}

/** The validated shape sent to the API and stored. */
export interface FeedbackSubmission {
  kind: FeedbackKind
  area: string | null
  bugCategory: BugCategory | null
  bugCategoryOther: string | null
  suggestionType: SuggestionType | null
  details: string
}

export const EMPTY_FEEDBACK_DRAFT: FeedbackDraft = {
  kind: null,
  area: "",
  bugCategory: null,
  bugCategoryOther: "",
  suggestionType: null,
  details: "",
}

function optionLabel<Value extends string>(
  options: readonly FeedbackOption<Value>[],
  value: Value | null | undefined,
): string {
  return options.find((option) => option.value === value)?.label ?? "Unknown"
}

export function feedbackKindLabel(kind: FeedbackKind): string {
  return optionLabel(FEEDBACK_KIND_OPTIONS, kind)
}

export function bugCategoryLabel(category: BugCategory): string {
  return optionLabel(BUG_CATEGORY_OPTIONS, category)
}

export function suggestionTypeLabel(type: SuggestionType): string {
  return optionLabel(SUGGESTION_TYPE_OPTIONS, type)
}

/** "Send bug report" / "Send suggestion", or a neutral label before a kind is chosen. */
export function feedbackSubmitLabel(kind: FeedbackKind | null): string {
  if (kind === "bug") return "Send bug report"
  if (kind === "suggestion") return "Send suggestion"
  return "Send report"
}

function isOption<Value extends string>(
  options: readonly FeedbackOption<Value>[],
  value: unknown,
): value is Value {
  return typeof value === "string" && options.some((option) => option.value === value)
}

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return isOption(FEEDBACK_KIND_OPTIONS, value)
}

export function isBugCategory(value: unknown): value is BugCategory {
  return isOption(BUG_CATEGORY_OPTIONS, value)
}

export function isSuggestionType(value: unknown): value is SuggestionType {
  return isOption(SUGGESTION_TYPE_OPTIONS, value)
}

/**
 * Normalizes a draft into the payload the API accepts, or returns null while a required answer is
 * still missing. The dialog uses the null result to keep the send button disabled, so the button
 * state and the server's contract can never disagree.
 */
export function buildFeedbackSubmission(draft: FeedbackDraft): FeedbackSubmission | null {
  const details = draft.details.trim()
  if (details.length < FEEDBACK_DETAILS_MIN_LENGTH || details.length > FEEDBACK_DETAILS_MAX_LENGTH) {
    return null
  }

  if (draft.kind === "bug") {
    const area = draft.area.trim()
    if (!area || area.length > FEEDBACK_AREA_MAX_LENGTH) return null
    if (!draft.bugCategory) return null

    const other = draft.bugCategoryOther.trim()
    if (draft.bugCategory === "other" && (!other || other.length > FEEDBACK_CATEGORY_OTHER_MAX_LENGTH)) {
      return null
    }

    return {
      kind: "bug",
      area,
      bugCategory: draft.bugCategory,
      bugCategoryOther: draft.bugCategory === "other" ? other : null,
      suggestionType: null,
      details,
    }
  }

  if (draft.kind === "suggestion") {
    if (!draft.suggestionType) return null
    return {
      kind: "suggestion",
      area: null,
      bugCategory: null,
      bugCategoryOther: null,
      suggestionType: draft.suggestionType,
      details,
    }
  }

  return null
}
