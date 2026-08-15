"use client"

import * as React from "react"

/**
 * One announcement on screen at a time.
 *
 * Every announcement is a fixed bottom-right card, so two open at once would sit on top of each
 * other. A new account can legitimately qualify for several — the guided-tour prompt and the
 * bugs-and-suggestions notice, for instance — so they queue in mount order and the next one appears
 * when the current card is dismissed.
 */

let claims: readonly string[] = []
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function activeClaim(): string | null {
  return claims[0] ?? null
}

/**
 * Returns whether this announcement holds the slot. `wanted` is false while the announcement has
 * nothing to show, which releases the slot for whatever is queued behind it.
 */
export function useAnnouncementSlot(id: string, wanted: boolean): boolean {
  const active = React.useSyncExternalStore(subscribe, activeClaim, () => null)

  React.useEffect(() => {
    if (!wanted) return

    if (!claims.includes(id)) {
      claims = [...claims, id]
      notify()
    }
    return () => {
      claims = claims.filter((claim) => claim !== id)
      notify()
    }
  }, [id, wanted])

  return wanted && active === id
}
