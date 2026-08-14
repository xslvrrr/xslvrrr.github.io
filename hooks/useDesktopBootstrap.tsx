import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  DesktopBootstrapRequestError,
  refreshDesktopBootstrap,
} from '@/lib/desktop/bootstrap'
import {
  DESKTOP_AUTH_ERROR_EVENT,
  DESKTOP_BOOTSTRAP_UPDATED_EVENT,
  type DesktopAuthErrorDetail,
} from '@/lib/desktop/events'
import { isDesktopLogoutPending } from '@/lib/desktop/logout-lock'
import {
  hasClassroomDataCache,
  hasPortalDataCache,
  readDesktopIdentity,
} from '@/lib/desktop/storage'
import { isDesktopApp } from '@/lib/desktop/utils'
import type {
  DesktopBootState,
  DesktopIdentity,
} from '@/types/desktop'

interface DesktopBootContextValue {
  status: DesktopBootState
  identity: DesktopIdentity | null
  hasCachedPortal: boolean
  hasCachedClassroom: boolean
  hasCachedData: boolean
  error: string | null
  refresh: () => Promise<void>
  resetLocalSession: () => void
  lockLocalSession: (message: string) => void
}

interface CachedDesktopState {
  identity: DesktopIdentity | null
  hasCachedPortal: boolean
  hasCachedClassroom: boolean
}

const DesktopBootContext = createContext<DesktopBootContextValue | null>(null)

export function DesktopBootProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DesktopBootState>('booting')
  const [identity, setIdentity] = useState<DesktopIdentity | null>(null)
  const [hasCachedPortal, setHasCachedPortal] = useState(false)
  const [hasCachedClassroom, setHasCachedClassroom] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshGenerationRef = useRef(0)
  const refreshAbortRef = useRef<AbortController | null>(null)

  const loadCachedState = useCallback(async (): Promise<CachedDesktopState> => {
    const cachedIdentity = await readDesktopIdentity()
    if (!cachedIdentity) {
      setIdentity(null)
      setHasCachedPortal(false)
      setHasCachedClassroom(false)
      return {
        identity: null,
        hasCachedPortal: false,
        hasCachedClassroom: false,
      }
    }

    // Presence only. Boot used to decrypt both snapshots in full and keep nothing but whether
    // they were null, which put the largest cached payload on the path to the first frame.
    const [hasPortal, hasClassroom] = await Promise.all([
      hasPortalDataCache(cachedIdentity.ownerId),
      hasClassroomDataCache(cachedIdentity.ownerId),
    ])
    const nextState = {
      identity: cachedIdentity,
      hasCachedPortal: hasPortal,
      hasCachedClassroom: hasClassroom,
    }
    setIdentity(nextState.identity)
    setHasCachedPortal(nextState.hasCachedPortal)
    setHasCachedClassroom(nextState.hasCachedClassroom)
    return nextState
  }, [])

  const refresh = useCallback(async () => {
    const refreshGeneration = ++refreshGenerationRef.current
    if (!isDesktopApp()) {
      setStatus('online-authenticated')
      setError(null)
      return
    }
    if (isDesktopLogoutPending()) {
      refreshAbortRef.current?.abort()
      refreshAbortRef.current = null
      setIdentity(null)
      setHasCachedPortal(false)
      setHasCachedClassroom(false)
      setStatus('first-run')
      setError('Previous server sign-out is pending. Sign in explicitly to continue.')
      return
    }

    refreshAbortRef.current?.abort()
    const refreshController = new AbortController()
    refreshAbortRef.current = refreshController
    let cachedState: CachedDesktopState
    try {
      cachedState = await loadCachedState()
    } catch (cacheError) {
      if (refreshGeneration !== refreshGenerationRef.current) return
      setError(cacheError instanceof Error ? cacheError.message : 'Secure local storage is unavailable.')
      setStatus('fatal-local-storage-error')
      return
    }

    if (refreshGeneration !== refreshGenerationRef.current) return
    const hasCachedData = cachedState.hasCachedPortal || cachedState.hasCachedClassroom
    if (hasCachedData) setStatus('cache-ready-offline')

    try {
      await refreshDesktopBootstrap(refreshController.signal)
      if (refreshGeneration !== refreshGenerationRef.current) return
      await loadCachedState()
      if (refreshGeneration !== refreshGenerationRef.current) return
      setStatus('online-authenticated')
      setError(null)
    } catch (bootstrapError) {
      if (refreshGeneration !== refreshGenerationRef.current) return
      if (bootstrapError instanceof DesktopBootstrapRequestError && bootstrapError.status === 401) {
        setStatus(hasCachedData ? 'reauth-required' : 'first-run')
      } else {
        setStatus(hasCachedData ? 'cache-ready-offline' : cachedState.identity ? 'reauth-required' : 'first-run')
      }
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : 'Online services are unavailable.',
      )
    }
  }, [loadCachedState])

  const resetLocalSession = useCallback(() => {
    refreshGenerationRef.current += 1
    refreshAbortRef.current?.abort()
    refreshAbortRef.current = null
    setIdentity(null)
    setHasCachedPortal(false)
    setHasCachedClassroom(false)
    setError(null)
    setStatus('first-run')
  }, [])

  const lockLocalSession = useCallback((message: string) => {
    refreshGenerationRef.current += 1
    refreshAbortRef.current?.abort()
    refreshAbortRef.current = null
    setIdentity(null)
    setHasCachedPortal(false)
    setHasCachedClassroom(false)
    setError(message)
    setStatus('fatal-local-storage-error')
  }, [])

  useEffect(() => {
    void refresh()
    const handleOnline = () => void refresh()
    const handleBootstrapUpdate = () => {
      if (isDesktopLogoutPending()) return
      refreshAbortRef.current?.abort()
      refreshAbortRef.current = null
      const eventGeneration = ++refreshGenerationRef.current
      void loadCachedState()
        .then(() => {
          if (eventGeneration !== refreshGenerationRef.current) return
          setStatus('online-authenticated')
          setError(null)
        })
        .catch((cacheError: unknown) => {
          if (eventGeneration !== refreshGenerationRef.current) return
          setError(cacheError instanceof Error ? cacheError.message : 'Secure local storage is unavailable.')
          setStatus('fatal-local-storage-error')
        })
    }
    const handleAuthError = (event: Event) => {
      const detail = (event as CustomEvent<DesktopAuthErrorDetail>).detail
      if (detail?.message) setError(detail.message)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener(DESKTOP_BOOTSTRAP_UPDATED_EVENT, handleBootstrapUpdate)
    window.addEventListener(DESKTOP_AUTH_ERROR_EVENT, handleAuthError)
    return () => {
      refreshAbortRef.current?.abort()
      refreshAbortRef.current = null
      window.removeEventListener('online', handleOnline)
      window.removeEventListener(DESKTOP_BOOTSTRAP_UPDATED_EVENT, handleBootstrapUpdate)
      window.removeEventListener(DESKTOP_AUTH_ERROR_EVENT, handleAuthError)
    }
  }, [loadCachedState, refresh])

  const hasCachedData = hasCachedPortal || hasCachedClassroom
  const value = useMemo<DesktopBootContextValue>(() => ({
    status,
    identity,
    hasCachedPortal,
    hasCachedClassroom,
    hasCachedData,
    error,
    refresh,
    resetLocalSession,
    lockLocalSession,
  }), [
    error,
    hasCachedClassroom,
    hasCachedData,
    hasCachedPortal,
    identity,
    lockLocalSession,
    refresh,
    resetLocalSession,
    status,
  ])

  return <DesktopBootContext.Provider value={value}>{children}</DesktopBootContext.Provider>
}

export function useDesktopBootstrap(): DesktopBootContextValue {
  const context = useContext(DesktopBootContext)
  if (!context) {
    return {
      status: 'booting',
      identity: null,
      hasCachedPortal: false,
      hasCachedClassroom: false,
      hasCachedData: false,
      error: 'Desktop boot provider is unavailable.',
      refresh: async () => {},
      resetLocalSession: () => {},
      lockLocalSession: () => {},
    }
  }
  return context
}
