import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const DATABASE_FILES = [
  new URL('./users.ts', import.meta.url),
  new URL('./tokens.ts', import.meta.url),
];

describe('database egress boundaries', () => {
  it.each(DATABASE_FILES)('does not use wildcard PostgREST projections in %s', async (file) => {
    const source = await readFile(file, 'utf8');
    expect(source).not.toMatch(/\.select\(\s*['"`]\*['"`]\s*\)/);
  });
});
