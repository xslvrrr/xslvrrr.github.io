/**
 * The marketing site embeds the dashboard with `?preview=1`. Preview frames are same-origin, so
 * anything that reads browser storage must opt out explicitly — otherwise the landing page renders
 * the visitor's own theme, animation, and layout preferences instead of the shipped defaults.
 */
export function isDashboardPreview(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("preview") === "1"
}
