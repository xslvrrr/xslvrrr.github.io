"use client"

import * as React from "react"
import { PreviewCard as HoverCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "../../lib/utils"
import { Slot } from "./slot"

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  asChild = false,
  children,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger> & {
  asChild?: boolean
}) {
  if (asChild) {
    const Trigger = HoverCardPrimitive.Trigger as React.ComponentType<any>
    return (
      <Trigger
        data-slot="hover-card-trigger"
        {...props}
        render={(triggerProps: React.HTMLAttributes<HTMLElement>) => (
          <Slot.Root {...triggerProps}>{children}</Slot.Root>
        )}
      />
    )
  }

  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props}>
      {children}
    </HoverCardPrimitive.Trigger>
  )
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  side = "bottom",
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Popup> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Positioner
        data-slot="hover-card-positioner"
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <HoverCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground w-72 rounded-lg p-2.5 text-xs/relaxed shadow-md ring-1 duration-100 z-50 outline-hidden",
            className
          )}
          {...props}
        />
      </HoverCardPrimitive.Positioner>
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
