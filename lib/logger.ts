type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(?:authorization|cookie|credential|secret|password|passcode|token|email|username|user[_-]?id|portal[_-]?uid|student|school|prompt|content|html|screenshot)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const COOKIE_PAIR = /\b(?:session|token|auth|cookie|connect\.sid)=[^;\s]+/gi;

function redactString(value: string): string {
  return value
    .replace(EMAIL, REDACTED)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(COOKIE_PAIR, REDACTED);
}

function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value).slice(0, 2_000);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (depth >= 5) return '[TRUNCATED]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message).slice(0, 1_000),
      ...(process.env.NODE_ENV === 'development' && value.stack
        ? { stack: redactString(value.stack).slice(0, 4_000) }
        : {}),
    };
  }

  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitize(entry, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : sanitize(entry, depth + 1, seen),
      ])
  );
}

function emit(level: LogLevel, message: string, data?: unknown) {
  if (level === 'debug' && process.env.NODE_ENV !== 'development') return;

  const event = redactString(message).replace(/^\[|\]:?$/g, '').slice(0, 240);
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(data === undefined ? {} : { data: sanitize(data) }),
  };

  if (process.env.NODE_ENV === 'development') {
    const method = level === 'debug' ? 'debug' : level === 'info' ? 'info' : level;
    console[method](`[${level.toUpperCase()}] ${event}`, payload.data ?? '');
    return;
  }

  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const logger = {
  debug: (message: string, data?: unknown) => emit('debug', message, data),
  info: (message: string, data?: unknown) => emit('info', message, data),
  warn: (message: string, data?: unknown) => emit('warn', message, data),
  error: (message: string, data?: unknown) => emit('error', message, data),
};
