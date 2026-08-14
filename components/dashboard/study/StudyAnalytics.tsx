"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  buildStudyInsights,
  studyHeatmapLevel,
  studyRetentionEstimate,
  type StudyAnalytics as StudyAnalyticsData,
} from "@/lib/study/analytics"
import { fetchStudyAnalytics } from "@/lib/study/client"
import { StudyTabLoading } from "@/components/dashboard/study/StudyTabLoading"

const HEATMAP_BACKGROUNDS = [
  "bg-[var(--hover-bg)]",
  "bg-[color-mix(in_oklch,var(--accent-color),transparent_75%)]",
  "bg-[color-mix(in_oklch,var(--accent-color),transparent_55%)]",
  "bg-[color-mix(in_oklch,var(--accent-color),transparent_30%)]",
  "bg-[var(--accent-color)]",
] as const

function formatDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString()
}

export function StudyAnalytics() {
  const [analytics, setAnalytics] = React.useState<StudyAnalyticsData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showTable, setShowTable] = React.useState(false)

  React.useEffect(() => {
    let active = true
    void fetchStudyAnalytics()
      .then((result) => { if (active) setAnalytics(result) })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Failed to load Study statistics.")
      })
    return () => { active = false }
  }, [])

  if (error) return <p className="text-sm" role="alert">{error}</p>
  if (!analytics) return <StudyTabLoading label="Loading your review statistics" />

  const insights = buildStudyInsights(analytics)
  const retention = studyRetentionEstimate(analytics)
  const busiestDay = analytics.history.reduce((most, day) => Math.max(most, day.reviews), 0)
  const activeDays = analytics.history.filter((day) => day.reviews > 0).length

  return (
    <div className="grid gap-5">
      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>What the numbers mean</CardTitle>
          <CardDescription>
            Estimated from your own reviews over the last {analytics.historyDays} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-4">
            {insights.map((insight) => (
              <li key={insight.id}>
                <p className="font-medium text-[var(--text-primary)]">{insight.headline}</p>
                <p className="text-sm text-[var(--text-tertiary)]">{insight.meaning}</p>
                {insight.action ? (
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{insight.action}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-[var(--text-tertiary)]">Reviews</dt>
              <dd className="text-2xl tabular-nums">{analytics.totals.reviewCount}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--text-tertiary)]">Time studied</dt>
              <dd className="text-2xl tabular-nums">{Math.round(analytics.totals.studyMinutes)} min</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--text-tertiary)]">Recall estimate</dt>
              <dd className="text-2xl tabular-nums">
                {retention === null ? "—" : `${Math.round(retention * 100)}%`}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--text-tertiary)]">Days studied</dt>
              <dd className="text-2xl tabular-nums">{activeDays}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>Review activity</CardTitle>
          <CardDescription>
            Each square is one day. The count is also written out in the list below, so colour is
            never the only way to read it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="overflow-x-auto">
            <ul className="flex flex-wrap gap-1" aria-hidden>
              {analytics.history.map((day) => (
                <li
                  className={`size-4 rounded-sm ${HEATMAP_BACKGROUNDS[studyHeatmapLevel(day.reviews, busiestDay)]}`}
                  key={day.date}
                  title={`${formatDate(day.date)}: ${day.reviews} reviews`}
                />
              ))}
            </ul>
          </div>

          <Button size="sm" variant="outline" onClick={() => setShowTable((current) => !current)}>
            {showTable ? "Hide exact numbers" : "Show exact numbers"}
          </Button>

          {showTable ? (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableCaption className="sr-only">Reviews and minutes studied per day</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reviews</TableHead>
                    <TableHead>Minutes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...analytics.history].reverse().filter((day) => day.reviews > 0).map((day) => (
                    <TableRow key={day.date}>
                      <TableCell>{formatDate(day.date)}</TableCell>
                      <TableCell className="tabular-nums">{day.reviews}</TableCell>
                      <TableCell className="tabular-nums">{day.minutes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
        <CardHeader>
          <CardTitle>What is coming</CardTitle>
          <CardDescription>
            Cards your current schedule will ask for. This assumes you add no new cards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption className="sr-only">
              Cards due per day for the next {analytics.forecastDays} days
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Cards due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.forecast.slice(0, 14).map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{formatDate(day.date)}</TableCell>
                  <TableCell className="tabular-nums">{day.due}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
