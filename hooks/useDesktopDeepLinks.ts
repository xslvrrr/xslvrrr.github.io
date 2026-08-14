import { useEffect } from 'react'

import { completeDesktopLogin } from '../lib/desktop/auth'
import { dispatchDesktopAuthError } from '../lib/desktop/events'
import { extractDesktopLoginPayload } from '../lib/desktop/links'
import { isDesktopApp } from '../lib/desktop/utils'

function getDesktopAuthErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Desktop sign-in could not be completed.'
}

export function useDesktopDeepLinks(): void {
  useEffect(() => {
    if (!isDesktopApp()) return

    let unlisten: (() => void) | null = null
    let isCancelled = false
    const activePayloads = new Set<string>()

    void (async () => {
      const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')

      const consumeUrls = async (urls: string[] | null | undefined): Promise<void> => {
        const payload = urls?.map((url) => extractDesktopLoginPayload(url)).find(Boolean)
        if (!payload || isCancelled) return
        const payloadKey = payload.state
        if (activePayloads.has(payloadKey)) return
        activePayloads.add(payloadKey)

        try {
          await completeDesktopLogin(payload.token, payload.state)
          window.location.replace('/dashboard')
        } catch (error: unknown) {
          activePayloads.delete(payloadKey)
          dispatchDesktopAuthError(getDesktopAuthErrorMessage(error))
        }
      }

      await consumeUrls(await getCurrent())
      unlisten = await onOpenUrl((urls) => {
        void consumeUrls(urls)
      })
    })().catch((error: unknown) => {
      dispatchDesktopAuthError(
        error instanceof Error
          ? `Desktop sign-in listener failed: ${error.message}`
          : 'Desktop sign-in listener could not start.',
      )
    })

    return () => {
      isCancelled = true
      unlisten?.()
    }
  }, [])
}
