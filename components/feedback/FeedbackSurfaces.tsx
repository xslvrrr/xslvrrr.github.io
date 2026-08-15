"use client"

import * as React from "react"
import { IconHelpCircle } from "@tabler/icons-react"

import { FeedbackAnnouncement } from "@/components/announcements"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

import { useFeedback } from "./FeedbackProvider"

/**
 * The sidebar entry point.
 *
 * It opens the report form, or the suspension notice when the account cannot report — the provider
 * decides which, so this button does not need to know the account's state.
 */
export function FeedbackSidebarButton(): React.ReactElement {
  const feedback = useFeedback()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        data-tour-id="feedback-reports"
        onClick={() => feedback?.openFeedback()}
        tooltip="Bugs/Suggestions"
      >
        <IconHelpCircle />
        <span>Bugs/Suggestions</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** The one-time announcement, wired to the same entry point the sidebar button uses. */
export function FeedbackAnnouncementSlot({
  userId,
  enabled,
}: {
  userId: string | null
  enabled: boolean
}): React.ReactElement {
  const feedback = useFeedback()

  return (
    <FeedbackAnnouncement
      enabled={enabled}
      onOpenFeedback={() => feedback?.openFeedback()}
      userId={userId}
    />
  )
}
