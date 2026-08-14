import { useCallback, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  IconArrowLeft, IconCalendar, IconCheck, IconExternalLink, IconFileText,
  IconLayoutColumns, IconLayoutRows, IconPencil,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useAnimationSettings } from "@/hooks/useAnimationSettings"
import styles from "@/styles/Dashboard.module.css"
import viewerStyles from "./ReportsPage.module.css"
import type { Report } from "@/types/portal"
import { openExternal } from "@/lib/desktop/utils"
import { reportDisplayName } from "@/lib/report-names"
import { getApprovedReportUrl } from "@/lib/report-urls"
import { ReportSplitView } from "./ReportSplitView"
import {
  MAX_PANES, closeLeaf, collectLeaves, countLeaves, createLeaf,
  setLeafReport, setSplitRatio, splitLeaf,
  type PaneNode, type SplitOrientation,
} from "./reportPaneTree"

interface ReportsPageProps {
  reports: Report[]
}

/** Only stored PDFs can be rendered in a pane; portal-hosted links open externally. */
function isViewable(report: Report): boolean {
  return Boolean(report.storagePath && report.id)
}

function groupReportsByYear(reports: Report[]): Record<number, Report[]> {
  return reports.reduce<Record<number, Report[]>>((grouped, report) => {
    const year = report.calendarYear || 0
    if (!grouped[year]) grouped[year] = []
    grouped[year].push(report)
    return grouped
  }, {})
}

function ReportAction({ report, onOpen }: { report: Report; onOpen: () => void }) {
  if (isViewable(report)) {
    return (
      <Button size="sm" data-tour-id="report-annotate" onClick={onOpen}>
        <IconPencil /> Open & annotate
      </Button>
    )
  }

  const approvedUrl = getApprovedReportUrl(report.url)
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!approvedUrl}
      onClick={() => { if (approvedUrl) void openExternal(approvedUrl) }}
    >
      {approvedUrl ? 'View PDF' : 'PDF unavailable'} <IconExternalLink size={14} />
    </Button>
  )
}

export function ReportsPage({ reports }: ReportsPageProps) {
  const [paneTree, setPaneTree] = useState<PaneNode | null>(null)
  const [isSelectingComparison, setIsSelectingComparison] = useState(false)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const { animationsEnabled } = useAnimationSettings()

  const viewableReports = useMemo(() => reports.filter(isViewable), [reports])

  const reportsById = useMemo(() => {
    const lookup = new Map<string, Report>()
    viewableReports.forEach((report) => { if (report.id) lookup.set(report.id, report) })
    return lookup
  }, [viewableReports])

  const selectableReports = useMemo(
    () => viewableReports.map((report) => ({ id: report.id!, label: reportDisplayName(report) })),
    [viewableReports]
  )

  const reportsByYear = groupReportsByYear(reports)
  const sortedYears = Object.keys(reportsByYear).map(Number).sort((a, b) => b - a)

  const openSingle = useCallback((report: Report) => {
    if (!report.id) return
    setPaneTree(createLeaf(report.id))
    setIsSelectingComparison(false)
    setComparisonIds([])
  }, [])

  const openComparison = useCallback(() => {
    if (comparisonIds.length !== 2) return
    const first = createLeaf(comparisonIds[0])
    setPaneTree(splitLeaf(first, first.id, 'vertical', comparisonIds[1]))
    setIsSelectingComparison(false)
  }, [comparisonIds])

  /**
   * Splitting adds a pane; it never changes what the pane being split is showing.
   *
   * The new pane opens on the first report that is not already on screen, so a split immediately
   * shows two different documents. Defaulting to the first report in the list put the same document
   * in both halves, which read as the view having switched rather than divided.
   */
  const handleSplit = useCallback((leafId: string, orientation: SplitOrientation) => {
    setPaneTree((current) => {
      if (!current) return current
      const shown = new Set(collectLeaves(current).map((leaf) => leaf.reportId).filter(Boolean))
      const nextReport = selectableReports.find((option) => !shown.has(option.id))
        ?? selectableReports[0]
      return splitLeaf(current, leafId, orientation, nextReport?.id ?? null)
    })
  }, [selectableReports])

  const handleClosePane = useCallback((leafId: string) => {
    setPaneTree((current) => (current ? closeLeaf(current, leafId) : current))
  }, [])

  const handleSelectPaneReport = useCallback((leafId: string, reportId: string) => {
    setPaneTree((current) => (current ? setLeafReport(current, leafId, reportId) : current))
  }, [])

  const handleRatioChange = useCallback((splitId: string, ratio: number) => {
    setPaneTree((current) => (current ? setSplitRatio(current, splitId, ratio) : current))
  }, [])

  // Choosing a third report drops the oldest pick, so the pair is always the two latest choices.
  const toggleComparisonId = (reportId: string) => {
    setComparisonIds((current) => (current.includes(reportId)
      ? current.filter((entry) => entry !== reportId)
      : [...current, reportId].slice(-2)))
  }

  /** Splitting from the header divides the first pane, which is the one the reader opened. */
  const splitFirstPane = useCallback((orientation: SplitOrientation) => {
    setPaneTree((current) => {
      if (!current) return current
      const [firstLeaf] = collectLeaves(current)
      if (!firstLeaf) return current
      const shown = new Set(collectLeaves(current).map((leaf) => leaf.reportId).filter(Boolean))
      const nextReport = selectableReports.find((option) => !shown.has(option.id))
        ?? selectableReports[0]
      return splitLeaf(current, firstLeaf.id, orientation, nextReport?.id ?? null)
    })
  }, [selectableReports])

  const transition = animationsEnabled
    ? { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const }
    : { duration: 0 }

  return (
    // Opening and closing a report is a mode change on the same page rather than a navigation, so
    // it is animated here: the archive fades back and the viewer rises into place, and the reverse
    // on the way out. `mode="wait"` keeps the two from overlapping in the content frame.
    <AnimatePresence initial={false} mode="wait">
      {paneTree ? (
        <motion.div
          key="viewer"
          className={viewerStyles.viewerShell}
          data-tour-id="page-reports"
          initial={animationsEnabled ? { opacity: 0, y: 12, scale: 0.99 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={animationsEnabled ? { opacity: 0, y: 12, scale: 0.99 } : { opacity: 0 }}
          transition={transition}
        >
          <div className={viewerStyles.viewerHeader}>
            <Button variant="ghost" size="sm" onClick={() => setPaneTree(null)}>
              <IconArrowLeft size={16} /> All reports
            </Button>
            <div className={viewerStyles.viewerActions}>
              <Button
                variant="outline"
                size="sm"
                disabled={countLeaves(paneTree) >= MAX_PANES || selectableReports.length === 0}
                onClick={() => splitFirstPane('vertical')}
              >
                <IconLayoutColumns size={16} /> Split right
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={countLeaves(paneTree) >= MAX_PANES || selectableReports.length === 0}
                onClick={() => splitFirstPane('horizontal')}
              >
                <IconLayoutRows size={16} /> Split down
              </Button>
            </div>
            <span className={viewerStyles.viewerHint}>
              Every pane can be split again from its own header. Ctrl or ⌘ with scroll zooms; pinch
              works on touch.
            </span>
          </div>
          <ReportSplitView
            root={paneTree}
            reportsById={reportsById}
            selectableReports={selectableReports}
            onSplit={handleSplit}
            onClose={handleClosePane}
            onSelectReport={handleSelectPaneReport}
            onRatioChange={handleRatioChange}
          />
        </motion.div>
      ) : (
        <motion.div
          key="archive"
          className={styles.contentWrapper}
          data-tour-id="page-reports"
          initial={animationsEnabled ? { opacity: 0, y: -8 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={animationsEnabled ? { opacity: 0, y: -8 } : { opacity: 0 }}
          transition={transition}
        >
          <div className={styles.contentWrapperInner}>
            {viewableReports.length >= 2 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {isSelectingComparison ? (
                  <>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {comparisonIds.length < 2
                        ? `Choose ${2 - comparisonIds.length} more report${comparisonIds.length === 1 ? '' : 's'} to compare`
                        : 'Two reports selected'}
                    </span>
                    <Button size="sm" disabled={comparisonIds.length !== 2} onClick={openComparison}>
                      <IconLayoutColumns size={16} /> Open split view
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setIsSelectingComparison(false); setComparisonIds([]) }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setIsSelectingComparison(true)}>
                    <IconLayoutColumns size={16} /> Compare two reports
                  </Button>
                )}
              </div>
            )}

            {reports.length > 0 ? (
              sortedYears.map((year) => (
                <div key={year} className={styles.reportsYearGroup}>
                  <h3 className={styles.reportsYearHeader}>{year}</h3>
                  <div className={styles.reportsGrid}>
                    {reportsByYear[year]
                      .sort((a, b) => b.semester - a.semester)
                      .map((report, index) => {
                        const key = report.id || `${report.calendarYear}-${report.semester}-${index}`
                        const selectable = isSelectingComparison && isViewable(report)
                        const selected = Boolean(report.id && comparisonIds.includes(report.id))
                        return (
                          <div
                            key={key}
                            className={styles.reportCard}
                            data-comparison-selected={selected || undefined}
                            style={selected ? { outline: '2px solid var(--primary)', outlineOffset: '2px' } : undefined}
                          >
                            <div className={styles.reportCardHeader}>
                              <div className={`${styles.reportCardIcon} ${report.semester === 1 ? styles.semester1 : styles.semester2}`}>
                                <IconFileText size={24} />
                              </div>
                              <div className={styles.reportCardMeta}>
                                <div className={styles.reportCardYear}>{report.yearLevel}</div>
                                <div className={styles.reportCardSemester}>Semester {report.semester}</div>
                              </div>
                            </div>
                            <div className={styles.reportCardContent}>
                              {/* The portal's own name for the report, not a shape derived from
                                  whatever its link text happened to parse into. */}
                              <div className={styles.reportCardTitle}>{reportDisplayName(report)}</div>
                              <div className={styles.reportCardSubtitle}>
                                <IconCalendar size={14} />
                                {report.calendarYear}
                              </div>
                            </div>
                            <div className={styles.reportCardAction}>
                              {isSelectingComparison ? (
                                <Button
                                  size="sm"
                                  variant={selected ? 'default' : 'outline'}
                                  disabled={!selectable}
                                  onClick={() => { if (report.id) toggleComparisonId(report.id) }}
                                >
                                  {selected ? <><IconCheck size={16} /> Selected</> : selectable ? 'Select' : 'Not comparable'}
                                </Button>
                              ) : (
                                <ReportAction report={report} onOpen={() => openSingle(report)} />
                              )}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <IconFileText size={48} stroke={1} />
                  </EmptyMedia>
                  <EmptyTitle>No Reports Available</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
