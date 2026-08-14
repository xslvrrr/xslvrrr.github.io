"use client"

import * as React from "react"
import { IconLoader2, IconStar, IconStarFilled } from "@tabler/icons-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import styles from "./SectionBump.module.css"

interface SectionBumpProps {
  sectionId: string
  sectionTitle: string
  count: number
  hasBumped: boolean
  remaining: number
  maxBumps: number
  isReady: boolean
  isSubmitting: boolean
  onConfirm: (sectionId: string) => Promise<unknown>
}

function bumpLabel(count: number): string {
  return `${count} ${count === 1 ? "bump" : "bumps"}`
}

/**
 * Star control shown beside each changelog section. The confirmation step exists because the
 * allowance is small and spending one is not reversible.
 */
export function SectionBump({
  sectionId,
  sectionTitle,
  count,
  hasBumped,
  remaining,
  maxBumps,
  isReady,
  isSubmitting,
  onConfirm,
}: SectionBumpProps): React.ReactElement {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  const isExhausted = remaining <= 0
  const isDisabled = !isReady || isSubmitting || hasBumped || isExhausted

  const tooltip = hasBumped
    ? "You bumped this feature"
    : isExhausted
      ? "No bumps remaining"
      : "I like this feature"

  const handleConfirm = async () => {
    await onConfirm(sectionId)
    setIsDialogOpen(false)
  }

  return (
    <>
      <Tooltip>
        {/* Base UI composes through `render`, not Radix's `asChild`. The trigger's children become
            the rendered element's children, which is why the button is passed empty here. */}
        <TooltipTrigger
          render={
            <button
              type="button"
              className={styles.bump}
              data-bumped={hasBumped ? "true" : undefined}
              disabled={isDisabled}
              aria-label={`${tooltip}: ${sectionTitle}. ${bumpLabel(count)}.`}
              onClick={() => setIsDialogOpen(true)}
            />
          }
        >
          {hasBumped ? (
            <IconStarFilled className={styles.bumpIcon} />
          ) : (
            <IconStar className={styles.bumpIcon} stroke={1.75} />
          )}
          <span className={styles.bumpCount}>{isReady ? count : "–"}</span>
        </TooltipTrigger>
        <TooltipContent className={styles.bumpTooltip}>{tooltip}</TooltipContent>
      </Tooltip>

      <AlertDialog
        open={isDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!isSubmitting) setIsDialogOpen(nextOpen)
        }}
      >
        {/* Styling is restated locally because this dialog portals outside the marketing page. */}
        <AlertDialogContent className={styles.dialog}>
          <AlertDialogHeader>
            <AlertDialogTitle className={styles.dialogTitle}>Bump “{sectionTitle}”?</AlertDialogTitle>
            <AlertDialogDescription className={styles.dialogDescription}>
              You have {remaining} of {maxBumps} {remaining === 1 ? "bump" : "bumps"} remaining. Bumps
              cannot be taken back, so spend them on the features you most want to see.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={styles.dialogCancel} disabled={isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className={styles.dialogAction}
              onClick={() => void handleConfirm()}
              disabled={isSubmitting}
            >
              {isSubmitting ? <IconLoader2 size={15} className={styles.spin} /> : <IconStarFilled size={15} />}
              Bump it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
