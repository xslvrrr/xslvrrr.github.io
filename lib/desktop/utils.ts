export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false
  const tauriWindow = window as typeof window & {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
    isTauri?: boolean
  }
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__ || tauriWindow.isTauri)
}

function isApprovedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'mailto:') return true
    if (url.protocol === 'http:') {
      const port = Number(url.port)
      // `/download` and `/downloads/...` carry the manual desktop update fallback: when the
      // signed in-app updater cannot reach a release, the app hands the installer listed on the
      // install page to the default browser instead of leaving the user stranded.
      const isApprovedPath = url.pathname === '/login'
        || url.pathname === '/download'
        || url.pathname.startsWith('/downloads/')
      return url.hostname === 'localhost'
        && ((port >= 3000 && port <= 3010) || port === 14201)
        && isApprovedPath
        && !url.username
        && !url.password
    }
    if (url.protocol !== 'https:' || url.username || url.password) return false
    return url.hostname === 'classroom.google.com'
      || url.hostname === 'millennium.education'
      || url.hostname === 'google.com'
      || url.hostname.endsWith('.google.com')
  } catch {
    return false
  }
}

export async function openExternal(url: string): Promise<void> {
  if (!url || !isApprovedExternalUrl(url)) {
    throw new Error('This external destination is not approved.')
  }

  if (isDesktopApp()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}
