import { createFileRoute } from '@tanstack/react-router'

import { AdministratorActionError, requireAdministrator } from '../../../../lib/admin'
import { internalErrorResponse } from '../../../../lib/api-response'
import { crossOriginMutationResponse } from '../../../../lib/csrf'
import {
  deleteExploreTheme,
  explorePublishSchema,
  listExploreThemes,
  publishExploreTheme,
} from '../../../../lib/explore-themes'
import { consumeRateLimit, rateLimitResponse } from '../../../../lib/rate-limit'
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body'
import { readStartSession } from '../../../../lib/start-session'

const noStoreHeaders = { 'Cache-Control': 'no-store' }
const EXPLORE_BODY_MAX_BYTES = 32 * 1024
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sessionUserId(request: Request): string | Response {
  const session = readStartSession(request)
  if (!session.loggedIn || !session.userId) {
    return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders })
  }
  return session.userId
}

function administratorErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AdministratorActionError)) return null
  return Response.json({ message: error.message }, { status: error.status, headers: noStoreHeaders })
}

export const Route = createFileRoute('/api/themes/explore')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = sessionUserId(request)
        if (userId instanceof Response) return userId

        try {
          const limit = await consumeRateLimit('explore-themes-read', userId, 60, 60)
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders)

          return Response.json({ themes: await listExploreThemes() }, { headers: noStoreHeaders })
        } catch (error) {
          return internalErrorResponse('Explore themes load failed', 'Failed to load explore themes', error, noStoreHeaders)
        }
      },

      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request)
        if (crossOrigin) return crossOrigin
        const userId = sessionUserId(request)
        if (userId instanceof Response) return userId

        try {
          await requireAdministrator(userId)
          const limit = await consumeRateLimit('explore-themes-publish', userId, 20, 60)
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders)

          const body = await readJsonBody<unknown>(request, EXPLORE_BODY_MAX_BYTES)
          const parsed = explorePublishSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ message: 'Invalid theme payload' }, { status: 400, headers: noStoreHeaders })
          }

          return Response.json({ theme: await publishExploreTheme(userId, parsed.data) }, { headers: noStoreHeaders })
        } catch (error) {
          const administratorError = administratorErrorResponse(error)
          if (administratorError) return administratorError
          const bodyError = requestBodyErrorResponse(error)
          if (bodyError) return bodyError
          return internalErrorResponse('Explore theme publish failed', 'Failed to publish theme', error, noStoreHeaders)
        }
      },

      DELETE: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request)
        if (crossOrigin) return crossOrigin
        const userId = sessionUserId(request)
        if (userId instanceof Response) return userId

        try {
          await requireAdministrator(userId)
          const limit = await consumeRateLimit('explore-themes-delete', userId, 20, 60)
          if (!limit.allowed) return rateLimitResponse(limit, noStoreHeaders)

          const id = new URL(request.url).searchParams.get('id') || ''
          if (!uuidPattern.test(id)) {
            return Response.json({ message: 'Invalid theme id' }, { status: 400, headers: noStoreHeaders })
          }

          await deleteExploreTheme(userId, id)
          return Response.json({ ok: true }, { headers: noStoreHeaders })
        } catch (error) {
          const administratorError = administratorErrorResponse(error)
          if (administratorError) return administratorError
          return internalErrorResponse('Explore theme delete failed', 'Failed to delete theme', error, noStoreHeaders)
        }
      },
    },
  },
})
