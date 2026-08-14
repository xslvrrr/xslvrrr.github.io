const DESKTOP_DEVELOPMENT_UI_ORIGIN = 'http://localhost:14200'
const DESKTOP_DEVELOPMENT_API_ORIGIN = 'http://localhost:14201'

/** Rejects browser mutation requests that do not originate from an approved same-site UI. */
export function crossOriginMutationResponse(request: Request): Response | null {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') {
    return Response.json({ message: 'Cross-origin request rejected' }, { status: 403 })
  }

  const requestUrl = new URL(request.url)
  const allowedOrigins = new Set([requestUrl.origin])
  if (requestUrl.protocol === 'http:' && requestUrl.hostname === 'localhost' && requestUrl.port === '3001') {
    allowedOrigins.add('http://millennium-five.vercel.app')
    allowedOrigins.add('http://localhost:3000')
  }
  if (
    process.env.NODE_ENV !== 'production'
    && requestUrl.origin === DESKTOP_DEVELOPMENT_API_ORIGIN
  ) {
    allowedOrigins.add(DESKTOP_DEVELOPMENT_UI_ORIGIN)
  }

  const origin = request.headers.get('origin')
  if (origin && !allowedOrigins.has(origin)) {
    return Response.json({ message: 'Cross-origin request rejected' }, { status: 403 })
  }
  return null
}
