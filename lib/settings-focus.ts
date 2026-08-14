/**
 * Settings search results have to land on the individual control, not just the page that
 * owns it. Settings pages tag their rows with `data-settings-anchor` and tag the trigger
 * that reveals a hidden row (dialog button, collapsible, accordion header) with
 * `data-settings-open`. This module resolves those tags after navigation: it waits for the
 * section to render, clicks the opener when the row is missing or still hidden, then scrolls
 * to the row and flashes it.
 */

const ANCHOR_ATTRIBUTE = "data-settings-anchor"
const OPENER_ATTRIBUTE = "data-settings-open"
const FLASH_CLASS = "settings-focus-flash"
const RESOLVE_TIMEOUT_MS = 4000
const POLL_INTERVAL_MS = 80
const FLASH_DURATION_MS = 1600
const TOKEN_PATTERN = /^[a-z0-9-]+$/

export interface SettingsFocusTarget {
  /** `data-settings-anchor` value of the row to reveal. */
  readonly anchor?: string
  /** `data-settings-open` value of the trigger that reveals the row, when it starts hidden. */
  readonly opener?: string
  /** Anchor used when the row itself never appears, such as a conditionally rendered control. */
  readonly fallbackAnchor?: string
}

/** Invalidates any in-flight resolution so a second search result cannot fight the first. */
let activeToken = 0
let flashTimer: number | null = null
let flashedElement: HTMLElement | null = null

const normalizeToken = (value: string | undefined): string | null => (
  value && TOKEN_PATTERN.test(value) ? value : null
)

const findByAttribute = (attribute: string, value: string): HTMLElement | null => (
  document.querySelector<HTMLElement>(`[${attribute}="${value}"]`)
)

const isVisible = (element: HTMLElement): boolean => {
  if (typeof element.checkVisibility === "function") return element.checkVisibility()
  return Boolean(element.offsetParent) || element.getClientRects().length > 0
}

const prefersReducedMotion = (): boolean => (
  typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches
)

const clearFlash = () => {
  if (flashTimer !== null) {
    window.clearTimeout(flashTimer)
    flashTimer = null
  }
  flashedElement?.classList.remove(FLASH_CLASS)
  flashedElement = null
}

const reveal = (element: HTMLElement) => {
  element.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  })

  clearFlash()
  element.classList.add(FLASH_CLASS)
  flashedElement = element
  flashTimer = window.setTimeout(clearFlash, FLASH_DURATION_MS)

  // Move keyboard focus with the highlight so the next Tab continues from the control the
  // user searched for rather than from the sidebar.
  if (!element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1")
  }
  element.focus({ preventScroll: true })
}

/**
 * Reveals a settings control once it exists in the DOM. Safe to call before the target
 * section has rendered: resolution polls until the deadline and then gives up quietly.
 */
export function requestSettingsFocus(target: SettingsFocusTarget): void {
  if (typeof document === "undefined") return

  activeToken += 1
  const token = activeToken
  clearFlash()

  const anchor = normalizeToken(target.anchor)
  const opener = normalizeToken(target.opener)
  const fallbackAnchor = normalizeToken(target.fallbackAnchor)
  if (!anchor) return

  const deadline = Date.now() + RESOLVE_TIMEOUT_MS
  let openerClicked = false

  const attempt = () => {
    if (token !== activeToken) return

    // The opener runs before the anchor lookup, not only as a fallback for a missing
    // anchor: an accordion header is visible while its own controls are still collapsed,
    // so scrolling to it without opening it would leave the user one click short.
    if (opener && !openerClicked) {
      const trigger = findByAttribute(OPENER_ATTRIBUTE, opener)
      if (trigger) {
        openerClicked = true
        if (trigger.getAttribute("aria-expanded") !== "true") trigger.click()
      }
    }

    const element = findByAttribute(ANCHOR_ATTRIBUTE, anchor)
    if (element && isVisible(element)) {
      reveal(element)
      return
    }

    if (Date.now() < deadline) {
      window.setTimeout(attempt, POLL_INTERVAL_MS)
      return
    }

    if (fallbackAnchor) {
      const fallback = findByAttribute(ANCHOR_ATTRIBUTE, fallbackAnchor)
      if (fallback && isVisible(fallback)) reveal(fallback)
    }
  }

  attempt()
}
