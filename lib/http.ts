// Lightweight HTTP utility - replaces axios with native fetch
// Saves ~11KB in bundle size

interface FetchOptions extends RequestInit {
  timeout?: number;
}

export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
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
