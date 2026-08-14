"use client"

import * as React from "react"
import { IconArrowUpRight, IconLoader2 } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cutoverStudy, migrateStudy } from "@/lib/study/client"

interface StudyUpgradeNoticeProps {
  /** Called once the account is on normalized storage, so the shell can reload. */
  onUpgraded: () => void
}

type Stage = "idle" | "copying" | "switching" | "done"

const STAGE_LABELS: Record<Stage, string> = {
  idle: "",
  copying: "Copying your cards…",
  switching: "Switching over…",
  done: "Done. Reloading your cards…",
}

/**
 * The legacy Study page has no other route onto normalized storage, so an account
 * with the deployment switch enabled would otherwise stay on the old experience
 * indefinitely. Copy first, verify, then switch — never the other way round.
 */
export function StudyUpgradeNotice({ onUpgraded }: StudyUpgradeNoticeProps) {
  const [stage, setStage] = React.useState<Stage>("idle")
  const [error, setError] = React.useState<string | null>(null)

  const isBusy = stage === "copying" || stage === "switching"

  const upgrade = async () => {
    setError(null)
    try {
      setStage("copying")
      await migrateStudy()
      setStage("switching")
      await cutoverStudy()
      setStage("done")
      onUpgraded()
    } catch (cause: unknown) {
      setStage("idle")
      setError(cause instanceof Error
        ? cause.message
        : "The upgrade could not be completed. Your existing cards are unchanged.")
    }
  }

  return (
    <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
      <CardHeader>
        <CardTitle>A new Study is ready for your account</CardTitle>
        <CardDescription>
          Scheduling that adapts to how reliably you recall each card, a card browser, statistics,
          exam plans, and sharing. Your existing cards are copied across and checked before anything
          switches over, and nothing is deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error ? (
          <p className="text-sm text-[var(--text-primary)]" role="alert">{error}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={isBusy} onClick={() => void upgrade()}>
            {isBusy ? <IconLoader2 className="animate-spin" /> : <IconArrowUpRight />}
            Upgrade Study
          </Button>
          {stage !== "idle" ? (
            <span className="text-sm text-[var(--text-tertiary)]" role="status" aria-live="polite">
              {STAGE_LABELS[stage]}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">
          Review history is preserved. This runs once for your account and takes a few seconds.
        </p>
      </CardContent>
    </Card>
  )
}
