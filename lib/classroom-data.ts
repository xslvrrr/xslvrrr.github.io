import { createHash } from 'node:crypto';
import type {
  ClassroomAttachment,
  ClassroomAttachmentKind,
  ClassroomCounts,
  ClassroomCourse,
  ClassroomCoverage,
  ClassroomItem,
  ClassroomItemKind,
  ClassroomSnapshot,
  ClassroomSnapshotIntegrity,
  ClassroomSubmission,
  ClassroomSubmissionStatus,
} from '../types/classroom';

export const CLASSROOM_SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024;
export const CLASSROOM_MAX_COURSES = 200;
export const CLASSROOM_MAX_ITEMS = 10_000;
export const CLASSROOM_MAX_ATTACHMENTS_PER_ITEM = 20;
export const CLASSROOM_MAX_TOTAL_ATTACHMENTS = 25_000;
export const CLASSROOM_MAX_ISSUES = 100;

const MAX_TITLE_LENGTH = 500;
const MAX_SHORT_TEXT_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 20_000;
const MAX_ACCOUNT_HINT_LENGTH = 320;
const MAX_EXTRACTOR_VERSION_LENGTH = 100;
const MAX_URL_LENGTH = 2_048;
const MAX_SOURCE_ID_LENGTH = 256;
const ALLOWED_GOOGLE_HOSTS = new Set([
  'classroom.google.com',
  'docs.google.com',
  'drive.google.com',
]);
const ITEM_KINDS = new Set<ClassroomItemKind>(['assignment', 'material', 'question', 'announcement', 'unknown']);
const SUBMISSION_STATUSES = new Set<ClassroomSubmissionStatus>([
  'assigned',
  'turned-in',
  'returned',
  'missing',
  'graded',
  'unknown',
]);
const ATTACHMENT_KINDS = new Set<ClassroomAttachmentKind>([
  'document',
  'spreadsheet',
  'presentation',
  'drive-file',
  'link',
]);

export class ClassroomDataValidationError extends Error {
  readonly status = 422;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ClassroomDataValidationError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} must be an object.`);
  }
  return value;
}

function requiredArray(value: unknown, field: string, maxItems: number): unknown[] {
  if (!Array.isArray(value)) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} must be an array.`);
  }
  if (value.length > maxItems) {
    throw new ClassroomDataValidationError('CLASSROOM_DATA_LIMIT_EXCEEDED', `${field} exceeds its item limit.`);
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} must be a boolean.`);
  }
  return value;
}

function boundedInteger(value: unknown, field: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} must be a non-negative integer.`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} must be a valid non-negative number.`);
  }
  return value;
}

function decodePlainTextEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function plainText(value: unknown, field: string, maximum: number, required = false): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} must be text.`);
  }

  const normalized = decodePlainTextEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length > maximum) {
    throw new ClassroomDataValidationError('CLASSROOM_DATA_LIMIT_EXCEEDED', `${field} is too long.`);
  }
  if (required && normalized.length === 0) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} is required.`);
  }
  return normalized || undefined;
}

function isoDate(value: unknown, field: string, required = false): string | undefined {
  const text = plainText(value, field, 100, required);
  if (!text) return undefined;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} must be a valid ISO date.`);
  }
  return parsed.toISOString();
}

function canonicalGoogleUrl(value: unknown, field: string): URL {
  const text = plainText(value, field, MAX_URL_LENGTH, true);
  if (!text) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} is required.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} must be a valid URL.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'https:'
    || !ALLOWED_GOOGLE_HOSTS.has(hostname)
    || parsed.username
    || parsed.password
    || parsed.port
  ) {
    throw new ClassroomDataValidationError(
      'INVALID_CLASSROOM_URL',
      `${field} must use an approved Google HTTPS host.`,
    );
  }

  parsed.hostname = hostname;
  if (hostname === 'drive.google.com' && (parsed.pathname === '/open' || parsed.pathname === '/uc')) {
    const driveId = parsed.searchParams.get('id');
    if (!driveId) {
      throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} must include a Drive file identifier.`);
    }
    parsed.pathname = `/file/d/${validSourceId(driveId, field)}/view`;
  }
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return parsed;
}

function validSourceId(value: string, field: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} contains an invalid identifier.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(decoded) || decoded.length > MAX_SOURCE_ID_LENGTH) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} contains an invalid identifier.`);
  }
  return decoded;
}

function classroomCourseSourceId(url: URL, field: string): string {
  if (url.hostname !== 'classroom.google.com') {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} must be a Classroom course URL.`);
  }
  const match = url.pathname.match(/^\/c\/([^/]+)/);
  if (!match?.[1]) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} must include a Classroom course identifier.`);
  }
  return validSourceId(match[1], field);
}

function classroomItemSourceIds(url: URL, field: string): { courseSourceId: string; itemSourceId: string } {
  if (url.hostname !== 'classroom.google.com') {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} must be a Classroom item URL.`);
  }
  const match = url.pathname.match(/^\/c\/([^/]+)\/(?:a|m|p|q|sa)\/([^/]+)/);
  if (!match?.[1] || !match[2]) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_URL', `${field} must include course and item identifiers.`);
  }
  return {
    courseSourceId: validSourceId(match[1], field),
    itemSourceId: validSourceId(match[2], field),
  };
}

function stableId(namespace: string, ...parts: string[]): string {
  const digest = createHash('sha256')
    .update(`millennium:classroom:${namespace}:v1\0`, 'utf8')
    .update(parts.join('\0'), 'utf8')
    .digest('base64url')
    .slice(0, 24);
  return `${namespace}_${digest}`;
}

function normalizeCourse(value: unknown, index: number): { course: ClassroomCourse; sourceId: string } {
  const record = requiredRecord(value, `courses[${index}]`);
  const url = canonicalGoogleUrl(record.url, `courses[${index}].url`);
  const sourceId = classroomCourseSourceId(url, `courses[${index}].url`);
  const title = plainText(record.title, `courses[${index}].title`, MAX_TITLE_LENGTH, true);
  const section = plainText(record.section, `courses[${index}].section`, MAX_SHORT_TEXT_LENGTH);
  const room = plainText(record.room, `courses[${index}].room`, MAX_SHORT_TEXT_LENGTH);
  const teacher = plainText(record.teacher, `courses[${index}].teacher`, MAX_SHORT_TEXT_LENGTH);
  if (!title) throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', 'Course title is required.');

  return {
    sourceId,
    course: {
      id: stableId('course', sourceId),
      title,
      url: url.toString(),
      ...(section ? { section } : {}),
      ...(room ? { room } : {}),
      ...(teacher ? { teacher } : {}),
    },
  };
}

function normalizeSubmission(value: unknown, field: string): ClassroomSubmission | undefined {
  if (value === undefined || value === null) return undefined;
  const record = requiredRecord(value, field);
  const status = plainText(record.status, `${field}.status`, 40, true);
  if (!status || !SUBMISSION_STATUSES.has(status as ClassroomSubmissionStatus)) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field}.status is invalid.`);
  }
  const grade = optionalNumber(record.grade, `${field}.grade`);
  const maxPoints = optionalNumber(record.maxPoints, `${field}.maxPoints`);
  return {
    status: status as ClassroomSubmissionStatus,
    ...(grade === undefined ? {} : { grade }),
    ...(maxPoints === undefined ? {} : { maxPoints }),
  };
}

function attachmentSourceId(url: URL): string {
  const patterns = [
    /^\/file\/d\/([^/]+)/,
    /^\/(?:document|spreadsheets|presentation|forms)\/d\/([^/]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.pathname.match(pattern);
    if (match?.[1]) return validSourceId(match[1], 'attachment.url');
  }
  return stableId('link', url.toString());
}

function normalizeAttachment(value: unknown, field: string): ClassroomAttachment {
  const record = requiredRecord(value, field);
  const url = canonicalGoogleUrl(record.url, `${field}.url`);
  const name = plainText(record.name, `${field}.name`, MAX_TITLE_LENGTH, true);
  const kind = plainText(record.kind, `${field}.kind`, 40, true);
  if (!name || !kind || !ATTACHMENT_KINDS.has(kind as ClassroomAttachmentKind)) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `${field} is invalid.`);
  }
  return {
    id: stableId('attachment', url.hostname, attachmentSourceId(url)),
    name,
    url: url.toString(),
    kind: kind as ClassroomAttachmentKind,
  };
}

function normalizeItem(
  value: unknown,
  index: number,
  courseIdsBySource: ReadonlyMap<string, string>,
): ClassroomItem {
  const record = requiredRecord(value, `items[${index}]`);
  const url = canonicalGoogleUrl(record.url, `items[${index}].url`);
  const { courseSourceId, itemSourceId } = classroomItemSourceIds(url, `items[${index}].url`);
  const courseId = courseIdsBySource.get(courseSourceId);
  if (!courseId) {
    throw new ClassroomDataValidationError(
      'INVALID_CLASSROOM_DATA',
      `items[${index}] references a course that is not present in the snapshot.`,
    );
  }

  const title = plainText(record.title, `items[${index}].title`, MAX_TITLE_LENGTH, true);
  const kind = plainText(record.kind, `items[${index}].kind`, 40, true);
  if (!title || !kind || !ITEM_KINDS.has(kind as ClassroomItemKind)) {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', `items[${index}] is invalid.`);
  }

  const attachments = requiredArray(
    record.attachments ?? [],
    `items[${index}].attachments`,
    CLASSROOM_MAX_ATTACHMENTS_PER_ITEM,
  ).map((attachment, attachmentIndex) => normalizeAttachment(attachment, `items[${index}].attachments[${attachmentIndex}]`));
  const uniqueAttachments = Array.from(new Map(attachments.map((attachment) => [attachment.id, attachment])).values());
  const description = plainText(record.description, `items[${index}].description`, MAX_DESCRIPTION_LENGTH);
  const postedAt = isoDate(record.postedAt, `items[${index}].postedAt`);
  const dueAt = isoDate(record.dueAt, `items[${index}].dueAt`);
  const submission = normalizeSubmission(record.submission, `items[${index}].submission`);

  return {
    id: stableId('item', courseSourceId, itemSourceId),
    courseId,
    kind: kind as ClassroomItemKind,
    title,
    url: url.toString(),
    ...(description ? { description } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(submission ? { submission } : {}),
    attachments: uniqueAttachments,
  };
}

function normalizeCoverage(value: unknown): ClassroomCoverage {
  const record = requiredRecord(value, 'coverage');
  const issues = requiredArray(record.issues ?? [], 'coverage.issues', CLASSROOM_MAX_ISSUES)
    .map((issue, index) => plainText(issue, `coverage.issues[${index}]`, MAX_SHORT_TEXT_LENGTH, true))
    .filter((issue): issue is string => Boolean(issue));

  return {
    courseListVisited: requiredBoolean(record.courseListVisited, 'coverage.courseListVisited'),
    courseListComplete: requiredBoolean(record.courseListComplete, 'coverage.courseListComplete'),
    emptyStateObserved: requiredBoolean(record.emptyStateObserved, 'coverage.emptyStateObserved'),
    coursesObserved: boundedInteger(record.coursesObserved, 'coverage.coursesObserved', CLASSROOM_MAX_COURSES),
    coursePagesVisited: boundedInteger(record.coursePagesVisited, 'coverage.coursePagesVisited', CLASSROOM_MAX_COURSES),
    coursePagesFailed: boundedInteger(record.coursePagesFailed, 'coverage.coursePagesFailed', CLASSROOM_MAX_COURSES),
    issues: Array.from(new Set(issues)),
  };
}

export function getClassroomCounts(courses: readonly ClassroomCourse[], items: readonly ClassroomItem[]): ClassroomCounts {
  const counts: ClassroomCounts = {
    courses: courses.length,
    items: items.length,
    attachments: 0,
    assigned: 0,
    turnedIn: 0,
    returned: 0,
    missing: 0,
    graded: 0,
  };

  return items.reduce<ClassroomCounts>((current, item) => {
    const status = item.submission?.status;
    return {
      ...current,
      attachments: current.attachments + item.attachments.length,
      assigned: current.assigned + (status === 'assigned' ? 1 : 0),
      turnedIn: current.turnedIn + (status === 'turned-in' ? 1 : 0),
      returned: current.returned + (status === 'returned' ? 1 : 0),
      missing: current.missing + (status === 'missing' ? 1 : 0),
      graded: current.graded + (status === 'graded' ? 1 : 0),
    };
  }, counts);
}

function snapshotIntegrity(
  coverage: ClassroomCoverage,
  courses: readonly ClassroomCourse[],
  items: readonly ClassroomItem[],
): ClassroomSnapshotIntegrity {
  if (courses.length === 0 && items.length === 0) {
    if (
      coverage.courseListVisited
      && coverage.courseListComplete
      && coverage.emptyStateObserved
      && coverage.coursesObserved === 0
      && coverage.coursePagesVisited === 0
      && coverage.coursePagesFailed === 0
      && coverage.issues.length === 0
    ) {
      return 'verified-empty';
    }
    throw new ClassroomDataValidationError(
      'UNVERIFIED_EMPTY_CLASSROOM_DATA',
      'An empty Classroom snapshot requires explicit verified-empty evidence.',
    );
  }

  if (
    !coverage.courseListVisited
    || !coverage.courseListComplete
    || coverage.coursePagesFailed > 0
    || coverage.issues.length > 0
    || coverage.coursesObserved > courses.length
    || coverage.coursePagesVisited < courses.length
  ) {
    return 'partial';
  }
  return 'complete';
}

export function normalizeClassroomSnapshot(value: unknown): ClassroomSnapshot {
  const record = requiredRecord(value, 'snapshot');
  if (record.version !== 1) {
    throw new ClassroomDataValidationError('UNSUPPORTED_CLASSROOM_DATA_VERSION', 'Classroom snapshot version is unsupported.');
  }

  const rawCourses = requiredArray(record.courses, 'courses', CLASSROOM_MAX_COURSES);
  const normalizedCourses = rawCourses.map(normalizeCourse);
  const dedupedCourseRecords = Array.from(
    new Map(normalizedCourses.map((entry) => [entry.course.id, entry])).values(),
  );
  const courses = dedupedCourseRecords.map((entry) => entry.course);
  const courseIdsBySource = new Map(dedupedCourseRecords.map((entry) => [entry.sourceId, entry.course.id]));

  const rawItems = requiredArray(record.items, 'items', CLASSROOM_MAX_ITEMS);
  const normalizedItems = rawItems.map((item, index) => normalizeItem(item, index, courseIdsBySource));
  const items = Array.from(new Map(normalizedItems.map((item) => [item.id, item])).values());
  const totalAttachments = items.reduce((total, item) => total + item.attachments.length, 0);
  if (totalAttachments > CLASSROOM_MAX_TOTAL_ATTACHMENTS) {
    throw new ClassroomDataValidationError(
      'CLASSROOM_DATA_LIMIT_EXCEEDED',
      'Classroom snapshot exceeds the total attachment limit.',
    );
  }

  const coverage = normalizeCoverage(record.coverage);
  const syncRecord = requiredRecord(record.sync, 'sync');
  const extractorVersion = plainText(
    syncRecord.extractorVersion,
    'sync.extractorVersion',
    MAX_EXTRACTOR_VERSION_LENGTH,
    true,
  );
  const syncedAt = isoDate(syncRecord.syncedAt, 'sync.syncedAt', true);
  const accountHint = plainText(syncRecord.accountHint, 'sync.accountHint', MAX_ACCOUNT_HINT_LENGTH);
  if (!extractorVersion || !syncedAt || syncRecord.source !== 'desktop-browser') {
    throw new ClassroomDataValidationError('INVALID_CLASSROOM_DATA', 'Classroom sync metadata is invalid.');
  }

  return {
    version: 1,
    courses,
    items,
    coverage,
    sync: {
      source: 'desktop-browser',
      extractorVersion,
      syncedAt,
      ...(accountHint ? { accountHint } : {}),
      integrity: snapshotIntegrity(coverage, courses, items),
      counts: getClassroomCounts(courses, items),
    },
  };
}

export function canReplaceClassroomSnapshot(
  existing: ClassroomSnapshot | null,
  incoming: ClassroomSnapshot,
): boolean {
  if (existing === null) return true;
  return incoming.sync.integrity !== 'partial'
    && new Date(incoming.sync.syncedAt).getTime() >= new Date(existing.sync.syncedAt).getTime();
}
