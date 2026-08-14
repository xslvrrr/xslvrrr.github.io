"use client"

import * as React from "react"

export interface CountdownParts {
  readonly days: number
  readonly hours: number
  readonly minutes: number
  readonly seconds: number
  readonly isComplete: boolean
}

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = MS_PER_SECOND * 60
const MS_PER_HOUR = MS_PER_MINUTE * 60
const MS_PER_DAY = MS_PER_HOUR * 24

function splitRemaining(remainingMs: number): CountdownParts {
  const clamped = Math.max(0, remainingMs)
  return {
    days: Math.floor(clamped / MS_PER_DAY),
    hours: Math.floor((clamped % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((clamped % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((clamped % MS_PER_MINUTE) / MS_PER_SECOND),
    isComplete: clamped <= 0,
  }
}

/**
 * Ticks once per second toward an ISO target.
 *
 * Returns `null` until the component has mounted so server and client markup match: the server
 * cannot know the viewer's current time, and rendering it would guarantee a hydration mismatch.
 */
export function useCountdown(targetIso: string): CountdownParts | null {
  const targetMs = React.useMemo(() => Date.parse(targetIso), [targetIso])
  const [parts, setParts] = React.useState<CountdownParts | null>(null)

  React.useEffect(() => {
    if (!Number.isFinite(targetMs)) {
      setParts(null)
      return
    }

    const tick = () => setParts(splitRemaining(targetMs - Date.now()))
    tick()
    const interval = window.setInterval(tick, MS_PER_SECOND)
    return () => window.clearInterval(interval)
  }, [targetMs])

  return parts
}
