import { createHmac } from 'node:crypto';
import { logger } from './logger';
import { supabaseAdmin } from './supabase';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  available: boolean;
}

function rateLimitSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'millennium-development-rate-limit-secret';
  throw new Error('SESSION_SECRET is required for rate limiting');
}

function opaqueRateLimitKey(scope: string, discriminator: string): string {
  const digest = createHmac('sha256', rateLimitSecret())
    .update('millennium:rate-limit:v1\0', 'utf8')
    .update(scope, 'utf8')
    .update('\0', 'utf8')
    .update(discriminator, 'utf8')
    .digest('base64url');
  return `${scope.slice(0, 48)}:${digest}`;
}

export function rateLimitKeysForDiscriminator(
  scopes: readonly string[],
  discriminator: string,
): string[] {
  return Array.from(new Set(scopes))
    .filter((scope) => scope.length > 0)
    .map((scope) => opaqueRateLimitKey(scope, discriminator));
}

export function requestNetworkDiscriminator(request: Request): string {
  const forwarded = request.headers.get('x-vercel-forwarded-for')
    || request.headers.get('x-forwarded-for')
    || request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || 'unknown';
  return forwarded.split(',')[0]?.trim().slice(0, 128) || 'unknown';
}

export async function consumeRateLimit(
  scope: string,
  discriminator: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('consume_api_rate_limit', {
      p_key: opaqueRateLimitKey(scope, discriminator),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed === true,
      remaining: Math.max(0, Number(row?.remaining) || 0),
      retryAfterSeconds: Math.max(0, Number(row?.retry_after_seconds) || 0),
      available: true,
    };
  } catch (error) {
    logger.error('Durable rate limit check failed', error);
    return process.env.NODE_ENV === 'production'
      ? { allowed: false, remaining: 0, retryAfterSeconds: 30, available: false }
      : { allowed: true, remaining: 0, retryAfterSeconds: 0, available: false };
  }
}

export function rateLimitResponse(
  result: RateLimitResult,
  headers?: HeadersInit,
  body: Record<string, unknown> = {},
): Response {
  const retryAfter = Math.max(1, result.retryAfterSeconds || 30);
  return Response.json({
    ...body,
    message: result.available
      ? 'Too many requests. Please try again later.'
      : 'Request protection is temporarily unavailable. Please try again.',
  }, {
    status: result.available ? 429 : 503,
    headers: new Headers({
      ...Object.fromEntries(new Headers(headers).entries()),
      'Cache-Control': 'no-store',
      'Retry-After': String(retryAfter),
    }),
  });
}
