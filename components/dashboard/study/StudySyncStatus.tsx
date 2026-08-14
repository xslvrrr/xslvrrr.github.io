"use client"

import { IconCloudCheck, IconCloudOff, IconLoader2, IconRefresh } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { StudyOfflineConflict, StudyOfflineStatus } from "@/lib/study/desktop-sync"

interface StudySyncStatusProps {
  isOnline: boolean
  isSyncing: boolean
  status: StudyOfflineStatus | null
  conflicts: StudyOfflineConflict[]
  onSync: () => void
  onDiscardConflict: (operationId: string) => void
}

const CONFLICT_REASONS: Record<string, string> = {
  STUDY_CONFLICT: "This card was reviewed on another device first. The server history was kept.",
  STUDY_NOT_FOUND: "This card no longer exists, so the review could not be applied.",
  STUDY_OPERATION_REJECTED: "The server declined this review.",
  STUDY_INVALID_INPUT: "This review could not be read by the server.",
}

function describeConflict(conflict: StudyOfflineConflict): string {
  return CONFLICT_REASONS[conflict.lastErrorCode ?? ""] ?? "This review could not be applied."
}

function formatTimestamp(value: string | null): string {
  if (!value) return "never"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "never" : parsed.toLocaleString()
}

export function StudySyncStatus({
  isOnline,
  isSyncing,
  status,
  conflicts,
  onSync,
  onDiscardConflict,
}: StudySyncStatusProps) {
  if (!status) return null

  const pending = status.pendingCount
  const summary = pending === 0
    ? "All reviews are saved to your account."
    : `${pending} review${pending === 1 ? "" : "s"} saved on this device, waiting to sync.`

  return (
    <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isOnline ? <IconCloudCheck aria-hidden /> : <IconCloudOff aria-hidden />}
          Offline reviews
        </CardTitle>
        <CardDescription role="status" aria-live="polite">
          {isOnline ? "Connected." : "No connection. Reviews are stored on this device."} {summary}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-1 text-sm text-[var(--text-tertiary)] sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="font-medium text-[var(--text-primary)]">Last synced</dt>
            <dd>{formatTimestamp(status.lastPulledAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-[var(--text-primary)]">Cards stored here</dt>
            <dd>{status.cardCount}</dd>
          </div>
        </dl>

        <div>
          <Button variant="outline" size="sm" disabled={!isOnline || isSyncing} onClick={onSync}>
            {isSyncing ? <IconLoader2 className="animate-spin" /> : <IconRefresh />}
            Sync now
          </Button>
          {!isOnline ? (
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              Syncing resumes automatically when the connection returns. Nothing is lost in the meantime.
            </p>
          ) : null}
        </div>

        {conflicts.length > 0 ? (
          <section aria-label="Reviews that need attention" className="grid gap-2 border-t border-[var(--border-default)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {conflicts.length} review{conflicts.length === 1 ? "" : "s"} need attention
            </h3>
            <p className="text-sm text-[var(--text-tertiary)]">
              These reviews were kept instead of being applied. Your saved history was not changed.
            </p>
            <ul className="grid gap-2">
              {conflicts.map((conflict) => (
                <li
                  key={conflict.operationId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-default)] p-3"
                >
                  <div className="text-sm">
                    <p className="text-[var(--text-primary)]">{describeConflict(conflict)}</p>
                    <p className="text-[var(--text-tertiary)]">
                      Recorded {formatTimestamp(conflict.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDiscardConflict(conflict.operationId)}
                  >
                    Discard this review
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
