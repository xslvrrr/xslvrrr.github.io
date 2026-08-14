import * as React from "react"
import {
  IconCheck, IconClock, IconDownload, IconFileText, IconSchool, IconStar, IconStarFilled,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  DIFFICULTY_MIN_DISPLAY_CONFIDENCE, PAPER_CATEGORY_LABELS, PAPER_DIFFICULTY_LABELS,
  PAPER_DOCUMENT_KIND_LABELS, isAnswerBearing, type PastPaper, type SyllabusEra,
} from "@/lib/past-papers/domain"

export type PaperDownloadState = "idle" | "downloading" | "downloaded"

interface PastPaperCardProps {
  paper: PastPaper
  saved: boolean
  downloadState: PaperDownloadState
  /** 0-1 while downloading, or null for a download whose size the server did not declare. */
  progress?: number | null
  eras: readonly SyllabusEra[]
  /** Off hides bands that have not met the display confidence, rather than marking them. */
  showEstimatedDifficulty?: boolean
  onOpen: (paper: PastPaper) => void
  onToggleSave: (paper: PastPaper) => void
  onDownload: (paper: PastPaper) => void
}

/**
 * One paper.
 *
 * Rewritten for legibility rather than completeness. The previous card put nine badges in a row of
 * 10px type under a truncated title: everything the index knew was on screen and none of it could
 * be read at a glance, which is the only glance a card gets. What survives is the three questions a
 * student actually answers before choosing a paper — what is it, how long does it take, how hard is
 * it — laid out as labelled facts with room around them. The rest (document kind, syllabus age,
 * where a number came from) is still here, but as a tooltip or a single qualifier rather than
 * another chip competing with the title.
 */
function PastPaperCardComponent({
  paper,
  saved,
  downloadState,
  progress,
  eras,
  showEstimatedDifficulty = true,
  onOpen,
  onToggleSave,
  onDownload,
}: PastPaperCardProps) {
  const settled = paper.difficulty !== null && paper.difficulty.confidence >= DIFFICULTY_MIN_DISPLAY_CONFIDENCE
  // A student who turned estimates off asked not to be shown a band the evidence does not support,
  // so it goes rather than appearing with a qualifier.
  const showDifficulty = paper.difficulty !== null && (settled || showEstimatedDifficulty)
  const era = eras.find((candidate) => candidate.id === paper.syllabusEraId)
  const offSyllabus = era !== undefined && era.endYear !== null
  const answers = isAnswerBearing(paper.documentKind)
  const downloading = downloadState === "downloading"

  return (
    <article
      className={cn(
        "group flex h-full flex-col gap-3.5 rounded-xl border border-border bg-card p-4",
        "transition-colors hover:border-primary/40",
      )}
    >
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* Two lines rather than one truncated one. A trial paper's title is "Sydney Boys 2019
              Trial - Mathematics Extension 1", and the half of that a single line shows is the
              half that identifies nothing. */}
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug" title={paper.title}>
            {paper.title}
          </h3>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground/80">{paper.subject}</span>
            <span aria-hidden>·</span>
            <span>{PAPER_CATEGORY_LABELS[paper.category]}</span>
            {paper.year !== null ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{paper.year}</span>
              </>
            ) : null}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-1 -mt-1 size-8 shrink-0 [&_svg]:size-4"
          aria-label={saved ? "Remove from saved" : "Star and download"}
          aria-pressed={saved}
          onClick={() => onToggleSave(paper)}
        >
          {saved ? <IconStarFilled className="text-amber-500" /> : <IconStar />}
        </Button>
      </header>

      {paper.school ? (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <IconSchool className="size-3.5 shrink-0" />
          <span className="truncate">{paper.school}</span>
        </p>
      ) : null}

      {/* The facts, as facts. A value with its label above it reads in one pass; the same value in
          an outlined pill does not, because the reader has to work out what the number counts. */}
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <Fact
          label="Working time"
          value={paper.durationMinutes ? formatDuration(paper.durationMinutes) : "Not stated"}
          muted={!paper.durationMinutes}
          icon={<IconClock className="size-3 shrink-0" />}
          note={paper.durationMinutes ? durationNote(paper) : null}
        />
        <Fact
          label="Marks"
          value={paper.totalMarks ? String(paper.totalMarks) : "Not stated"}
          muted={!paper.totalMarks}
          note={paper.totalMarks ? MARKS_NOTES[paper.marksSource] : null}
        />
        {showDifficulty && paper.difficulty ? (
          <Fact
            label="Difficulty"
            value={`${PAPER_DIFFICULTY_LABELS[paper.difficulty.band]}${settled ? "" : " ?"}`}
            note={(
              <span className="flex flex-col gap-1">
                {paper.difficulty.rationale.map((line) => <span key={line}>{line}</span>)}
                {settled ? null : <span className="opacity-70">Estimate — not enough evidence yet.</span>}
              </span>
            )}
          />
        ) : null}
      </dl>

      {paper.hasSolutions || answers || offSyllabus ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {paper.hasSolutions ? (
            <Badge variant="secondary" className="px-1.5 font-normal">Solutions</Badge>
          ) : null}
          {answers ? (
            <Badge variant="outline" className="px-1.5 font-normal text-amber-600">
              {PAPER_DOCUMENT_KIND_LABELS[paper.documentKind]}
            </Badge>
          ) : null}
          {offSyllabus ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant="outline" className="px-1.5 font-normal text-amber-600">
                    Old syllabus
                  </Badge>
                }
              />
              <TooltipContent>{era.description}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      {/* Pushed to the bottom so every card's actions line up regardless of how much it carries,
          which is what stops a grid of cards reading as ragged. */}
      <footer className="mt-auto flex flex-col gap-2 pt-1">
        {downloading ? (
          <DownloadProgressBar progress={progress ?? null} />
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={downloadState === "downloaded" ? "outline" : "default"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => (downloadState === "downloaded" ? onOpen(paper) : onDownload(paper))}
            >
              {downloadState === "downloaded" ? (
                <><IconFileText className="size-3.5" /> Open</>
              ) : (
                <><IconDownload className="size-3.5" /> Download</>
              )}
            </Button>

            {downloadState === "downloaded" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 [&_svg]:size-4"
                      aria-label="Download again"
                      onClick={() => onDownload(paper)}
                    />
                  }
                >
                  <IconCheck className="text-emerald-500" />
                </TooltipTrigger>
                <TooltipContent>On this device — download again</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        )}
      </footer>
    </article>
  )
}

/**
 * Cards are the expensive part of this page — a full listing renders dozens, each with tooltips —
 * and the props are all primitives or values that only change when the paper does, so a shallow
 * comparison is exactly right. Without it, one star or one download progress tick re-renders the
 * whole grid, which is what makes the page crawl on a low-end laptop.
 */
export const PastPaperCard = React.memo(PastPaperCardComponent)

function Fact({
  label,
  value,
  note,
  icon,
  muted = false,
}: {
  label: string
  value: string
  note?: React.ReactNode
  icon?: React.ReactNode
  muted?: boolean
}) {
  const body = (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn(
        "flex items-center gap-1 text-xs font-medium tabular-nums",
        muted && "font-normal text-muted-foreground",
      )}>
        {icon}
        {value}
      </dd>
    </div>
  )

  if (!note) return body
  return (
    <Tooltip>
      <TooltipTrigger render={<div className="cursor-help" />}>{body}</TooltipTrigger>
      <TooltipContent className="max-w-72">{note}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Download progress.
 *
 * Determinate whenever the server declares a length, indeterminate otherwise. The distinction is
 * kept rather than smoothed over because these files run to ten megabytes on a school connection,
 * and a bar that animates without meaning anything is how a stalled download gets mistaken for a
 * working one.
 */
function DownloadProgressBar({ progress }: { progress: number | null }) {
  const percent = progress === null ? null : Math.round(progress * 100)

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Downloading</span>
        {percent !== null ? <span className="tabular-nums">{percent}%</span> : null}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Download progress"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(percent !== null ? { "aria-valuenow": percent } : {})}
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-200 ease-linear",
            percent === null && "w-1/3 animate-pulse",
          )}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

const MARKS_NOTES: Record<PastPaper["marksSource"], string | null> = {
  document: "Read from the paper",
  title: "Stated in the source's own listing",
  "subject-default": "Official total for this course — a school paper may differ",
  unknown: null,
}

function durationNote(paper: PastPaper): string {
  return paper.durationSource === "document"
    ? "Working time read from the paper"
    : "Official working time for this course"
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
