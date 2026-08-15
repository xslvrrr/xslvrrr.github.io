/**
 * Suspension durations typed as shorthand by an administrator.
 *
 * The review dialog asks for a free-text length rather than a picker, so this parses the shorthand
 * the administrator tools document: `h` hours, `d` days, `w` weeks, `m` months, `y` years, and
 * `perm` for permanent. Several segments can be combined ("1y 6m", "3d12h").
 *
 * Months and years are applied as calendar arithmetic rather than fixed millisecond counts, so a
 * one-month suspension typed on the 31st lands on a real date instead of drifting across a month.
 */

export type SuspensionDuration =
  | { readonly permanent: true }
  | {
    readonly permanent: false
    readonly years: number
    readonly months: number
    readonly days: number
    readonly hours: number
  }

const SEGMENT_PATTERN = /(\d+)\s*(h|d|w|m|y)/gi
const PERMANENT_INPUTS = new Set(["perm", "perma", "permanent", "forever"])

/** Guards against a typo like `999y` pinning a row far outside any sane range. */
const MAX_YEARS = 100

/**
 * Parses administrator shorthand into a duration, or returns null when the input is not a duration.
 * A `null` result means "do not suspend"; callers surface it as a validation message.
 */
export function parseSuspensionDuration(input: string): SuspensionDuration | null {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return null
  if (PERMANENT_INPUTS.has(normalized)) return { permanent: true }

  // Reject anything with characters outside the shorthand grammar so "2 monts" is not read as "2m".
  if (!/^[\d\s hdwmy]+$/.test(normalized)) return null

  let years = 0
  let months = 0
  let days = 0
  let hours = 0
  let matchedLength = 0

  SEGMENT_PATTERN.lastIndex = 0
  for (const match of normalized.matchAll(SEGMENT_PATTERN)) {
    const amount = Number(match[1])
    if (!Number.isFinite(amount) || amount <= 0) return null
    matchedLength += match[0].length

    switch (match[2]) {
      case "y": years += amount; break
      case "m": months += amount; break
      case "w": days += amount * 7; break
      case "d": days += amount; break
      default: hours += amount; break
    }
  }

  // Every non-space character has to belong to a segment; "2d junk" is a typo, not two days.
  if (matchedLength !== normalized.replace(/\s+/g, "").length) return null
  if (years === 0 && months === 0 && days === 0 && hours === 0) return null
  if (years + months / 12 > MAX_YEARS) return null

  return { permanent: false, years, months, days, hours }
}

/** Applies a parsed duration to a starting instant. Permanent suspensions have no expiry. */
export function suspensionExpiryFrom(duration: SuspensionDuration, from: Date): Date | null {
  if (duration.permanent) return null

  const expiry = new Date(from.getTime())
  if (duration.years) expiry.setUTCFullYear(expiry.getUTCFullYear() + duration.years)
  if (duration.months) expiry.setUTCMonth(expiry.getUTCMonth() + duration.months)
  if (duration.days) expiry.setUTCDate(expiry.getUTCDate() + duration.days)
  if (duration.hours) expiry.setUTCHours(expiry.getUTCHours() + duration.hours)
  return expiry
}

/** Human-readable echo of what was typed, shown before the administrator confirms. */
export function describeSuspensionDuration(duration: SuspensionDuration): string {
  if (duration.permanent) return "Permanent"

  const parts: string[] = []
  const push = (amount: number, unit: string) => {
    if (amount > 0) parts.push(`${amount} ${unit}${amount === 1 ? "" : "s"}`)
  }
  push(duration.years, "year")
  push(duration.months, "month")
  push(duration.days, "day")
  push(duration.hours, "hour")
  return parts.join(", ")
}

/** Suspension state as rendered in the administrator table. */
export function describeSuspensionRemaining(expiresAt: string | null, now: Date = new Date()): string {
  if (!expiresAt) return "Permanent"

  const expiry = Date.parse(expiresAt)
  if (!Number.isFinite(expiry)) return "Unknown"

  const remainingMs = expiry - now.getTime()
  if (remainingMs <= 0) return "Expired"

  const hours = Math.floor(remainingMs / 3_600_000)
  if (hours < 24) return `${Math.max(1, hours)} hour${hours === 1 ? "" : "s"} left`

  const days = Math.floor(hours / 24)
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} left`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} left`

  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? "" : "s"} left`
}

export function isSuspensionActive(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return true
  const expiry = Date.parse(expiresAt)
  return !Number.isFinite(expiry) || expiry > now.getTime()
}
