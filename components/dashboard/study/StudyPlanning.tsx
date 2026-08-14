"use client"

import * as React from "react"
import { IconCopy, IconLoader2, IconShare, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import DateSelector from "@/components/Calendar/DateSelector"
import { StudyTabLoading } from "@/components/dashboard/study/StudyTabLoading"
import {
  fetchStudyPlanning,
  publishStudyDeck,
  revokeStudyPublication,
  saveStudyExamPlan,
  subscribeToStudyDeck,
  type StudyPlanningSnapshot,
} from "@/lib/study/client"
import type { StudyDeckSummary } from "@/lib/study/domain"
import { buildStudyExamOutlook } from "@/lib/study/exam-plans"

function toDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

interface StudyPlanningProps {
  decks: StudyDeckSummary[]
  selectedDeckId: string | null
  onChanged: () => void
}

export function StudyPlanning({ decks, selectedDeckId, onChanged }: StudyPlanningProps) {
  const [snapshot, setSnapshot] = React.useState<StudyPlanningSnapshot | null>(null)
  const [title, setTitle] = React.useState("")
  // The picker always shows a day, so seed the state with the one it shows.
  const [examDate, setExamDate] = React.useState(() => toDateInput(new Date()))
  const [planDeckId, setPlanDeckId] = React.useState(selectedDeckId ?? decks[0]?.id ?? "")
  const [dailyMinutes, setDailyMinutes] = React.useState(20)
  const [shareCode, setShareCode] = React.useState("")
  const [targetDeckId, setTargetDeckId] = React.useState(selectedDeckId ?? decks[0]?.id ?? "")
  const [isBusy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const reload = React.useCallback(async (deckIds: string[]) => {
    try {
      setSnapshot(await fetchStudyPlanning(deckIds))
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to load exam plans.")
    }
  }, [])

  React.useEffect(() => { void reload(planDeckId ? [planDeckId] : []) }, [planDeckId, reload])

  const savePlan = async () => {
    setBusy(true)
    try {
      await saveStudyExamPlan({
        planId: crypto.randomUUID(),
        title: title.trim(),
        examDate,
        deckIds: planDeckId ? [planDeckId] : [],
        dailyMinutes,
        targetRetention: 0.9,
      })
      setTitle("")
      setError(null)
      await reload(planDeckId ? [planDeckId] : [])
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That plan could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  const publish = async (deckId: string) => {
    setBusy(true)
    try {
      const result = await publishStudyDeck({ deckId })
      setNotice(`Share code ${result.shareCode} — version ${result.version}, ${result.noteCount} cards.`)
      setError(null)
      await reload(planDeckId ? [planDeckId] : [])
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That set could not be shared.")
    } finally {
      setBusy(false)
    }
  }

  const subscribe = async () => {
    setBusy(true)
    try {
      const result = await subscribeToStudyDeck({ shareCode: shareCode.trim(), deckId: targetDeckId })
      setNotice(result.addedNotes === 0
        ? "You already have every card from that shared set."
        : `Added ${result.addedNotes} card${result.addedNotes === 1 ? "" : "s"} from version ${result.version}.`)
      setShareCode("")
      setError(null)
      onChanged()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That share code could not be used.")
    } finally {
      setBusy(false)
    }
  }

  const coverage = snapshot?.coverage

  if (!snapshot && !error) return <StudyTabLoading label="Loading exam plans and shared sets" />

  return (
    <div className="grid gap-5">
      {error ? <p className="text-sm" role="alert">{error}</p> : null}
      {notice ? <p className="text-sm" role="status" aria-live="polite">{notice}</p> : null}

      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>Exam plans</CardTitle>
          <CardDescription>
            A plan is arithmetic on your own cards and the time you said you have. It does not
            predict a result.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="plan-title">What is the exam?</Label>
              <Input
                id="plan-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Biology unit test"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-date">Date</Label>
              <DateSelector id="plan-date" value={examDate} onChange={setExamDate} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-deck">Set</Label>
              <Select
                value={planDeckId}
                onValueChange={(value: string | null) => setPlanDeckId(value ?? "")}
              >
                <SelectTrigger id="plan-deck"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {decks.map((deck) => (
                    <SelectItem key={deck.id} value={deck.id}>{deck.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-minutes">Minutes a day</Label>
              <Input
                id="plan-minutes"
                type="number"
                min={1}
                max={1440}
                value={dailyMinutes}
                onChange={(event) => setDailyMinutes(Number(event.target.value))}
              />
            </div>
          </div>

          <div>
            <Button disabled={isBusy || !title.trim() || !examDate} onClick={() => void savePlan()}>
              {isBusy ? <IconLoader2 className="animate-spin" /> : null} Save plan
            </Button>
          </div>

          {snapshot && snapshot.plans.length > 0 && coverage ? (
            <ul className="grid gap-3">
              {snapshot.plans.map((plan) => {
                const outlook = buildStudyExamOutlook(plan, coverage, new Date())
                return (
                  <li className="rounded-lg border border-[var(--border-default)] p-3" key={plan.id}>
                    <p className="font-medium text-[var(--text-primary)]">{plan.title}</p>
                    <p className="text-sm text-[var(--text-primary)]">{outlook.headline}</p>
                    <p className="text-sm text-[var(--text-tertiary)]">{outlook.detail}</p>
                    {outlook.action ? (
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{outlook.action}</p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>Share a set</CardTitle>
          <CardDescription>
            Sharing sends the cards only. Your review history and schedule stay private, and someone
            who takes a copy gets their own schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-2">
              <Label htmlFor="share-deck">Set to share</Label>
              <Select
                value={planDeckId}
                onValueChange={(value: string | null) => setPlanDeckId(value ?? "")}
              >
                <SelectTrigger id="share-deck" className="w-60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {decks.map((deck) => (
                    <SelectItem key={deck.id} value={deck.id}>{deck.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={isBusy || !planDeckId} onClick={() => void publish(planDeckId)}>
              <IconShare /> Publish a version
            </Button>
          </div>

          {snapshot && snapshot.publications.length > 0 ? (
            <ul className="grid gap-2">
              {snapshot.publications.map((publication) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] p-3"
                  key={publication.id}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{publication.title}</p>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      Version {publication.currentVersion} · code {publication.shareCode}
                    </p>
                  </div>
                  {/* Revoking removes the link from this list: it can no longer be copied,
                      re-shared, or restored, so leaving it here is only clutter. */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void navigator.clipboard.writeText(publication.shareCode)}
                    >
                      <IconCopy /> Copy code
                    </Button>
                    <Button
                      aria-label={`Revoke sharing for ${publication.title}`}
                      size="icon-sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => void revokeStudyPublication(publication.id)
                        .then(() => reload(planDeckId ? [planDeckId] : []))}
                    >
                      <IconTrash />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-3 border-t border-[var(--border-default)] pt-4">
            <div className="grid gap-2">
              <Label htmlFor="subscribe-code">Add a shared set</Label>
              <Input
                id="subscribe-code"
                value={shareCode}
                onChange={(event) => setShareCode(event.target.value)}
                placeholder="Paste a share code"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-2">
                <Label htmlFor="subscribe-deck">Add the cards to</Label>
                <Select
                  value={targetDeckId}
                  onValueChange={(value: string | null) => setTargetDeckId(value ?? "")}
                >
                  <SelectTrigger id="subscribe-deck" className="w-60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {decks.map((deck) => (
                      <SelectItem key={deck.id} value={deck.id}>{deck.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={isBusy || !shareCode.trim() || !targetDeckId} onClick={() => void subscribe()}>
                Add cards
              </Button>
            </div>
            <p className="text-sm text-[var(--text-tertiary)]">
              Adding an updated version brings in new cards only. Cards you already have keep their
              schedule.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
