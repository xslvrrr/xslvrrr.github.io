const DESKTOP_LOGOUT_PENDING_KEY = 'millennium-desktop-logout-pending-v1'

let memoryLogoutPending = false

export function isDesktopLogoutPending(): boolean {
  if (memoryLogoutPending) return true
  try {
    return window.localStorage.getItem(DESKTOP_LOGOUT_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export function markDesktopLogoutPending(): void {
  memoryLogoutPending = true
  try {
    window.localStorage.setItem(DESKTOP_LOGOUT_PENDING_KEY, '1')
  } catch {
    // Memory lock still blocks bootstrap for this process.
  }
}

export function clearDesktopLogoutPending(): void {
  memoryLogoutPending = false
  try {
    window.localStorage.removeItem(DESKTOP_LOGOUT_PENDING_KEY)
  } catch {
    // Explicit login can still proceed in this process.
  }
}
