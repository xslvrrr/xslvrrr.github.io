"use client"

import * as React from "react"
import { IconArrowRight, IconCheck, IconRefresh } from "@tabler/icons-react"

import { AnnouncementCard, announcementStyles as styles } from "@/components/announcements/AnnouncementCard"
import { Button } from "@/components/ui/button"

interface TourAnnouncementProps {
  isOpen: boolean
  title?: string
  description?: string
  actionLabel?: string
  kind?: "welcome" | "update"
  onStart: () => void
  onDismiss: () => void
}

export function TourAnnouncement({
  isOpen,
  title = "Millennium updated",
  description = "See what changed, or explore every part of your dashboard.",
  actionLabel = "Take a tour",
  kind = "update",
  onStart,
  onDismiss,
}: TourAnnouncementProps): React.ReactElement | null {
  return (
    <AnnouncementCard
      isOpen={isOpen}
      titleId="tour-announcement-title"
      badge={kind === "welcome" ? "Welcome" : "What's new"}
      title={title}
      description={description}
      orbitIcon={<IconRefresh className={styles.orbitIcon} stroke={1.75} />}
      sealIcon={<IconCheck stroke={2.25} />}
      dismissLabel="Dismiss update announcement"
      onDismiss={onDismiss}
      action={
        <Button onClick={onStart} className={styles.action}>
          {actionLabel}
          <IconArrowRight data-icon="inline-end" />
        </Button>
      }
    />
  )
}
