"use client"

import * as React from "react"
import {
  IconBrandGithub,
  IconExternalLink,
  IconMessageCircle,
  IconRefresh,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { fetchGithubIssues } from "@/components/feedback/feedbackAdminClient"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { GithubIssueSummary } from "@/lib/feedback/github"

type IssueState = "open" | "closed" | "all"

const STATE_OPTIONS: readonly { value: IssueState; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
]

function issueDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString()
}

/**
 * The repository's issues, read from inside the administrator page.
 *
 * The token that fetches them never leaves the server; this only renders the summary the API
 * returns, and links out for anything that needs GitHub itself.
 */
export function GithubIssuesSettings(): React.ReactElement {
  const [issues, setIssues] = React.useState<GithubIssueSummary[]>([])
  const [repository, setRepository] = React.useState("")
  const [state, setState] = React.useState<IssueState>("open")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async (next: IssueState, signal?: AbortSignal) => {
    setLoading(true)
    try {
      const listing = await fetchGithubIssues(next, signal)
      setIssues(listing.issues)
      setRepository(listing.repository)
      setError(null)
    } catch (caught) {
      if (signal?.aborted) return
      const message = caught instanceof Error ? caught.message : "The issue list could not be loaded."
      setError(message)
      toast.error(message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(state, controller.signal)
    return () => controller.abort()
  }, [load, state])

  return (
    <Card data-settings-anchor="admin-github-issues">
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconBrandGithub className="text-[var(--accent-color)]" size={18} />
              GitHub issues
            </CardTitle>
            <CardDescription>
              Issues on {repository || "the configured repository"}, including the ones opened from
              accepted reports.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={state} onValueChange={(next) => setState(next as IssueState)}>
              <SelectTrigger aria-label="Issue state" size="sm" className="w-28">
                <SelectValue>
                  {(selected) => STATE_OPTIONS.find((option) => option.value === selected)?.label ?? "Open"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              aria-label="Refresh issues"
              disabled={loading}
              onClick={() => void load(state)}
              size="icon"
              variant="outline"
            >
              <IconRefresh className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {loading && issues.length === 0 ? (
          [0, 1, 2].map((item) => <Skeleton className="h-14 w-full" key={item} />)
        ) : error ? (
          <div className="rounded-lg border border-border bg-muted/25 p-4 text-sm text-muted-foreground">
            {error}
          </div>
        ) : issues.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/25 p-4 text-center text-sm text-muted-foreground">
            No {state === "all" ? "" : state} issues on this repository.
          </div>
        ) : (
          issues.map((issue) => (
            <a
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/25 p-3 transition-colors hover:bg-muted/50"
              href={issue.url}
              key={issue.number}
              rel="noreferrer noopener"
              target="_blank"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{issue.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>#{issue.number}</span>
                  <Badge variant={issue.state === "open" ? "default" : "secondary"}>{issue.state}</Badge>
                  {issue.labels.slice(0, 3).map((label) => (
                    <Badge key={label} variant="outline">{label}</Badge>
                  ))}
                  {issue.comments > 0 ? (
                    <span className="flex items-center gap-1">
                      <IconMessageCircle size={12} />
                      {issue.comments}
                    </span>
                  ) : null}
                  {issueDate(issue.createdAt) ? <span>{issueDate(issue.createdAt)}</span> : null}
                </div>
              </div>
              <IconExternalLink className="mt-0.5 shrink-0 text-muted-foreground" size={15} />
            </a>
          ))
        )}
      </CardContent>
    </Card>
  )
}
