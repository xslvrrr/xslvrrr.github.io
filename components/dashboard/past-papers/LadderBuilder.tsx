import * as React from "react"
import {
  IconArrowDown, IconArrowUp, IconCheck, IconPlus, IconShare3, IconStairs, IconTrash, IconWand,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PAPER_DIFFICULTY_BANDS, PAPER_DIFFICULTY_LABELS, type PastPaper } from "@/lib/past-papers/domain"
import type { PaperLadder } from "@/lib/past-papers/repository-library"

interface LadderBuilderProps {
  ladders: readonly PaperLadder[]
  papers: readonly PastPaper[]
  savedPaperIds: ReadonlySet<string>
  onChanged: () => Promise<void> | void
  onShare: (ladder: PaperLadder) => void
  onOpenPaper: (paper: PastPaper) => void
}

/**
 * The difficulty ladder builder.
 *
 * A ladder is an ordered run of papers meant to be sat in sequence, easiest first. The ordering is
 * the whole artefact — it encodes a plan for getting from where a student is to where the exam
 * will be — so the editor is built around moving steps rather than around adding them.
 */
export function LadderBuilder({
  ladders,
  papers,
  savedPaperIds,
  onChanged,
  onShare,
  onOpenPaper,
}: LadderBuilderProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<{ title: string; steps: string[] }>({ title: "", steps: [] })
  const [saving, setSaving] = React.useState(false)

  const papersById = React.useMemo(
    () => new Map(papers.map((paper) => [paper.id, paper])),
    [papers],
  )

  const startNew = () => {
    setEditingId("new")
    setDraft({ title: "", steps: [] })
  }

  const startEdit = (ladder: PaperLadder) => {
    setEditingId(ladder.id)
    setDraft({ title: ladder.title, steps: ladder.steps.map((step) => step.paperId) })
  }

  const save = async () => {
    if (!draft.title.trim()) {
      toast.error("Give the ladder a name")
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/past-papers/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "ladder",
          ...(editingId && editingId !== "new" ? { id: editingId } : {}),
          title: draft.title.trim(),
          description: "",
          subjectSlug: papersById.get(draft.steps[0] ?? "")?.subjectSlug ?? "",
          steps: draft.steps.map((paperId) => ({
            paperId,
            targetMinutes: papersById.get(paperId)?.durationMinutes ?? null,
            note: "",
            completed: false,
          })),
        }),
      })
      const payload = await response.json().catch(() => null) as { success?: boolean; message?: string } | null
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "Could not save that ladder")

      await onChanged()
      setEditingId(null)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not save that ladder")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (ladder: PaperLadder) => {
    try {
      const response = await fetch("/api/past-papers/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "ladder", id: ladder.id }),
      })
      if (!response.ok) throw new Error("Could not delete that ladder")
      await onChanged()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not delete that ladder")
    }
  }

  const move = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const next = [...current.steps]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...current, steps: next }
    })
  }

  /**
   * Orders the current steps easiest to hardest.
   *
   * Papers with no difficulty are left where they are rather than pushed to an end — an unrated
   * paper is not an easy one, and sorting it to the front would put an unknown quantity first in a
   * sequence whose entire purpose is a known gradient.
   */
  const autoOrder = () => {
    setDraft((current) => {
      const rank = (paperId: string): number => {
        const band = papersById.get(paperId)?.difficulty?.band
        return band ? PAPER_DIFFICULTY_BANDS.indexOf(band) : 2
      }
      return { ...current, steps: [...current.steps].sort((a, b) => rank(a) - rank(b)) }
    })
  }

  const candidates = papers.filter(
    (paper) => savedPaperIds.has(paper.id) && !draft.steps.includes(paper.id) && paper.documentKind === "paper",
  )

  if (editingId !== null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draft.title}
            className="max-w-sm"
            placeholder="Ladder name, e.g. Physics to Band 6"
            aria-label="Ladder name"
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={autoOrder}>
            <IconWand className="size-4" /> Order by difficulty
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
              <IconCheck className="size-4" /> Save
            </Button>
          </div>
        </div>

        <ol className="flex flex-col gap-2">
          {draft.steps.map((paperId, index) => {
            const paper = papersById.get(paperId)
            return (
              <li
                key={paperId}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="w-6 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{paper?.title ?? "Paper no longer in the index"}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[paper?.subject, paper?.school, paper?.year].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {paper?.difficulty ? (
                  <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px]">
                    {PAPER_DIFFICULTY_LABELS[paper.difficulty.band]}
                  </Badge>
                ) : null}
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button" variant="ghost" size="icon" className="size-7 [&_svg]:size-3.5"
                    aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}
                  ><IconArrowUp /></Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="size-7 [&_svg]:size-3.5"
                    aria-label="Move down" disabled={index === draft.steps.length - 1}
                    onClick={() => move(index, 1)}
                  ><IconArrowDown /></Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="size-7 [&_svg]:size-3.5"
                    aria-label="Remove step"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      steps: current.steps.filter((id) => id !== paperId),
                    }))}
                  ><IconTrash /></Button>
                </div>
              </li>
            )
          })}
        </ol>

        <Select
          value=""
          onValueChange={(paperId: string | null) => {
            if (!paperId) return
            setDraft((current) => ({ ...current, steps: [...current.steps, paperId] }))
          }}
        >
          <SelectTrigger aria-label="Add a saved paper">
            <SelectValue placeholder={candidates.length > 0 ? "Add a saved paper…" : "Save some papers first"} />
          </SelectTrigger>
          <SelectContent>
            {candidates.slice(0, 100).map((paper) => (
              <SelectItem key={paper.id} value={paper.id}>
                {[paper.subject, paper.school, paper.year].filter(Boolean).join(" · ")} — {paper.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Build a run of papers to sit in order, from approachable to exam-hard.
        </p>
        <Button type="button" size="sm" className="gap-1.5" onClick={startNew}>
          <IconPlus className="size-4" /> New ladder
        </Button>
      </div>

      {ladders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <IconStairs className="size-6 text-muted-foreground" />
            <EmptyTitle>No ladders yet</EmptyTitle>
            <EmptyDescription>
              Save a few papers, then arrange them into a sequence you can work through.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        ladders.map((ladder) => (
          <Card key={ladder.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{ladder.title}</CardTitle>
                  <CardDescription>
                    {ladder.steps.length} {ladder.steps.length === 1 ? "paper" : "papers"}
                    {ladder.steps.filter((step) => step.completedAt).length > 0
                      ? ` · ${ladder.steps.filter((step) => step.completedAt).length} done`
                      : ""}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onShare(ladder)}>
                    <IconShare3 className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(ladder)}>Edit</Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="size-8 [&_svg]:size-4"
                    aria-label={`Delete ${ladder.title}`} onClick={() => void remove(ladder)}
                  ><IconTrash /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-1">
                {ladder.steps.map((step, index) => {
                  const paper = papersById.get(step.paperId)
                  return (
                    <li key={`${step.paperId}-${index}`} className="flex items-center gap-2 text-sm">
                      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      {paper ? (
                        <button
                          type="button"
                          className="truncate text-left hover:underline"
                          onClick={() => onOpenPaper(paper)}
                        >{paper.title}</button>
                      ) : (
                        <span className="truncate text-muted-foreground">Paper no longer in the index</span>
                      )}
                      {step.completedAt ? <IconCheck className="size-3.5 shrink-0 text-primary" /> : null}
                    </li>
                  )
                })}
              </ol>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
