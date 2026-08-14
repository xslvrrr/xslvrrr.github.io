import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { IconLayoutRows, IconLayoutColumns, IconX } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Report } from '@/types/portal'
import { ReportDocumentView } from './ReportDocumentView'
import {
  MAX_PANES, clampRatio, countLeaves,
  type PaneNode, type SplitOrientation,
} from './reportPaneTree'
import styles from './ReportSplitView.module.css'

/** Below this width a pane hides the annotation tools so the zoom controls still fit. */
const COMPACT_PANE_WIDTH = 520

interface ReportSplitViewProps {
  root: PaneNode
  reportsById: ReadonlyMap<string, Report>
  /** Reports offered in each pane's picker, in display order. */
  selectableReports: readonly { id: string; label: string }[]
  onSplit: (leafId: string, orientation: SplitOrientation) => void
  onClose: (leafId: string) => void
  onSelectReport: (leafId: string, reportId: string) => void
  onRatioChange: (splitId: string, ratio: number) => void
}

export function ReportSplitView({
  root,
  reportsById,
  selectableReports,
  onSplit,
  onClose,
  onSelectReport,
  onRatioChange,
}: ReportSplitViewProps) {
  const paneCount = countLeaves(root)

  return (
    <div className={styles.root}>
      <PaneRenderer
        node={root}
        paneCount={paneCount}
        reportsById={reportsById}
        selectableReports={selectableReports}
        onSplit={onSplit}
        onClose={onClose}
        onSelectReport={onSelectReport}
        onRatioChange={onRatioChange}
      />
    </div>
  )
}

type PaneRendererProps = Omit<ReportSplitViewProps, 'root'> & {
  node: PaneNode
  paneCount: number
}

function PaneRenderer(props: PaneRendererProps) {
  const { node } = props
  return node.kind === 'leaf' ? <PaneLeafView {...props} node={node} /> : <PaneSplitView {...props} node={node} />
}

function PaneSplitView({ node, onRatioChange, ...rest }: PaneRendererProps & { node: Extract<PaneNode, { kind: 'split' }> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isVertical = node.orientation === 'vertical'

  const handleDividerDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = containerRef.current
    if (!container) return

    event.currentTarget.setPointerCapture(event.pointerId)

    const move = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const ratio = isVertical
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height
      onRatioChange(node.id, clampRatio(ratio))
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }, [isVertical, node.id, onRatioChange])

  const firstSize = `${node.ratio * 100}%`

  return (
    <div ref={containerRef} className={styles.split} data-orientation={node.orientation}>
      <div className={styles.splitChild} style={isVertical ? { width: firstSize } : { height: firstSize }}>
        <PaneRenderer {...rest} node={node.first} onRatioChange={onRatioChange} />
      </div>
      <div
        className={styles.divider}
        data-orientation={node.orientation}
        role="separator"
        aria-orientation={isVertical ? 'vertical' : 'horizontal'}
        aria-label="Resize panes"
        onPointerDown={handleDividerDrag}
      />
      <div className={styles.splitChild} style={{ flex: 1 }}>
        <PaneRenderer {...rest} node={node.second} onRatioChange={onRatioChange} />
      </div>
    </div>
  )
}

function PaneLeafView({
  node,
  paneCount,
  reportsById,
  selectableReports,
  onSplit,
  onClose,
  onSelectReport,
}: PaneRendererProps & { node: Extract<PaneNode, { kind: 'leaf' }> }) {
  const paneRef = useRef<HTMLDivElement>(null)
  const [isCompact, setIsCompact] = useState(false)
  const report = node.reportId ? reportsById.get(node.reportId) : undefined
  const canSplit = paneCount < MAX_PANES

  // Splitting and divider drags both resize a pane, so width is watched rather than derived
  // from the pane count.
  useEffect(() => {
    const element = paneRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setIsCompact(entry.contentRect.width < COMPACT_PANE_WIDTH)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={paneRef} className={styles.pane}>
      <div className={styles.paneHeader}>
        <Select
          value={node.reportId ?? ''}
          onValueChange={(reportId) => { if (reportId) onSelectReport(node.id, reportId) }}
        >
          <SelectTrigger aria-label="Report shown in this pane" className={styles.panePicker}>
            <SelectValue placeholder="Choose a report" />
          </SelectTrigger>
          <SelectContent>
            {selectableReports.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className={styles.paneControls}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Split right"
            title="Split right"
            disabled={!canSplit}
            onClick={() => onSplit(node.id, 'vertical')}
          >
            <IconLayoutColumns size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Split down"
            title="Split down"
            disabled={!canSplit}
            onClick={() => onSplit(node.id, 'horizontal')}
          >
            <IconLayoutRows size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close pane"
            title="Close pane"
            disabled={paneCount < 2}
            onClick={() => onClose(node.id)}
          >
            <IconX size={16} />
          </Button>
        </div>
      </div>

      <div className={styles.paneBody}>
        {report ? (
          <ReportDocumentView key={report.id} report={report} compact={isCompact} />
        ) : (
          <p className={styles.paneEmpty}>Choose a report to show in this pane.</p>
        )}
      </div>
    </div>
  )
}
