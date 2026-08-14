// Lightweight HTTP utility - replaces axios with native fetch
// Saves ~11KB in bundle size

interface FetchOptions extends RequestInit {
  timeout?: number;
}

export interface JsonFetchResult<T> {
  response: Response;
  data: T | null;
}

export class HttpProtocolError extends Error {
  readonly status: number;

  constructor(response: Response, detail: string) {
    super(`${detail} (HTTP ${response.status})`);
    this.name = 'HttpProtocolError';
    this.status = response.status;
  }
}

export interface RequiredJsonContract<T> {
  name: string;
  validate?: (value: unknown) => value is T;
}

function createDeadlineSignal(timeout: number, sourceSignal?: AbortSignal | null) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) forwardAbort();
  else sourceSignal?.addEventListener('abort', forwardAbort, { once: true });
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException(`Request exceeded ${timeout}ms`, 'TimeoutError'));
  }, timeout);
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeoutId);
      sourceSignal?.removeEventListener('abort', forwardAbort);
    },
  };
}

export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;

  const deadline = createDeadlineSignal(timeout, fetchOptions.signal);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: deadline.signal,
    });
    return response;
  } finally {
    deadline.clear();
  }
}

export async function fetchJsonWithTimeout<T = any>(
  url: string,
  options: FetchOptions = {},
): Promise<JsonFetchResult<T>> {
  const { timeout = 10_000, ...fetchOptions } = options;
  const deadline = createDeadlineSignal(timeout, fetchOptions.signal);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: deadline.signal });
    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }
    return { response, data };
  } finally {
    deadline.clear();
  }
}

export async function fetchRequiredJsonWithTimeout<T = unknown>(
  url: string,
  options: FetchOptions = {},
  contract: RequiredJsonContract<T> = { name: 'Server response' },
): Promise<JsonFetchResult<T>> {
  const { timeout = 10_000, ...fetchOptions } = options;
  const deadline = createDeadlineSignal(timeout, fetchOptions.signal);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: deadline.signal });
    const text = await response.text();
    if (!text.trim()) {
      throw new HttpProtocolError(response, `${contract.name} was empty`);
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpProtocolError(response, `${contract.name} was not valid JSON`);
    }

    if (contract.validate && !contract.validate(data)) {
      throw new HttpProtocolError(response, `${contract.name} did not match the expected JSON contract`);
    }

    return { response, data: data as T };
  } finally {
    deadline.clear();
  }
}

export async function fetchHTML(url: string, cookies: string, timeout = 10000): Promise<string> {
  const response = await fetchWithTimeout(url, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

export function parseCookies(setCookieArray: string[] = []): string[] {
  return setCookieArray.map(cookie => cookie.split(';')[0].trim());
}
