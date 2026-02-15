"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "../../lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-muted h-1 rounded-md relative flex w-full items-center overflow-x-hidden",
        className
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Track data-slot="progress-track" className="size-full">
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="bg-primary size-full flex-1 transition-all"
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
