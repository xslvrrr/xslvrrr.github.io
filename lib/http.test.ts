import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRequiredJsonWithTimeout } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRequiredJsonWithTimeout', () => {
  it('returns required valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
    const result = await fetchRequiredJsonWithTimeout('/example');
    expect(result.data).toEqual({ ok: true });
  });

  it('rejects an empty successful response as a protocol error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
    await expect(fetchRequiredJsonWithTimeout('/example', {}, { name: 'Login response' }))
      .rejects.toMatchObject({
        name: 'HttpProtocolError',
        status: 200,
      });
  });

  it('rejects malformed successful JSON as a protocol error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    await expect(fetchRequiredJsonWithTimeout('/example', {}, { name: 'Login response' }))
      .rejects.toThrow('Login response was not valid JSON (HTTP 200)');
  });

  it('enforces a supplied response contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false })));
    await expect(fetchRequiredJsonWithTimeout(
      '/example',
      {},
      {
        name: 'Login response',
        validate: (value): value is { ok: true } => isRecord(value) && value.ok === true,
      },
    )).rejects.toThrow('Login response did not match the expected JSON contract (HTTP 200)');
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
