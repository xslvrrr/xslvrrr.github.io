/**
 * Automatic routing of notices into notification folders.
 *
 * Rules are evaluated in order and the first match wins, so reordering a rule list changes
 * routing deterministically. Routing never overwrites a folder the reader chose by hand:
 * `NotificationState.folderManual` always takes priority over anything decided here.
 */

import type { Notice, NotificationCategory } from '../types/portal';

export type NotificationRuleField = 'title' | 'content' | 'any';

export type NotificationRuleMatch = 'contains' | 'starts-with' | 'equals';

/**
 * Built-in tabs a rule may file into.
 *
 * Pinned and Archive are deliberately absent: they are per-notice states with their own
 * controls (the pin button, the auto-archive age setting), not destinations. Routing only
 * decides which content tab or folder a notice belongs to.
 */
export const ROUTABLE_CATEGORIES: readonly NotificationCategory[] = [
  'inbox', 'alerts', 'events', 'assignments',
];

export type NotificationRuleTargetKind = 'category' | 'folder';

export interface NotificationRuleTarget {
  kind: NotificationRuleTargetKind;
  /** Category id for `category` targets, folder id for `folder` targets. */
  id: string;
}

export interface NotificationRule {
  id: string;
  target: NotificationRuleTarget;
  field: NotificationRuleField;
  match: NotificationRuleMatch;
  value: string;
  enabled: boolean;
}

const RULE_FIELDS: readonly NotificationRuleField[] = ['title', 'content', 'any'];
const RULE_MATCHES: readonly NotificationRuleMatch[] = ['contains', 'starts-with', 'equals'];

/** Encodes a target as one select value so the editor can offer both kinds in one list. */
export function encodeRuleTarget(target: NotificationRuleTarget): string {
  return `${target.kind}:${target.id}`;
}

export function decodeRuleTarget(value: string): NotificationRuleTarget | null {
  const separator = value.indexOf(':');
  if (separator < 0) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id) return null;
  if (kind === 'category') {
    return ROUTABLE_CATEGORIES.includes(id as NotificationCategory) ? { kind, id } : null;
  }
  return kind === 'folder' ? { kind, id } : null;
}

function normalizeTarget(value: unknown): NotificationRuleTarget | null {
  if (!value || typeof value !== 'object') return null;
  const target = value as Partial<NotificationRuleTarget>;
  if (typeof target.id !== 'string' || !target.id) return null;
  if (target.kind === 'folder') return { kind: 'folder', id: target.id };
  if (target.kind === 'category') {
    return ROUTABLE_CATEGORIES.includes(target.id as NotificationCategory)
      ? { kind: 'category', id: target.id }
      : null;
  }
  return null;
}

export function normalizeNotificationRules(value: unknown): NotificationRule[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const rule = entry as Partial<NotificationRule> & { folderId?: unknown };

    // Rules saved before targets existed carried a bare `folderId`.
    const target = normalizeTarget(rule.target)
      ?? (typeof rule.folderId === 'string' && rule.folderId
        ? { kind: 'folder' as const, id: rule.folderId }
        : null);

    if (
      !target ||
      typeof rule.id !== 'string' || !rule.id ||
      typeof rule.value !== 'string' ||
      !RULE_FIELDS.includes(rule.field as NotificationRuleField) ||
      !RULE_MATCHES.includes(rule.match as NotificationRuleMatch) ||
      typeof rule.enabled !== 'boolean'
    ) {
      return [];
    }

    return [{
      id: rule.id,
      target,
      field: rule.field as NotificationRuleField,
      match: rule.match as NotificationRuleMatch,
      value: rule.value,
      enabled: rule.enabled,
    }];
  });
}

function getRuleHaystack(notice: Notice, field: NotificationRuleField): string {
  const title = (notice.title || '').toLowerCase();
  const body = `${notice.preview || ''} ${notice.content || ''}`.toLowerCase();
  if (field === 'title') return title;
  if (field === 'content') return body;
  return `${title} ${body}`;
}

function matchesRule(notice: Notice, rule: NotificationRule): boolean {
  const needle = rule.value.trim().toLowerCase();
  if (!needle) return false;

  const haystack = getRuleHaystack(notice, rule.field);
  if (rule.match === 'equals') return haystack.trim() === needle;
  if (rule.match === 'starts-with') return haystack.trim().startsWith(needle);
  return haystack.includes(needle);
}

/**
 * Returns the destination a notice should be routed to, or undefined when no enabled rule
 * matches or the matched rule points at a folder that no longer exists.
 */
export function resolveRuleTarget(
  notice: Notice,
  rules: readonly NotificationRule[],
  existingFolderIds: ReadonlySet<string>
): NotificationRuleTarget | undefined {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.target.kind === 'folder' && !existingFolderIds.has(rule.target.id)) continue;
    if (matchesRule(notice, rule)) return rule.target;
  }
  return undefined;
}
