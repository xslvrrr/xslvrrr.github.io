import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

type SessionStatus = "loading" | "authenticated" | "unauthenticated"
type SessionContextValue = {
  data: unknown
  status: SessionStatus
}

const SessionContext = createContext<SessionContextValue | null>(null)

interface SessionProviderProps {
  children: ReactNode
  session?: unknown
  allowRemoteSession?: boolean
}

export function SessionProvider({
  children,
  session,
  allowRemoteSession = true,
}: SessionProviderProps) {
  const [value, setValue] = useState<SessionContextValue>({
    data: session ?? null,
    status: session ? "authenticated" : "loading",
  })

  useEffect(() => {
    if (session) {
      setValue({ data: session, status: "authenticated" })
      return
    }
    if (!allowRemoteSession) {
      setValue({ data: null, status: "unauthenticated" })
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryAttempt = 0

    const refresh = async () => {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }

      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
        })
        if (!response.ok) throw new Error(`Session check failed with HTTP ${response.status}`)

        const data = await response.json()
        if (cancelled) return
        retryAttempt = 0
        const authenticated = data && Object.keys(data).length > 0
        setValue({
          data: authenticated ? data : null,
          status: authenticated ? "authenticated" : "unauthenticated",
        })
      } catch {
        if (cancelled) return

        // Network/server failures do not prove logout. Preserve known-good auth and retry.
        setValue((current) => current.status === "authenticated"
          ? current
          : { data: null, status: "loading" })
        const delay = Math.min(60_000, 2_000 * (2 ** retryAttempt))
        retryAttempt += 1
        retryTimer = setTimeout(refresh, delay)
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }

    void refresh()
    window.addEventListener("online", refresh)
    document.addEventListener("visibilitychange", refreshWhenVisible)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      window.removeEventListener("online", refresh)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [allowRemoteSession, session])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  return useMemo(() => context ?? { data: null, status: "unauthenticated" as SessionStatus }, [context])
}

export async function signOut(options?: { redirect?: boolean; callbackUrl?: string }) {
  try {
    await fetch("/api/auth/logout", { method: "POST" })
  } finally {
    if (options?.redirect !== false) {
      window.location.assign(options?.callbackUrl || "/")
    }
  }
}
