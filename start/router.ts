import { useLocation, useNavigate, useSearch } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"

type RouteTarget = string | { pathname?: string; query?: Record<string, unknown>; hash?: string }

function normalizeTarget(target: RouteTarget): string {
  if (typeof target === "string") return target

  const pathname = target.pathname || window.location.pathname
  const params = new URLSearchParams()
  Object.entries(target.query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)))
    } else {
      params.set(key, String(value))
    }
  })

  const search = params.toString()
  const hash = target.hash ? `#${target.hash.replace(/^#/, "")}` : ""
  return `${pathname}${search ? `?${search}` : ""}${hash}`
}

function toQuery(search: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(search).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : value == null ? undefined : String(value)]),
  )
}

export function useAppRouter() {
  const navigate = useNavigate()
  const location = useLocation()
  const search = useSearch({ strict: false })
  const searchKey = JSON.stringify(search)
  const query = useMemo(() => {
    const searchSnapshot = JSON.parse(searchKey) as Record<string, unknown>
    return toQuery(searchSnapshot)
  }, [searchKey])

  const move = useCallback(async (target: RouteTarget, replace = false) => {
    const href = normalizeTarget(target)

    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      window.location.assign(href)
      return true
    }

    if (href.startsWith("#")) {
      if (replace) {
        window.location.replace(href)
      } else {
        window.location.hash = href.slice(1)
      }
      return true
    }

    const parsed = new URL(href, window.location.origin)
    await navigate({
      to: parsed.pathname,
      search: Object.fromEntries(parsed.searchParams.entries()),
      hash: parsed.hash.replace(/^#/, ""),
      replace,
    } as never)
    return true
  }, [navigate])
  const push = useCallback((target: RouteTarget) => move(target, false), [move])
  const replace = useCallback((target: RouteTarget) => move(target, true), [move])
  const back = useCallback(() => window.history.back(), [])
  const reload = useCallback(() => window.location.reload(), [])

  return useMemo(() => ({
    isReady: true,
    pathname: location.pathname,
    asPath: `${location.pathname}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
    query,
    push,
    replace,
    back,
    reload,
  }), [back, location.hash, location.pathname, location.searchStr, push, query, reload, replace])
}
