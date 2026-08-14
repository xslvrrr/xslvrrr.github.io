import { useCallback, useEffect, useRef, useState } from 'react'

import type { DocumentAnnotation } from '@/lib/pdf/annotations'

/**
 * Undo and redo for document annotations.
 *
 * The viewer does not own its annotations — reports and past papers each load and persist their
 * own — so history cannot live in a reducer beside the data. It is kept here as two stacks of
 * whole annotation lists instead: a list is a few hundred bytes per mark, the operations are
 * coarse (one stroke, one erase, one text edit), and a snapshot stack cannot drift out of step
 * with a parent that also writes the array directly.
 *
 * Only deliberate edits are recorded. The parent's own `setAnnotations` when a document's stored
 * marks arrive from the server is not an edit the reader made, and undoing back to the empty list
 * the viewer mounted with would silently wipe marks they never touched.
 */

/** Deep enough for a drawing session, shallow enough that the stack stays small. */
const HISTORY_LIMIT = 100

export interface AnnotationHistory {
  /** Applies an edit and records the previous state. Use for every user-driven change. */
  commit: (next: DocumentAnnotation[]) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useAnnotationHistory(
  documentId: string,
  annotations: DocumentAnnotation[],
  onAnnotationsChange: (next: DocumentAnnotation[]) => void,
): AnnotationHistory {
  const past = useRef<DocumentAnnotation[][]>([])
  const future = useRef<DocumentAnnotation[][]>([])

  // The stacks are refs so a commit does not depend on a render having flushed, but the toolbar
  // has to grey out its buttons, so depth is mirrored into state.
  const [depths, setDepths] = useState({ past: 0, future: 0 })

  // Read at commit time rather than captured, so `commit` keeps a stable identity across renders
  // and does not re-register every pointer handler in the viewer on each stroke.
  const currentRef = useRef(annotations)
  currentRef.current = annotations

  const changeRef = useRef(onAnnotationsChange)
  changeRef.current = onAnnotationsChange

  // A different document is a different history. Carrying the stack across would let undo paste
  // one document's marks onto another.
  useEffect(() => {
    past.current = []
    future.current = []
    setDepths({ past: 0, future: 0 })
  }, [documentId])

  const sync = useCallback(() => {
    setDepths({ past: past.current.length, future: future.current.length })
  }, [])

  const commit = useCallback((next: DocumentAnnotation[]) => {
    past.current = [...past.current, currentRef.current].slice(-HISTORY_LIMIT)
    future.current = []
    sync()
    changeRef.current(next)
  }, [sync])

  const undo = useCallback(() => {
    const previous = past.current[past.current.length - 1]
    if (!previous) return
    past.current = past.current.slice(0, -1)
    future.current = [...future.current, currentRef.current].slice(-HISTORY_LIMIT)
    sync()
    changeRef.current(previous)
  }, [sync])

  const redo = useCallback(() => {
    const next = future.current[future.current.length - 1]
    if (!next) return
    future.current = future.current.slice(0, -1)
    past.current = [...past.current, currentRef.current].slice(-HISTORY_LIMIT)
    sync()
    changeRef.current(next)
  }, [sync])

  return { commit, undo, redo, canUndo: depths.past > 0, canRedo: depths.future > 0 }
}
