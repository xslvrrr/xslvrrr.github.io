import * as React from "react"
import {
  IconAdjustmentsHorizontal, IconFileText, IconLoader2, IconSearch, IconSettings, IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
} from "@/components/dashboard/DashboardPage"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EMPTY_QUERY, usePastPapers, type PastPapersQuery } from "@/hooks/usePastPapers"
import type { PastPaper } from "@/lib/past-papers/domain"
import { RECOMMENDATION_INTERACTION_THRESHOLD } from "@/lib/past-papers/local-library"
import { PAPER_SORT_LABELS, type PaperSort } from "@/lib/past-papers/query"
import { PastPaperCard, type PaperDownloadState } from "./PastPaperCard"
import { PastPaperFilterDialog } from "./PastPaperFilterDialog"
import { PastPaperReader } from "./PastPaperReader"
import { PastPapersOnboarding, type PastPapersProfile } from "./PastPapersOnboarding"
import { PastPapersSidebar, type PastPapersView } from "./PastPapersSidebar"
import { LadderBuilder } from "./LadderBuilder"
import { SharePapersDialog } from "./SharePapersDialog"

interface PastPapersPageProps {
  /** Scopes the on-device library, so a shared device never mixes two students' downloads. */
  accountId: string
  /** Year level from the portal, offered as the pre-selected answer during setup. */
  detectedYearLevel?: string | null
}

/**
 * The Past Papers tab.
 *
 * Composition only. The page is a sidebar of destinations — browse, starred, downloaded, ladders,
 * folders — beside one listing, and above that listing the three controls that get used constantly:
 * search, sort, and the filter button. Everything else lives in the filter dialog, so the row above
 * the results stays one row rather than a wall of controls the student reads past every visit.
 */
export function PastPapersPage({ accountId, detectedYearLevel = null }: PastPapersPageProps) {
  const [query, setQuery] = React.useState<PastPapersQuery>(EMPTY_QUERY)
  const [search, setSearch] = React.useState("")
  const [view, setView] = React.useState<PastPapersView>("browse")
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [setupOpen, setSetupOpen] = React.useState(false)
  const [reading, setReading] = React.useState<PastPaper | null>(null)
  /** A paper held back by the superseded-syllabus warning, waiting for the student to confirm. */
  const [syllabusPrompt, setSyllabusPrompt] = React.useState<
    { paper: PastPaper; description: string } | null
  >(null)
  const [shareTarget, setShareTarget] = React.useState<
    { kind: "folder" | "ladder"; id: string; title: string } | null
  >(null)

  // Search is the one control that applies as you type; everything else waits for Apply. Typing
  // into a box and getting nothing until a second button is pressed reads as broken.
  const effectiveQuery = React.useMemo(() => ({ ...query, search }), [query, search])
  const state = usePastPapers(effectiveQuery, accountId)
  const {
    toggleSave, refreshLibrary, savePreferences, preferences, preferencesLoaded, downloadPaper,
    noteInteraction, loadMore, localPapers, downloadProgress, interactionCount, canRecommend,
  } = state

  React.useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state.error])

  /**
   * Seeds the listing from the student's own settings, once.
   *
   * Settings arrive after the first render, so this cannot be the query's initial value; and it
   * must not re-run, or a student who changes the sort would have it silently reset back to their
   * default on the next preferences refresh.
   */
  const seeded = React.useRef(false)
  React.useEffect(() => {
    if (!preferencesLoaded || seeded.current) return
    seeded.current = true
    setQuery((current) => ({
      ...current,
      sort: preferences.defaultSort,
      yearLevel: preferences.matchMyYearLevel && preferences.yearLevel
        ? preferences.yearLevel
        : current.yearLevel,
    }))
  }, [preferences, preferencesLoaded])

  const changeView = React.useCallback((next: PastPapersView) => {
    setView(next)
    setQuery((current) => ({
      ...current,
      savedOnly: next === "starred",
      downloadedOnly: next === "downloaded",
      folderId: null,
    }))
  }, [])

  const changeFolder = React.useCallback((folderId: string | null) => {
    setView("browse")
    setQuery((current) => ({
      ...current,
      folderId,
      // A folder is already a subset of the starred papers, so the two narrowings never stack.
      savedOnly: false,
      downloadedOnly: false,
    }))
  }, [])

  const downloadStateFor = React.useCallback((paper: PastPaper): PaperDownloadState => {
    if (downloadProgress.has(paper.id)) return "downloading"
    return localPapers[paper.id] ? "downloaded" : "idle"
  }, [downloadProgress, localPapers])

  const handleDownload = React.useCallback(async (paper: PastPaper) => {
    const ok = await downloadPaper(paper)
    if (ok) toast.success(`${paper.title} saved to this device`)
  }, [downloadPaper])

  /** Opening requires the paper on the device first — that is what "download" bought. */
  const openPaper = React.useCallback(async (paper: PastPaper) => {
    noteInteraction(paper.id)
    if (!localPapers[paper.id]) {
      const ok = await downloadPaper(paper)
      if (!ok) return
    }
    setReading(paper)
  }, [downloadPaper, localPapers, noteInteraction])

  /**
   * The open every card actually calls.
   *
   * A paper written for a syllabus that has since ended still teaches something, but sitting one
   * unknowingly is how a student spends three hours on content their course dropped. The warning
   * asks once, per open, and is a preference because a student revising an unchanged topic has good
   * reason to turn it off.
   */
  const requestOpen = React.useCallback((paper: PastPaper) => {
    const era = state.eras.find((candidate) => candidate.id === paper.syllabusEraId)
    if (preferences.warnOffSyllabus && era !== undefined && era.endYear !== null) {
      setSyllabusPrompt({ paper, description: era.description })
      return
    }
    void openPaper(paper)
  }, [openPaper, preferences.warnOffSyllabus, state.eras])

  const completeSetup = React.useCallback((profile: PastPapersProfile) => {
    void savePreferences({
      onboardingCompleted: true,
      yearLevel: profile.yearLevel,
      subjectSlugs: profile.subjectSlugs,
    })
    setSetupOpen(false)
    seeded.current = true
    setQuery((current) => ({
      ...current,
      yearLevel: profile.yearLevel ?? undefined,
      subjects: profile.subjectSlugs,
    }))
  }, [savePreferences])

  const library = React.useMemo(() => {
    const records = Object.values(localPapers)
    return { count: records.length, bytes: records.reduce((total, record) => total + record.bytes, 0) }
  }, [localPapers])

  /*
   * Two different counts, deliberately.
   *
   * The Downloaded listing is served from the account's stored copies, so its badge has to count
   * those or the number and the list disagree — a paper downloaded on a phone belongs in the list
   * on a laptop. The footer's "on this device" figure stays the local one, because that is the
   * thing it is actually reporting.
   */
  const cachedCount = React.useMemo(
    () => state.saves.filter((save) => save.storagePath !== null).length,
    [state.saves],
  )

  const activeFilters = countActiveFilters(query)
  // Withheld until settings are known, so a student who has already done the setup never sees it
  // flash past on a slow connection.
  const showSetup = setupOpen || (preferencesLoaded && !preferences.onboardingCompleted)

  if (reading) {
    return (
      <DashboardPage>
        {/* The viewer sizes itself against this box, so the box has to be the one that stops
            growing. Left scrollable, the reader stretched to the height of every page in the paper
            and took its floating toolbar off the bottom of the screen with it. */}
        <DashboardPageBody scroll={false} className="flex min-h-0 flex-col">
          <PastPaperReader
            paper={reading}
            preferences={preferences}
            onBack={() => setReading(null)}
            onAttemptFinished={() => {
              toast.success("Attempt recorded")
              void refreshLibrary()
            }}
          />
        </DashboardPageBody>
      </DashboardPage>
    )
  }

  if (showSetup) {
    return (
      <DashboardPage>
        <DashboardPageHeader title="Past papers" description="Set this up once." />
        <DashboardPageBody>
          <PastPapersOnboarding
            subjects={state.facets.subjects}
            detectedYearLevel={detectedYearLevel}
            initial={{ yearLevel: preferences.yearLevel, subjectSlugs: preferences.subjectSlugs }}
            onComplete={completeSetup}
            onSkip={() => {
              void savePreferences({ onboardingCompleted: true })
              setSetupOpen(false)
            }}
          />
        </DashboardPageBody>
      </DashboardPage>
    )
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Past papers"
        description={VIEW_DESCRIPTIONS[view]}
        actions={(
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Redo past papers setup"
                  onClick={() => setSetupOpen(true)}
                />
              }
            >
              <IconSettings className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Change year level and subjects</TooltipContent>
          </Tooltip>
        )}
      />

      <DashboardPageBody>
        <div className="flex min-h-0 w-full gap-6">
          <PastPapersSidebar
            view={view}
            onViewChange={changeView}
            folderId={query.folderId}
            onFolderChange={changeFolder}
            folders={state.folders}
            saves={state.saves}
            ladderCount={state.ladders.length}
            downloadedCount={cachedCount}
            onDeviceCount={library.count}
            onDeviceBytes={library.bytes}
            onChanged={refreshLibrary}
            onShareFolder={(folder) => setShareTarget({ kind: "folder", id: folder.id, title: folder.name })}
          />

          {view === "ladders" ? (
            <div className="min-w-0 flex-1">
              <LadderBuilder
                ladders={state.ladders}
                papers={state.papers}
                savedPaperIds={state.savedPaperIds}
                onChanged={refreshLibrary}
                onShare={(ladder) => setShareTarget({ kind: "ladder", id: ladder.id, title: ladder.title })}
                onOpenPaper={requestOpen}
              />
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[14rem] flex-1">
                  <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    className="pl-8"
                    placeholder="Search subject, school or year"
                    aria-label="Search papers"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>

                <Select
                  value={query.sort}
                  onValueChange={(value: string | null) => {
                    if (value) setQuery((current) => ({ ...current, sort: value as PaperSort }))
                  }}
                >
                  <SelectTrigger className="w-[11rem]" aria-label="Sort papers">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAPER_SORT_LABELS) as PaperSort[]).map((sort) => (
                      <SelectItem key={sort} value={sort}>{PAPER_SORT_LABELS[sort]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setFiltersOpen(true)}
                >
                  <IconAdjustmentsHorizontal className="size-4" />
                  Filters
                  {activeFilters > 0 ? (
                    <Badge variant="secondary" className="ml-0.5 px-1.5">{activeFilters}</Badge>
                  ) : null}
                </Button>

                {activeFilters > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Clear filters"
                    onClick={() => setQuery((current) => ({
                      ...EMPTY_QUERY,
                      // The sidebar owns these; a filter reset must not silently move the student
                      // out of the folder they are looking at.
                      sort: current.sort,
                      folderId: current.folderId,
                      savedOnly: current.savedOnly,
                      downloadedOnly: current.downloadedOnly,
                    }))}
                  >
                    <IconX className="size-4" />
                  </Button>
                ) : null}
              </div>

              {view === "browse" && query.folderId === null
                && preferences.showPickedForYou && canRecommend
                && state.recommendations.length > 0 ? (
                  <React.Suspense fallback={null}>
                    <PickedForYouSection
                      recommendations={state.recommendations}
                      savedPaperIds={state.savedPaperIds}
                      loading={state.loading}
                      showEstimatedDifficulty={preferences.showEstimatedDifficulty}
                      onOpen={requestOpen}
                      onToggleSave={toggleSave}
                    />
                  </React.Suspense>
                ) : null}

              <PaperResults
                papers={state.papers}
                loading={state.loading}
                loadingMore={state.loadingMore}
                hasMore={state.hasMore}
                emptyMessage={VIEW_EMPTY[view]}
                savedPaperIds={state.savedPaperIds}
                eras={state.eras}
                showEstimatedDifficulty={preferences.showEstimatedDifficulty}
                downloadStateFor={downloadStateFor}
                progressFor={(paper) => downloadProgress.get(paper.id) ?? null}
                onOpen={requestOpen}
                onToggleSave={toggleSave}
                onDownload={handleDownload}
                onLoadMore={loadMore}
              />

              {!canRecommend && preferences.showPickedForYou && state.papers.length > 0 ? (
                <p className="pb-2 text-center text-xs text-muted-foreground">
                  Open {RECOMMENDATION_INTERACTION_THRESHOLD - interactionCount} more{" "}
                  {RECOMMENDATION_INTERACTION_THRESHOLD - interactionCount === 1 ? "paper" : "papers"}
                  {" "}and this page will start suggesting what to sit next.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </DashboardPageBody>

      <PastPaperFilterDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        query={query}
        facets={state.facets}
        eras={state.eras}
        detectedYearLevel={preferences.yearLevel ?? detectedYearLevel}
        onApply={setQuery}
      />

      {syllabusPrompt ? (
        <AlertDialog open onOpenChange={(next: boolean) => { if (!next) setSyllabusPrompt(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>This paper is on an older syllabus</AlertDialogTitle>
              <AlertDialogDescription>
                {syllabusPrompt.description} Some of what it asks may no longer be examinable.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSyllabusPrompt(null)}>Choose another</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                onClick={() => {
                  const { paper } = syllabusPrompt
                  setSyllabusPrompt(null)
                  void openPaper(paper)
                }}
              >
                Open anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {shareTarget ? (
        <SharePapersDialog target={shareTarget} onClose={() => setShareTarget(null)} />
      ) : null}
    </DashboardPage>
  )
}

const VIEW_DESCRIPTIONS: Record<PastPapersView, string> = {
  browse: "Every paper in the index. Star one to keep it, and it downloads in the background.",
  starred: "Papers you have starred. Each one is on this device unless its source refused.",
  downloaded: "Papers already fetched for your account. On this device they open instantly and work offline.",
  ladders: "Ordered runs of papers, built to work up to a full one.",
}

const VIEW_EMPTY: Record<PastPapersView, string> = {
  browse: "Try widening the year range or clearing a filter.",
  starred: "Star a paper from Browse and it will appear here.",
  downloaded: "Nothing downloaded yet. Starring a paper downloads it.",
  ladders: "Build a ladder from the papers you have starred.",
}

/**
 * The results grid.
 *
 * Ungrouped and uniform: every card is one paper, ordered exactly as the sort says, with no
 * headings interrupting the sequence. Grouping made the order unreadable — a list sorted by
 * difficulty still appeared in school order, because the headings imposed their own.
 */
function PaperResults({
  papers,
  loading,
  loadingMore,
  hasMore,
  emptyMessage,
  savedPaperIds,
  eras,
  showEstimatedDifficulty,
  downloadStateFor,
  progressFor,
  onOpen,
  onToggleSave,
  onDownload,
  onLoadMore,
}: {
  papers: readonly PastPaper[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  emptyMessage: string
  savedPaperIds: ReadonlySet<string>
  eras: React.ComponentProps<typeof PastPaperCard>["eras"]
  showEstimatedDifficulty: boolean
  downloadStateFor: (paper: PastPaper) => PaperDownloadState
  progressFor: (paper: PastPaper) => number | null
  onOpen: (paper: PastPaper) => void
  onToggleSave: (paper: PastPaper) => void
  onDownload: (paper: PastPaper) => void
  onLoadMore: () => void
}) {
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  /**
   * Fetches the next page as the foot of the list comes into view.
   *
   * The margin is deliberately generous: the request has to be in flight before the reader reaches
   * the bottom, or every page boundary is a visible stall. Re-created whenever `onLoadMore`
   * changes, which is how a filter change stops the observer asking for pages of the old query.
   */
  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => { if (entry.isIntersecting) onLoadMore() }),
      { rootMargin: "600px 0px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore])

  if (loading) {
    return (
      <div className={GRID_CLASS}>
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} className="h-[13rem] rounded-xl" />
        ))}
      </div>
    )
  }

  if (papers.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <IconFileText className="size-6 text-muted-foreground" />
          <EmptyTitle>No papers here</EmptyTitle>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={GRID_CLASS}>
        {papers.map((paper) => (
          /*
           * `content-visibility` lets the browser skip layout and paint for cards scrolled out of
           * view, which is most of them on a long listing. The intrinsic size is what keeps the
           * scrollbar honest while they are skipped — without it the page height jumps as cards
           * come and go, and a slow device is exactly where that is worst.
           */
          <div
            key={paper.id}
            className="[contain-intrinsic-size:auto_13rem] [content-visibility:auto]"
          >
            <PastPaperCard
              paper={paper}
              saved={savedPaperIds.has(paper.id)}
              showEstimatedDifficulty={showEstimatedDifficulty}
              downloadState={downloadStateFor(paper)}
              progress={progressFor(paper)}
              eras={eras}
              onOpen={onOpen}
              onToggleSave={onToggleSave}
              onDownload={onDownload}
            />
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className="flex items-center justify-center pb-2 text-xs text-muted-foreground">
        {loadingMore ? (
          <span className="flex items-center gap-1.5">
            <IconLoader2 className="size-3.5 animate-spin" /> Loading more
          </span>
        ) : hasMore ? (
          <Button type="button" variant="ghost" size="sm" onClick={onLoadMore}>Load more</Button>
        ) : (
          <span>Showing all {papers.length} papers</span>
        )}
      </div>
    </div>
  )
}

/** Auto-fill rather than fixed columns, so the grid uses whatever width the dashboard gives it. */
const GRID_CLASS = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))]"

/** Only the controls the filter dialog owns; the sidebar's own narrowing is not a "filter". */
function countActiveFilters(query: PastPapersQuery): number {
  return [
    query.yearLevel !== undefined,
    query.subjects.length > 0,
    query.categories.length > 0,
    query.schools.length > 0,
    query.difficulty.length > 0,
    query.yearFrom !== null,
    query.yearTo !== null,
    query.era !== null,
    query.requireSolutions,
  ].filter(Boolean).length
}

// Split out so the picked-for-you row does not pull the scroll area into the initial dashboard
// chunk, which is already large.
const PickedForYouSection = React.lazy(() =>
  import("./PickedForYou").then((module) => ({ default: module.PickedForYou })))
