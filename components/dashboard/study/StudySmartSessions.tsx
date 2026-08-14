"use client"

import * as React from "react"
import { IconLoader2, IconPlayerPlay, IconTrash } from "@tabler/icons-react"

import { StudyTabLoading } from "@/components/dashboard/study/StudyTabLoading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  deleteStudySmartSession,
  fetchStudySmartSessions,
  runStudySmartSession,
  saveStudySmartSession,
} from "@/lib/study/client"
import type { StudyQueueItem } from "@/lib/study/domain"
import { STUDY_SESSION_PRESETS, type StudySmartSession } from "@/lib/study/smart-sessions"

interface StudySmartSessionsProps {
  onStart: (title: string, items: StudyQueueItem[], explanation: string) => void
}

export function StudySmartSessions({ onStart }: StudySmartSessionsProps) {
  const [sessions, setSessions] = React.useState<StudySmartSession[]>([])
  const [queryText, setQueryText] = React.useState("is:due")
  const [saveName, setSaveName] = React.useState("")
  const [isBusy, setBusy] = React.useState(false)
  const [isLoading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setSessions(await fetchStudySmartSessions())
    } catch {
      // A failed list is not worth interrupting the page; running a query still works.
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void reload() }, [reload])

  const run = async (text: string, strategy: "adaptive" | "blocked" | "mixed", title: string) => {
    setBusy(true)
    try {
      const result = await runStudySmartSession({
        queryText: text,
        orderingStrategy: strategy,
        seed: `${title}:${new Date().toDateString()}`,
      })
      setError(null)
      if (result.items.length === 0) {
        setNotice("No cards match this session right now.")
        return
      }
      setNotice(null)
      onStart(title, result.items, result.explanation)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That session could not be run.")
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      await saveStudySmartSession({
        sessionId: crypto.randomUUID(),
        name: saveName.trim(),
        description: "",
        queryText: queryText.trim(),
        orderingStrategy: "adaptive",
        configuration: { limit: 60, includeNew: true },
      })
      setSaveName("")
      setError(null)
      await reload()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That session could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>Focused sessions</CardTitle>
          <CardDescription>
            Pick a plan, or write your own search. Sessions never demand that you clear everything.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? <p className="text-sm" role="alert">{error}</p> : null}
          {notice ? <p className="text-sm" role="status" aria-live="polite">{notice}</p> : null}

          <ul className="grid gap-2 sm:grid-cols-2">
            {STUDY_SESSION_PRESETS.map((preset) => (
              <li
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border-default)] p-3"
                key={preset.id}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{preset.name}</p>
                  <p className="text-sm text-[var(--text-tertiary)]">{preset.description}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => void run(preset.queryText, preset.orderingStrategy, preset.name)}
                >
                  <IconPlayerPlay /> Start
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>Write your own</CardTitle>
          <CardDescription>
            Fields: deck, tag, type, is, lapses, stability, difficulty, reps, added, rated.
            Combine with spaces, OR between values of one field, and a leading minus to exclude.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="study-session-query">Search</Label>
            <Input
              id="study-session-query"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder='is:due tag:unit-1 -is:suspended'
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button disabled={isBusy || !queryText.trim()}
              onClick={() => void run(queryText.trim(), "adaptive", "Custom session")}>
              {isBusy ? <IconLoader2 className="animate-spin" /> : <IconPlayerPlay />}
              Run
            </Button>
            <div className="grid gap-2">
              <Label htmlFor="study-session-name">Save as</Label>
              <Input
                id="study-session-name"
                className="w-52"
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                placeholder="Weak biology cards"
              />
            </div>
            <Button variant="outline" disabled={isBusy || !saveName.trim() || !queryText.trim()}
              onClick={() => void save()}>
              Save session
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <StudyTabLoading label="Loading your saved sessions" /> : null}

      {!isLoading && sessions.length > 0 ? (
        <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
          <CardHeader>
            <CardTitle>Saved sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {sessions.map((session) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] p-3"
                  key={session.id}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{session.name}</p>
                    <p className="truncate text-sm text-[var(--text-tertiary)]">{session.queryText}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void run(session.queryText, session.orderingStrategy, session.name)}
                    >
                      <IconPlayerPlay /> Start
                    </Button>
                    <Button
                      aria-label={`Delete saved session ${session.name}`}
                      size="icon-sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => void deleteStudySmartSession(session.id).then(reload)}
                    >
                      <IconTrash />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
