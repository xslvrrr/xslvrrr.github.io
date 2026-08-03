export class RequestBodyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
  }
}

export async function readJsonBody<T = unknown>(request: Request, maxBytes: number): Promise<T> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyError('Request body is too large', 413);
  }

  if (!request.body) throw new RequestBodyError('Request body is required', 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('Request body limit exceeded').catch(() => {});
        throw new RequestBodyError('Request body is too large', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestBodyError('Request body must be valid JSON', 400);
  }
}

export function requestBodyErrorResponse(
  error: unknown,
  headers?: HeadersInit,
  body: Record<string, unknown> = {},
): Response | null {
  if (!(error instanceof RequestBodyError)) return null;
  return Response.json({ ...body, message: error.message }, {
    status: error.status,
    ...(headers ? { headers } : {}),
  });
}
