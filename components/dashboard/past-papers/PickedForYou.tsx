import { IconChevronRight, IconClock, IconSparkles, IconStar, IconStarFilled } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { PAPER_DIFFICULTY_LABELS, DIFFICULTY_MIN_DISPLAY_CONFIDENCE, type PastPaper } from "@/lib/past-papers/domain"
import type { Recommendation } from "@/lib/past-papers/recommendations"

interface PickedForYouProps {
  recommendations: readonly Recommendation[]
  savedPaperIds: ReadonlySet<string>
  loading: boolean
  /** Off hides bands that have not met the display confidence, matching the results grid. */
  showEstimatedDifficulty?: boolean
  onOpen: (paper: PastPaper) => void
  onToggleSave: (paper: PastPaper) => void
}

/**
 * The single scrollable row at the top of the browser.
 *
 * Every card carries the reason it was picked. That is not decoration: a recommendation a student
 * cannot account for is indistinguishable from an advert, and the whole point of this row is that
 * it should be trusted enough to act on without checking.
 */
export function PickedForYou({
  recommendations,
  savedPaperIds,
  loading,
  showEstimatedDifficulty = true,
  onOpen,
  onToggleSave,
}: PickedForYouProps) {
  if (!loading && recommendations.length === 0) return null

  return (
    <section className="flex flex-col gap-2" aria-label="Picked for you">
      <div className="flex items-center gap-2 px-0.5">
        <IconSparkles className="size-4 text-primary" />
        <h2 className="text-sm font-medium">Picked for you</h2>
        <span className="text-xs text-muted-foreground">Based on your subjects and what you have sat</span>
      </div>

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-3 pb-3">
          {loading
            ? Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-[8.5rem] w-64 shrink-0 rounded-xl" />
            ))
            : recommendations.map(({ paper, reason }) => (
              <PickCard
                key={paper.id}
                paper={paper}
                reason={reason}
                saved={savedPaperIds.has(paper.id)}
                showEstimatedDifficulty={showEstimatedDifficulty}
                onOpen={() => onOpen(paper)}
                onToggleSave={() => onToggleSave(paper)}
              />
            ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  )
}

function PickCard({
  paper,
  reason,
  saved,
  showEstimatedDifficulty,
  onOpen,
  onToggleSave,
}: {
  paper: PastPaper
  reason: string
  saved: boolean
  showEstimatedDifficulty: boolean
  onOpen: () => void
  onToggleSave: () => void
}) {
  const settled = paper.difficulty !== null && paper.difficulty.confidence >= DIFFICULTY_MIN_DISPLAY_CONFIDENCE
  const showDifficulty = paper.difficulty !== null && (settled || showEstimatedDifficulty)

  return (
    <div className="flex h-[8.5rem] w-64 shrink-0 flex-col justify-between rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium">{paper.subject}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 size-7 shrink-0 [&_svg]:size-3.5"
            aria-label={saved ? "Remove from saved" : "Save paper"}
            aria-pressed={saved}
            onClick={onToggleSave}
          >
            {saved ? <IconStarFilled className="text-amber-500" /> : <IconStar />}
          </Button>
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {[paper.school, paper.year].filter(Boolean).join(" · ") || paper.title}
        </span>
        {/* Wrapped rather than truncated: a reason cut off mid-sentence explains nothing. */}
        <p className="line-clamp-2 whitespace-normal text-[11px] leading-tight text-primary/90">{reason}</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {paper.durationMinutes ? (
            <Badge variant="outline" className="gap-1 px-1.5 text-[10px]">
              <IconClock className="size-3" />
              {formatDuration(paper.durationMinutes)}
            </Badge>
          ) : null}
          {showDifficulty && paper.difficulty ? (
            <Badge variant={settled ? "secondary" : "outline"} className="px-1.5 text-[10px]">
              {PAPER_DIFFICULTY_LABELS[paper.difficulty.band]}
              {settled ? "" : "?"}
            </Badge>
          ) : null}
        </div>
        <Button type="button" size="xs" variant="ghost" className="gap-1 px-2" onClick={onOpen}>
          Open <IconChevronRight className="size-3" />
        </Button>
      </div>
    </div>
  )
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
