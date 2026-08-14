import { useCallback, useEffect, useRef, useState } from 'react'

import { PdfDocumentView } from '@/components/pdf/PdfDocumentView'
import type { DocumentAnnotation } from '@/lib/pdf/annotations'
import type { Report } from '@/types/portal'

interface ReportDocumentViewProps {
  report: Report
  /** Hides the annotation tools when a pane is too small to draw in comfortably. */
  compact?: boolean
}

/**
 * A report's PDF, annotated.
 *
 * The viewer itself is shared with past papers — same zoom behaviour, same text selection, same
 * annotation tools — so this component is only the report-shaped part: where the file comes from,
 * and where the marks are stored.
 */
export function ReportDocumentView({ report, compact = false }: ReportDocumentViewProps) {
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A report without an id cannot be fetched or annotated, and the viewer renders its own empty
  // state for it rather than issuing requests against an undefined key.
  const reportId = report.id ?? ''

  useEffect(() => {
    if (!reportId) return

    let cancelled = false
    void fetch(`/api/reports/annotations?reportId=${encodeURIComponent(reportId)}`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load annotations')
        return response.json()
      })
      .then((payload: { annotations?: unknown }) => {
        if (cancelled) return
        setAnnotations(fromStored(payload.annotations, reportId))
      })
      .catch(() => {
        // The document is still worth reading without its marks, and the next successful save
        // restores them; failing the whole pane over annotations would be worse.
      })

    return () => {
      cancelled = true
      setAnnotations([])
    }
  }, [reportId])

  const handleChange = useCallback((next: DocumentAnnotation[]) => {
    setAnnotations(next)
    if (!reportId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void fetch('/api/reports/annotations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, annotations: next.map(toStored) }),
      })
    }, 500)
  }, [reportId])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  return (
    <PdfDocumentView
      documentId={reportId}
      url={report.storagePath && reportId ? `/api/reports/pdf?id=${encodeURIComponent(reportId)}` : ''}
      annotations={annotations}
      onAnnotationsChange={handleChange}
      compact={compact}
      emptyMessage="This report has no stored PDF."
    />
  )
}

/**
 * Annotations were stored against `reportId` before the viewer was shared with past papers, and
 * rows written then are still in the table. Reading maps the old field onto the shared one so
 * existing marks keep rendering; writing emits both so a rollback does not orphan them.
 */
function fromStored(value: unknown, reportId: string): DocumentAnnotation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): DocumentAnnotation[] => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    if (!Array.isArray(record.points) || record.points.length === 0) return []

    return [{
      id: String(record.id ?? ''),
      documentId: String(record.documentId ?? record.reportId ?? reportId),
      page: Number(record.page) || 1,
      kind: (record.kind as DocumentAnnotation['kind']) ?? 'draw',
      points: record.points as DocumentAnnotation['points'],
      text: typeof record.text === 'string' ? record.text : undefined,
      color: typeof record.color === 'string' ? record.color : '#ef4444',
      strokeWidth: Number(record.strokeWidth) || 3,
    }]
  }).filter((entry) => entry.id !== '')
}

function toStored(annotation: DocumentAnnotation): Record<string, unknown> {
  return { ...annotation, reportId: annotation.documentId }
}
