"use client"

import * as React from "react"
import { IconArrowRight, IconSparkles, IconClockHour4 } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { UPCOMING_CHANGELOG_NOTICE_KEY, dismissNotice, isNoticeDismissed } from "@/lib/one-time-notices"
import { NEXT_RELEASE_AT, UPCOMING_HEADLINE } from "@/lib/changelog"

import { AnnouncementCard, announcementStyles as styles } from "./AnnouncementCard"

interface UpcomingAnnouncementProps {
  /** Scopes the dismissal so shared devices do not hide the teaser for the next account. */
  userId?: string | null
  /** Set false for marketing previews and any surface that must not touch browser storage. */
  enabled?: boolean
}

/**
 * Bottom-right teaser pointing at `/changelog`. It mirrors the guided-tour announcement, but runs
 * the artwork in greyscale at roughly half speed so it reads as "not here yet".
 *
 * The action is a plain anchor rather than a router link: this renders under both the Next pages
 * router and the TanStack router, and neither one's link primitive is available in both.
 */
export function UpcomingAnnouncement({
  userId,
  enabled = true,
}: UpcomingAnnouncementProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) {
      setIsOpen(false)
      return
    }
    const hasShipped = Date.now() >= Date.parse(NEXT_RELEASE_AT)
    setIsOpen(!hasShipped && !isNoticeDismissed(UPCOMING_CHANGELOG_NOTICE_KEY, userId))
  }, [enabled, userId])

  const handleDismiss = React.useCallback(() => {
    setIsOpen(false)
    dismissNotice(UPCOMING_CHANGELOG_NOTICE_KEY, userId)
  }, [userId])

  if (!enabled) return null

  return (
    <AnnouncementCard
      isOpen={isOpen}
      titleId="upcoming-announcement-title"
      badge="Coming soon"
      title={UPCOMING_HEADLINE}
      description="A rebuilt platform, a desktop app, and a lot more. See the countdown and what's landing."
      tone="muted"
      orbitIcon={<IconClockHour4 className={styles.orbitIcon} stroke={1.75} />}
      sealIcon={<IconSparkles stroke={2.25} />}
      dismissLabel="Dismiss upcoming release announcement"
      onDismiss={handleDismiss}
      action={
        <Button className={styles.action} asChild>
          <a href="/changelog" onClick={handleDismiss}>
            View the changelog
            <IconArrowRight data-icon="inline-end" />
          </a>
        </Button>
      }
    />
  )
}
