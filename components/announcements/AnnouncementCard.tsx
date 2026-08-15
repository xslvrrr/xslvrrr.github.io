"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { useAnnouncementSlot } from "./announcementQueue"
import styles from "./Announcement.module.css"

export type AnnouncementTone = "accent" | "muted"

export interface AnnouncementCardProps {
  isOpen: boolean
  titleId: string
  badge: string
  title: string
  description: string
  /** Rendered inside the footer. Callers supply a `Button` so they own the click or link target. */
  action: React.ReactNode
  dismissLabel: string
  onDismiss: () => void
  /** `muted` renders the artwork in greyscale and runs the loop at roughly half speed. */
  tone?: AnnouncementTone
  /** Icon shown inside the orbiting ring. */
  orbitIcon: React.ReactNode
  /** Icon shown inside the completion seal. */
  sealIcon: React.ReactNode
  /**
   * Replaces the default dashboard-panels artwork. Supply one when the announcement is about
   * something the panels do not depict; the orbit ring and seal stay in place either way.
   */
  scene?: React.ReactNode
}

/**
 * Fixed bottom-right announcement surface shared by the guided-tour prompt and the
 * upcoming-release teaser. It only handles chrome and motion; callers own copy and actions.
 */
export function AnnouncementCard({
  isOpen,
  titleId,
  badge,
  title,
  description,
  action,
  dismissLabel,
  onDismiss,
  tone = "accent",
  orbitIcon,
  sealIcon,
  scene,
}: AnnouncementCardProps): React.ReactPortal | null {
  // `titleId` is already unique per announcement, so it doubles as the queue's claim key.
  const hasSlot = useAnnouncementSlot(titleId, isOpen)
  if (!hasSlot || typeof document === "undefined") return null

  const isMuted = tone === "muted"

  return createPortal(
    <Card
      className={`${styles.card} ${isMuted ? styles.cardMuted : ""}`}
      role="region"
      aria-labelledby={titleId}
    >
      <div className={`${styles.visual} ${isMuted ? styles.visualMuted : ""}`}>
        <div className={styles.grid} aria-hidden="true" />
        <div className={styles.glow} aria-hidden="true" />
        <span className={styles.badge} aria-hidden="true">
          {badge}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={styles.close}
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <IconX />
        </Button>

        <div className={styles.scene} aria-hidden="true">
          <div className={styles.orbit}>{orbitIcon}</div>
          {scene ?? (
            <>
              <div className={`${styles.panel} ${styles.panelBack}`}>
                <span />
                <span />
                <span />
              </div>
              <div className={`${styles.panel} ${styles.panelFront}`}>
                <div className={styles.panelHeader}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.panelBody}>
                  <span className={styles.sidebar} />
                  <span className={styles.tile} />
                  <span className={styles.tile} />
                  <span className={styles.tile} />
                  <span className={styles.tile} />
                </div>
              </div>
            </>
          )}
          <span className={styles.seal}>{sealIcon}</span>
        </div>
      </div>

      <CardContent className={styles.body}>
        <CardHeader className={styles.header}>
          <CardTitle id={titleId} className={styles.title}>
            {title}
          </CardTitle>
          <CardDescription className={styles.description}>{description}</CardDescription>
        </CardHeader>
        <CardFooter className={styles.footer}>{action}</CardFooter>
      </CardContent>
    </Card>,
    document.body
  )
}

export { styles as announcementStyles }
