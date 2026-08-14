import { createHash } from 'node:crypto';

const PORTAL_SYNC_SECTIONS = [
  'account',
  'attendance',
  'calendar',
  'classes',
  'grades',
  'notices',
  'reports',
  'timetable',
] as const;

type PortalSyncSection = typeof PORTAL_SYNC_SECTIONS[number];

interface SectionFingerprint {
  hash: string;
  records?: Record<string, string>;
}

export interface PortalSyncFingerprint {
  version: 1;
  updatedAt: string;
  sections: Partial<Record<PortalSyncSection, SectionFingerprint>>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function contentHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('base64url')
    .slice(0, 24);
}

function recordKeyHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 20);
}

function field(value: unknown, key: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const entry = Reflect.get(value, key);
  return entry === null || entry === undefined ? '' : String(entry).trim().toLowerCase();
}

const recordKeyFor: Partial<Record<PortalSyncSection, (value: unknown) => string>> = {
  calendar: (value) => [field(value, 'date'), field(value, 'title'), field(value, 'type')].join('\u001f'),
  classes: (value) => [field(value, 'classCode'), field(value, 'course')].join('\u001f'),
  grades: (value) => [field(value, 'subject'), field(value, 'task'), field(value, 'date')].join('\u001f'),
  notices: (value) => [
    field(value, 'title'),
    field(value, 'content') || field(value, 'preview'),
  ].join('\u001f'),
  reports: (value) => [
    field(value, 'url'),
    field(value, 'title'),
    field(value, 'calendarYear'),
    field(value, 'semester'),
  ].join('\u001f'),
  timetable: (value) => [
    field(value, 'day'),
    field(value, 'period'),
    field(value, 'classCode'),
    field(value, 'course'),
    field(value, 'subject'),
  ].join('\u001f'),
};

function diffRecords(
  values: unknown[],
  previous: Record<string, string> | undefined,
  keyFor: (value: unknown) => string,
  keyPrefix = '',
): { changed: unknown[]; records: Record<string, string> } {
  const changed: unknown[] = [];
  const records: Record<string, string> = {};
  values.forEach((value, index) => {
    const logicalKey = keyFor(value);
    const hasKeyContent = logicalKey.replace(/\u001f/g, '') !== '';
    const key = recordKeyHash(
      `${keyPrefix}${hasKeyContent ? logicalKey : `index:${index}:${contentHash(value)}`}`,
    );
    const hash = contentHash(value);
    records[key] = hash;
    if (!previous || previous[key] !== hash) changed.push(value);
  });
  return { changed, records };
}

function diffTimetable(
  value: unknown,
  previous: SectionFingerprint | undefined,
): { delta: unknown; fingerprint: SectionFingerprint } {
  const hash = contentHash(value);
  if (previous?.hash === hash) return { delta: undefined, fingerprint: previous };
  const keyFor = recordKeyFor.timetable!;

  if (Array.isArray(value)) {
    const result = diffRecords(value, previous?.records, keyFor);
    return { delta: result.changed.length ? result.changed : undefined, fingerprint: { hash, records: result.records } };
  }

  const timetable = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const weekA = diffRecords(
    Array.isArray(timetable.weekA) ? timetable.weekA : [],
    previous?.records,
    keyFor,
    'weekA:',
  );
  const weekB = diffRecords(
    Array.isArray(timetable.weekB) ? timetable.weekB : [],
    previous?.records,
    keyFor,
    'weekB:',
  );
  const records = { ...weekA.records, ...weekB.records };
  const delta = {
    ...(weekA.changed.length ? { weekA: weekA.changed } : {}),
    ...(weekB.changed.length ? { weekB: weekB.changed } : {}),
  };
  return {
    delta: Object.keys(delta).length ? delta : undefined,
    fingerprint: { hash, records },
  };
}

function diffSection(
  section: PortalSyncSection,
  value: unknown,
  previous: SectionFingerprint | undefined,
): { delta: unknown; fingerprint: SectionFingerprint } {
  if (section === 'timetable') return diffTimetable(value, previous);

  const hash = contentHash(value);
  if (previous?.hash === hash) return { delta: undefined, fingerprint: previous };
  const keyFor = recordKeyFor[section];
  if (keyFor && Array.isArray(value)) {
    const result = diffRecords(value, previous?.records, keyFor);
    return {
      delta: result.changed.length ? result.changed : undefined,
      fingerprint: { hash, records: result.records },
    };
  }
  return { delta: value, fingerprint: { hash } };
}

export function isPortalSyncFingerprint(value: unknown): value is PortalSyncFingerprint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fingerprint = value as Partial<PortalSyncFingerprint>;
  return fingerprint.version === 1
    && typeof fingerprint.updatedAt === 'string'
    && !!fingerprint.sections
    && typeof fingerprint.sections === 'object'
    && !Array.isArray(fingerprint.sections);
}

export function buildPortalSyncDelta(
  snapshot: Record<string, unknown>,
  previous: PortalSyncFingerprint | null | undefined,
  updatedAt: string,
): { delta: Record<string, unknown>; fingerprint: PortalSyncFingerprint } {
  const sections: Partial<Record<PortalSyncSection, SectionFingerprint>> = {};
  const delta: Record<string, unknown> = {};

  for (const section of PORTAL_SYNC_SECTIONS) {
    if (!(section in snapshot)) continue;
    const result = diffSection(section, snapshot[section], previous?.sections[section]);
    sections[section] = result.fingerprint;
    if (result.delta !== undefined) delta[section] = result.delta;
  }

  return {
    delta,
    fingerprint: {
      version: 1,
      updatedAt,
      sections,
    },
  };
}
