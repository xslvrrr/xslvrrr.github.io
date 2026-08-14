import { Navigate, Outlet } from '@tanstack/react-router'
import { IconAlertTriangle, IconLoader2, IconRefresh } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import { useAnimationSettings } from '@/hooks/useAnimationSettings'
import {
  DesktopBootProvider,
  useDesktopBootstrap,
} from '@/hooks/useDesktopBootstrap'
import { useDesktopDeepLinks } from '@/hooks/useDesktopDeepLinks'
import { DesktopShellWatcher } from '@/hooks/useDesktopShell'
import { DesktopUpdaterProvider } from '@/hooks/useDesktopUpdater'
import { SessionProvider } from '@/start/session'

import { DesktopWindowChrome } from './DesktopWindowChrome'

export function DesktopRoot() {
  useAnimationSettings()
  useDesktopDeepLinks()

  return (
    <DesktopUpdaterProvider>
      <Toaster position="bottom-center" richColors closeButton />
      <DesktopShellWatcher />
      <DesktopBootProvider>
        <DesktopWindowChrome />
        <DesktopSessionShell />
      </DesktopBootProvider>
    </DesktopUpdaterProvider>
  )
}

function DesktopSessionShell() {
  const boot = useDesktopBootstrap()
  const canUseCachedSession = boot.status === 'online-authenticated'
    || boot.status === 'cache-ready-offline'
    || (boot.status === 'reauth-required' && boot.hasCachedData)
  const cachedSession = canUseCachedSession && boot.identity ? {
    userId: boot.identity.ownerId,
    portalUid: boot.identity.portalUid,
    name: boot.identity.displayName,
    school: boot.identity.school,
    role: boot.identity.role || 'user',
    offline: boot.status !== 'online-authenticated',
  } : undefined

  return (
    <SessionProvider session={cachedSession} allowRemoteSession={false}>
      <Outlet />
    </SessionProvider>
  )
}

export function DesktopEntryRoute() {
  const boot = useDesktopBootstrap()

  if (boot.status === 'booting') {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <IconLoader2 className="animate-spin" aria-hidden="true" />
            Opening encrypted local workspace…
          </CardContent>
        </Card>
      </main>
    )
  }

  if (boot.status === 'fatal-local-storage-error') {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <Card className="w-full max-w-md">
          <CardHeader>
            <IconAlertTriangle className="text-destructive" aria-hidden="true" />
            <CardTitle>Local workspace unavailable</CardTitle>
            <CardDescription>{boot.error || 'Millennium could not open secure local storage.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void boot.refresh()}>
              <IconRefresh aria-hidden="true" />
              Try again
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (
    boot.status === 'online-authenticated'
    || boot.status === 'cache-ready-offline'
    || (boot.status === 'reauth-required' && boot.hasCachedData)
  ) {
    return <Navigate to="/dashboard" replace />
  }

  return <Navigate to="/login" replace />
}
