export const DESKTOP_BOOTSTRAP_UPDATED_EVENT = 'millennium-desktop-bootstrap-updated'
export const DESKTOP_AUTH_ERROR_EVENT = 'millennium-desktop-auth-error'

export interface DesktopAuthErrorDetail {
  message: string
}

export function dispatchDesktopAuthError(message: string): void {
  window.dispatchEvent(new CustomEvent<DesktopAuthErrorDetail>(DESKTOP_AUTH_ERROR_EVENT, {
    detail: { message },
  }))
}
