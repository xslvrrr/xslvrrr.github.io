import * as React from "react"
import { IconArrowLeft, IconCheck, IconSearch } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  PAPER_YEAR_LEVELS, PAPER_YEAR_LEVEL_LABELS, type PaperYearLevel,
} from "@/lib/past-papers/domain"

export interface PastPapersProfile {
  yearLevel: PaperYearLevel | null
  subjectSlugs: string[]
}

interface PastPapersOnboardingProps {
  /** Catalogue subjects, from the browse facets. Empty until the first listing lands. */
  subjects: ReadonlyArray<{ slug: string; label: string; count: number }>
  /** Year level read from the portal, offered as the pre-selected answer. */
  detectedYearLevel: string | null
  initial: PastPapersProfile
  onComplete: (profile: PastPapersProfile) => void
  onSkip: () => void
}

/**
 * The short setup the browser opens on.
 *
 * It exists to stop guessing. Year level and enrolment were previously inferred from portal class
 * names by string cleanup — "12SCIL1" resolves to nothing, "Maths" resolves to three different
 * courses — and the student never saw that the guess had failed; they just got a listing ordered
 * for somebody else. Two questions answered once fixes ranking, the default year-level filter and
 * the picked-for-you row together, and both answers stay editable in settings afterwards.
 *
 * Subjects are only asked of Year 11 and 12, where enrolment is a real choice a student has made.
 * A Year 9 sits whatever their school sets, so the question has no answer worth storing.
 */
export function PastPapersOnboarding({
  subjects,
  detectedYearLevel,
  initial,
  onComplete,
  onSkip,
}: PastPapersOnboardingProps) {
  const [yearLevel, setYearLevel] = React.useState<PaperYearLevel | null>(
    initial.yearLevel ?? (isYearLevel(detectedYearLevel) ? detectedYearLevel : null),
  )
  const [selected, setSelected] = React.useState<string[]>(initial.subjectSlugs)
  const [step, setStep] = React.useState<"year" | "subjects">("year")
  const [search, setSearch] = React.useState("")

  const senior = yearLevel === "yr11" || yearLevel === "yr12"

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return subjects
    return subjects.filter((subject) => subject.label.toLowerCase().includes(needle))
  }, [search, subjects])

  const toggle = (slug: string) => {
    setSelected((current) => (
      current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug]
    ))
  }

  const finish = () => onComplete({ yearLevel, subjectSlugs: senior ? selected : [] })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-10">
      <header className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {step === "year" ? "Step 1 of 2" : "Step 2 of 2"}
        </span>
        <h2 className="text-xl font-semibold">
          {step === "year" ? "What year are you in?" : "Which subjects do you take?"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {step === "year"
            ? "This decides which papers you are shown first, and how long the timer starts at."
            : "Papers for these come first. You can change this any time in settings."}
        </p>
      </header>

      {step === "year" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {PAPER_YEAR_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={yearLevel === level}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
                yearLevel === level
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/50",
              )}
              onClick={() => setYearLevel(level)}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{PAPER_YEAR_LEVEL_LABELS[level]}</span>
                {level === detectedYearLevel ? (
                  <span className="text-xs text-muted-foreground">From your portal</span>
                ) : null}
              </span>
              {yearLevel === level ? <IconCheck className="size-4 shrink-0 text-primary" /> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              className="pl-8"
              placeholder="Search subjects"
              aria-label="Search subjects"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selected.map((slug) => (
                <Badge key={slug} variant="secondary" className="font-normal">
                  {subjects.find((subject) => subject.slug === slug)?.label ?? slug}
                </Badge>
              ))}
            </div>
          ) : null}

          <ScrollArea className="h-72 rounded-xl border border-border">
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              {/* The catalogue arrives with the first listing, so this can be empty for a moment on
                  a cold load. Skeletons rather than "no subjects", which reads as a broken index. */}
              {subjects.length === 0
                ? Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-9 rounded-md" />)
                : filtered.map((subject) => (
                  <button
                    key={subject.slug}
                    type="button"
                    aria-pressed={selected.includes(subject.slug)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      selected.includes(subject.slug) ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                    onClick={() => toggle(subject.slug)}
                  >
                    <IconCheck className={cn(
                      "size-4 shrink-0",
                      selected.includes(subject.slug) ? "opacity-100" : "opacity-0",
                    )} />
                    <span className="min-w-0 flex-1 truncate">{subject.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{subject.count}</span>
                  </button>
                ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {step === "subjects" ? (
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setStep("year")}>
            <IconArrowLeft className="size-4" /> Back
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>Skip for now</Button>
        )}

        <div className="flex items-center gap-2">
          {step === "subjects" ? (
            <Button type="button" variant="outline" size="sm" onClick={finish}>
              {selected.length === 0 ? "Skip subjects" : "Done"}
            </Button>
          ) : null}

          {step === "year" ? (
            <Button
              type="button"
              size="sm"
              disabled={yearLevel === null}
              // A junior has no enrolment question to answer, so the second step is skipped
              // outright rather than shown empty.
              onClick={() => (senior ? setStep("subjects") : finish())}
            >
              {senior ? "Next" : "Done"}
            </Button>
          ) : selected.length > 0 ? (
            <Button type="button" size="sm" onClick={finish}>Done</Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function isYearLevel(value: string | null): value is PaperYearLevel {
  return value !== null && (PAPER_YEAR_LEVELS as readonly string[]).includes(value)
}
