import { IconLoader2 } from "@tabler/icons-react"

interface StudyTabLoadingProps {
  /** What is being fetched, for the screen-reader announcement and the visible caption. */
  label: string
}

/**
 * The wait before a flashcards tab has its data.
 *
 * Each tab loads independently of the page, so switching to one used to show an empty panel — no
 * cards, no plans, no statistics — that was indistinguishable from having none. This is deliberately
 * small: the tab bar and the Today card above it are already painted, so a full-page skeleton would
 * be a bigger change on screen than the content it is standing in for.
 */
export function StudyTabLoading({ label }: StudyTabLoadingProps) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-tertiary)]"
      role="status"
      aria-live="polite"
    >
      <IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
      {label}
    </div>
  )
}
