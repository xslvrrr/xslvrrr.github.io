import { logger } from './logger';

/** Logs sanitized diagnostics while keeping implementation details out of clients. */
export function internalErrorResponse(
  event: string,
  publicMessage: string,
  error: unknown,
  headers?: HeadersInit,
  body: Record<string, unknown> = {},
): Response {
  logger.error(event, error);
  return Response.json(
    { ...body, message: publicMessage },
    { status: 500, ...(headers ? { headers } : {}) },
  );
}
