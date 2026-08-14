/** Produces a stable, non-identifier browser-storage namespace for one account. */
export function browserStorageScope(userId: string | null | undefined): string | null {
  const value = userId?.trim();
  if (!value) return null;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function scopedBrowserStorageKey(base: string, userId: string | null | undefined): string | null {
  const scope = browserStorageScope(userId);
  return scope ? `${base}:${scope}` : null;
}
