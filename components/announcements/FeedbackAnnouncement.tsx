"use client"

import * as React from "react"
import { IconArrowRight, IconBug, IconSend } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { FEEDBACK_NOTICE_KEY, dismissNotice, isNoticeDismissed } from "@/lib/one-time-notices"

import { AnnouncementCard, announcementStyles as styles } from "./AnnouncementCard"
import feedbackStyles from "./FeedbackAnnouncement.module.css"

interface FeedbackAnnouncementProps {
  /** Scopes the dismissal so a shared device does not hide the notice for the next account. */
  userId?: string | null
  /** Set false for marketing previews and any surface that must not touch browser storage. */
  enabled?: boolean
  /** Opens the report dialog. Dismissing the announcement happens either way. */
  onOpenFeedback: () => void
}

/**
 * Points at the new "Bugs/Suggestions" sidebar button, once per account.
 *
 * It reuses the shared announcement surface so it matches the "Millennium updated" card, but swaps
 * the artwork for a scene about reporting: a form filling itself in and the report being sent.
 */
export function FeedbackAnnouncement({
  userId,
  enabled = true,
  onOpenFeedback,
}: FeedbackAnnouncementProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) {
      setIsOpen(false)
      return
    }
    setIsOpen(!isNoticeDismissed(FEEDBACK_NOTICE_KEY, userId))
  }, [enabled, userId])

  const handleDismiss = React.useCallback(() => {
    setIsOpen(false)
    dismissNotice(FEEDBACK_NOTICE_KEY, userId)
  }, [userId])

  if (!enabled) return null

  return (
    <AnnouncementCard
      isOpen={isOpen}
      titleId="feedback-announcement-title"
      badge="New"
      title="Found a bug? Got an idea?"
      description="Report it from the sidebar. Every bug report and suggestion reaches the team directly."
      orbitIcon={<IconBug className={styles.orbitIcon} stroke={1.75} />}
      sealIcon={<IconSend stroke={2.25} />}
      dismissLabel="Dismiss bugs and suggestions announcement"
      onDismiss={handleDismiss}
      scene={
        <>
          <div className={feedbackStyles.inbox}>
            <span />
            <span />
          </div>
          <div className={feedbackStyles.form}>
            <div className={feedbackStyles.formHeader}>
              <span />
              <span />
              <span />
            </div>
            <div className={feedbackStyles.formBody}>
              <span className={feedbackStyles.answer} />
              <span className={feedbackStyles.answer} />
              <span className={feedbackStyles.answer} />
            </div>
          </div>
          <div className={feedbackStyles.ticket}>
            <span />
            <span />
          </div>
        </>
      }
      action={
        <Button
          className={styles.action}
          onClick={() => {
            handleDismiss()
            onOpenFeedback()
          }}
        >
          Send a report
          <IconArrowRight data-icon="inline-end" />
        </Button>
      }
    />
  )
}
