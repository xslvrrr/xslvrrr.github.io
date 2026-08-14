import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  createDesktopLoginUrl,
  isValidDesktopLoginPayload,
  type DesktopLoginPayload,
} from '@/lib/desktop/links'
import { AppLink as Link } from '@/start/link'
import { useAppRouter as useRouter } from '@/start/router'
import styles from '@/styles/AppOpen.module.css'

type OpenState = 'pending' | 'attempted' | 'fallback'

export default function AppOpen() {
  const router = useRouter()
  const [openState, setOpenState] = useState<OpenState>('pending')
  const [payload, setPayload] = useState<DesktopLoginPayload | null>(null)
  const [isPayloadResolved, setIsPayloadResolved] = useState(false)

  useEffect(() => {
    if (!router.isReady || isPayloadResolved) return
    const token = typeof router.query.token === 'string' ? router.query.token : ''
    const loginState = typeof router.query.state === 'string' ? router.query.state : ''
    const nextPayload = isValidDesktopLoginPayload(token, loginState)
      ? { token, state: loginState }
      : null

    setPayload(nextPayload)
    setIsPayloadResolved(true)
    if (nextPayload) {
      window.history.replaceState(window.history.state, '', '/app-open')
    }
  }, [isPayloadResolved, router.isReady, router.query.state, router.query.token])

  const desktopUrl = useMemo(() => {
    if (!payload) return null
    return createDesktopLoginUrl(payload.token, payload.state)
  }, [payload])

  const openApp = useCallback(() => {
    if (!desktopUrl) return
    window.location.assign(desktopUrl)
  }, [desktopUrl])

  useEffect(() => {
    if (!payload) return
    setOpenState('pending')
    openApp()
    setOpenState('attempted')
    const timer = window.setTimeout(() => setOpenState('fallback'), 1200)
    return () => window.clearTimeout(timer)
  }, [openApp, payload])

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Opening Millennium Desktop</h1>
        <p className={styles.subtitle}>
          Secure sign-in will finish in desktop app that initiated this request.
        </p>
        <div className={styles.status} aria-live="polite">
          {!isPayloadResolved && 'Validating desktop sign-in request…'}
          {isPayloadResolved && !payload && 'This desktop sign-in request is incomplete or invalid.'}
          {payload && openState === 'pending' && 'Preparing to open app…'}
          {payload && openState === 'attempted' && 'Attempting to open desktop app now.'}
          {payload && openState === 'fallback' && 'App did not open? Try again below.'}
        </div>
        <div className={styles.actions}>
          <Button className={styles.primary} onClick={openApp} disabled={!payload}>
            Open Desktop App
          </Button>
        </div>
        <div className={styles.muted}>
          Login code only works in desktop instance that started browser sign-in.
        </div>
        <Link href="/download" className={styles.link}>
          Download Millennium Desktop
        </Link>
      </div>
    </div>
  )
}
