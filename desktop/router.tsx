import {
  Navigate,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'

import { useDesktopBootstrap } from '@/hooks/useDesktopBootstrap'

import { DesktopEntryRoute, DesktopRoot } from './DesktopRoot'

const DashboardScreen = lazyRouteComponent(() => import('@/src/screens/dashboard'))

function DesktopDashboardRoute() {
  const boot = useDesktopBootstrap()
  if (boot.status === 'booting') return null
  if (boot.status === 'fatal-local-storage-error') return <Navigate to="/" replace />
  const canOpenDashboard = Boolean(boot.identity) && (
    boot.status === 'online-authenticated'
    || boot.status === 'cache-ready-offline'
    || (boot.status === 'reauth-required' && boot.hasCachedData)
  )
  return canOpenDashboard
    ? <DashboardScreen />
    : <Navigate to="/login" replace />
}

const rootRoute = createRootRoute({
  component: DesktopRoot,
  notFoundComponent: () => <Navigate to="/" replace />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DesktopEntryRoute,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: lazyRouteComponent(() => import('@/src/screens/login')),
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DesktopDashboardRoute,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: lazyRouteComponent(() => import('@/src/screens/forgot-password')),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  dashboardRoute,
  forgotPasswordRoute,
])

export const desktopRouter = createRouter({
  routeTree,
  defaultPreload: 'intent',
})
