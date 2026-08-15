/**
 * Server-side access to the feedback queue.
 *
 * Every call goes through a `security definer` RPC that re-checks administrator status in the
 * database, so this module only translates payloads and database error codes into the shapes the
 * API routes return. See `supabase/migrations/202608150001_feedback_reports.sql` and
 * `202608150002_feedback_responses.sql`.
 */

import { supabaseAdmin } from '../supabase';
import {
  type BugCategory,
  type FeedbackKind,
  type FeedbackStatus,
  type FeedbackSubmission,
  type SuggestionType,
} from './options';

export class FeedbackActionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'FeedbackActionError';
    this.status = status;
  }
}

export interface FeedbackReporter {
  id: string | null;
  name: string;
  email: string;
  school: string;
  suspended: boolean;
}

export interface FeedbackQueueReport {
  id: string;
  kind: FeedbackKind;
  area: string | null;
  bugCategory: BugCategory | null;
  bugCategoryOther: string | null;
  suggestionType: SuggestionType | null;
  details: string;
  createdAt: string;
  reporter: FeedbackReporter;
}

export interface FeedbackQueue {
  pending: number;
  reports: FeedbackQueueReport[];
}

export type FeedbackAppealStatus = 'pending' | 'accepted' | 'declined';

export interface FeedbackSuspension {
  userId: string;
  name: string;
  email: string;
  expiresAt: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  appealStatus: FeedbackAppealStatus | null;
}

export interface FeedbackAppeal {
  userId: string;
  name: string;
  email: string;
  status: FeedbackAppealStatus;
  message: string;
  submittedAt: string;
  response: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  reason: string | null;
}

/** The reporter's own view of a report, including whatever an administrator wrote back. */
export interface UserFeedbackReport {
  id: string;
  kind: FeedbackKind;
  area: string | null;
  bugCategory: BugCategory | null;
  bugCategoryOther: string | null;
  suggestionType: SuggestionType | null;
  details: string;
  status: FeedbackStatus;
  adminMessage: string | null;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  createdAt: string;
  reviewedAt: string | null;
  responseSeen: boolean;
}

export interface UserSuspensionState {
  active: boolean;
  expiresAt: string | null;
  reason: string | null;
  createdAt: string;
  acknowledged: boolean;
  seen: boolean;
  appeal: {
    status: FeedbackAppealStatus;
    message: string;
    submittedAt: string;
    response: string | null;
    reviewedAt: string | null;
    seen: boolean;
  } | null;
}

export interface UserFeedbackOverview {
  suspension: UserSuspensionState | null;
  reports: UserFeedbackReport[];
}

/** How many pending reports the queue endpoint returns in one poll. */
const QUEUE_PAGE_SIZE = 25;

function throwFeedbackDatabaseError(error: unknown): never {
  const message = String((error as { message?: unknown })?.message || '');
  if (message.includes('ADMIN_NOT_AUTHORIZED')) {
    throw new FeedbackActionError('Administrator access required.', 403);
  }
  if (message.includes('FEEDBACK_SUSPENDED')) {
    throw new FeedbackActionError(
      'Your account is currently suspended from submitting reports.',
      403,
    );
  }
  if (message.includes('FEEDBACK_ALREADY_REVIEWED')) {
    throw new FeedbackActionError('Another administrator already handled this report.', 409);
  }
  if (message.includes('FEEDBACK_SUSPENSION_NOT_FOUND')) {
    throw new FeedbackActionError('That account is not suspended.', 404);
  }
  if (message.includes('FEEDBACK_USER_NOT_FOUND')) {
    throw new FeedbackActionError('That account could not be found.', 404);
  }
  if (message.includes('FEEDBACK_STATUS_INVALID')) {
    throw new FeedbackActionError('That review decision is not valid.', 400);
  }
  if (message.includes('FEEDBACK_APPEAL_ALREADY_SENT')) {
    throw new FeedbackActionError('You have already appealed this suspension.', 409);
  }
  if (message.includes('FEEDBACK_APPEAL_NOT_PENDING')) {
    throw new FeedbackActionError('That appeal has already been answered.', 409);
  }
  if (message.includes('FEEDBACK_NOT_SUSPENDED')) {
    throw new FeedbackActionError('Your account is not suspended.', 409);
  }
  throw error;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function submitFeedbackReport({
  userId,
  submission,
}: {
  userId: string;
  submission: FeedbackSubmission;
}): Promise<{ id: string; pending: number }> {
  const { data, error } = await supabaseAdmin.rpc('feedback_submit_report', {
    p_user_id: userId,
    p_kind: submission.kind,
    p_area: submission.area,
    p_bug_category: submission.bugCategory,
    p_bug_category_other: submission.bugCategoryOther,
    p_suggestion_type: submission.suggestionType,
    p_details: submission.details,
  });
  if (error) throwFeedbackDatabaseError(error);

  const record = asRecord(data);
  return {
    id: asString(record.id),
    pending: Math.max(0, Number(record.pending) || 0),
  };
}

export async function loadFeedbackQueue(actorUserId: string): Promise<FeedbackQueue> {
  const { data, error } = await supabaseAdmin.rpc('feedback_admin_queue', {
    p_actor_user_id: actorUserId,
    p_limit: QUEUE_PAGE_SIZE,
  });
  if (error) throwFeedbackDatabaseError(error);

  const record = asRecord(data);
  const rows = Array.isArray(record.reports) ? record.reports : [];

  return {
    pending: Math.max(0, Number(record.pending) || 0),
    reports: rows.map((row) => {
      const report = asRecord(row);
      const reporter = asRecord(report.reporter);
      return {
        id: asString(report.id),
        kind: report.kind === 'suggestion' ? 'suggestion' : 'bug',
        area: asNullableString(report.area),
        bugCategory: asNullableString(report.bugCategory) as BugCategory | null,
        bugCategoryOther: asNullableString(report.bugCategoryOther),
        suggestionType: asNullableString(report.suggestionType) as SuggestionType | null,
        details: asString(report.details),
        createdAt: asString(report.createdAt),
        reporter: {
          id: asNullableString(reporter.id),
          name: asString(reporter.name),
          email: asString(reporter.email),
          school: asString(reporter.school),
          suspended: reporter.suspended === true,
        },
      };
    }),
  };
}

/**
 * Reads one pending report so the server can compose a GitHub issue from stored answers rather than
 * from whatever the administrator's browser posted back. Callers check administrator status first.
 */
export async function readPendingFeedbackReport(reportId: string): Promise<FeedbackQueueReport> {
  const { data, error } = await supabaseAdmin
    .from('feedback_reports')
    .select('id, user_id, kind, area, bug_category, bug_category_other, suggestion_type, details, created_at, status')
    .eq('id', reportId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new FeedbackActionError('That report could not be found.', 404);
  if (data.status !== 'pending') {
    throw new FeedbackActionError('Another administrator already handled this report.', 409);
  }

  return {
    id: asString(data.id, reportId),
    kind: data.kind === 'suggestion' ? 'suggestion' : 'bug',
    area: asNullableString(data.area),
    bugCategory: asNullableString(data.bug_category) as BugCategory | null,
    bugCategoryOther: asNullableString(data.bug_category_other),
    suggestionType: asNullableString(data.suggestion_type) as SuggestionType | null,
    details: asString(data.details),
    createdAt: asString(data.created_at),
    reporter: {
      id: asNullableString(data.user_id),
      name: '',
      email: '',
      school: '',
      suspended: false,
    },
  };
}

export async function resolveFeedbackReport({
  actorUserId,
  reportId,
  status,
  githubIssueNumber = null,
  githubIssueUrl = null,
  adminMessage = null,
}: {
  actorUserId: string;
  reportId: string;
  status: 'accepted' | 'dismissed';
  githubIssueNumber?: number | null;
  githubIssueUrl?: string | null;
  adminMessage?: string | null;
}): Promise<{ id: string; pending: number }> {
  const { data, error } = await supabaseAdmin.rpc('feedback_admin_resolve', {
    p_actor_user_id: actorUserId,
    p_report_id: reportId,
    p_status: status,
    p_github_issue_number: githubIssueNumber,
    p_github_issue_url: githubIssueUrl,
    p_admin_message: adminMessage,
  });
  if (error) throwFeedbackDatabaseError(error);

  const record = asRecord(data);
  return { id: asString(record.id, reportId), pending: Math.max(0, Number(record.pending) || 0) };
}

export async function setFeedbackSuspension({
  actorUserId,
  targetUserId,
  expiresAt,
  reason = null,
}: {
  actorUserId: string;
  targetUserId: string;
  expiresAt: Date | null;
  reason?: string | null;
}): Promise<{ userId: string; expiresAt: string | null }> {
  const { data, error } = await supabaseAdmin.rpc('feedback_admin_set_suspension', {
    p_actor_user_id: actorUserId,
    p_target_user_id: targetUserId,
    p_expires_at: expiresAt ? expiresAt.toISOString() : null,
    p_reason: reason,
  });
  if (error) throwFeedbackDatabaseError(error);

  const record = asRecord(data);
  return {
    userId: asString(record.userId, targetUserId),
    expiresAt: asNullableString(record.expiresAt),
  };
}

export async function clearFeedbackSuspension({
  actorUserId,
  targetUserId,
}: {
  actorUserId: string;
  targetUserId: string;
}): Promise<{ userId: string }> {
  const { error } = await supabaseAdmin.rpc('feedback_admin_clear_suspension', {
    p_actor_user_id: actorUserId,
    p_target_user_id: targetUserId,
  });
  if (error) throwFeedbackDatabaseError(error);
  return { userId: targetUserId };
}

export async function listFeedbackSuspensions(actorUserId: string): Promise<FeedbackSuspension[]> {
  const { data, error } = await supabaseAdmin.rpc('feedback_admin_list_suspensions', {
    p_actor_user_id: actorUserId,
  });
  if (error) throwFeedbackDatabaseError(error);

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const suspension = asRecord(row);
    return {
      userId: asString(suspension.userId),
      name: asString(suspension.name),
      email: asString(suspension.email),
      expiresAt: asNullableString(suspension.expiresAt),
      reason: asNullableString(suspension.reason),
      createdAt: asString(suspension.createdAt),
      updatedAt: asString(suspension.updatedAt),
      appealStatus: asNullableString(suspension.appealStatus) as FeedbackAppealStatus | null,
    };
  });
}

export async function listFeedbackAppeals(actorUserId: string): Promise<FeedbackAppeal[]> {
  const { data, error } = await supabaseAdmin.rpc('feedback_admin_appeals', {
    p_actor_user_id: actorUserId,
  });
  if (error) throwFeedbackDatabaseError(error);

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const appeal = asRecord(row);
    return {
      userId: asString(appeal.userId),
      name: asString(appeal.name),
      email: asString(appeal.email),
      status: (asNullableString(appeal.status) ?? 'pending') as FeedbackAppealStatus,
      message: asString(appeal.message),
      submittedAt: asString(appeal.submittedAt),
      response: asNullableString(appeal.response),
      reviewedAt: asNullableString(appeal.reviewedAt),
      expiresAt: asNullableString(appeal.expiresAt),
      reason: asNullableString(appeal.reason),
    };
  });
}

export async function resolveFeedbackAppeal({
  actorUserId,
  targetUserId,
  status,
  response = null,
}: {
  actorUserId: string;
  targetUserId: string;
  status: 'accepted' | 'declined';
  response?: string | null;
}): Promise<{ userId: string; status: string }> {
  const { data, error } = await supabaseAdmin.rpc('feedback_admin_resolve_appeal', {
    p_actor_user_id: actorUserId,
    p_target_user_id: targetUserId,
    p_status: status,
    p_response: response,
  });
  if (error) throwFeedbackDatabaseError(error);

  const record = asRecord(data);
  return {
    userId: asString(record.userId, targetUserId),
    status: asString(record.status, status),
  };
}

/**
 * Everything a reporter is entitled to see about their own reports.
 *
 * One call backs three surfaces: the report dialog (is this account suspended), the settings history
 * table, and the toasts raised when an administrator answers something.
 */
export async function loadUserFeedbackOverview(userId: string): Promise<UserFeedbackOverview> {
  const { data, error } = await supabaseAdmin.rpc('feedback_user_overview', {
    p_user_id: userId,
    p_limit: 25,
  });
  if (error) throwFeedbackDatabaseError(error);

  const record = asRecord(data);
  const suspensionRecord = record.suspension ? asRecord(record.suspension) : null;
  const appealRecord = suspensionRecord?.appeal ? asRecord(suspensionRecord.appeal) : null;
  const rows = Array.isArray(record.reports) ? record.reports : [];

  return {
    suspension: suspensionRecord
      ? {
        active: suspensionRecord.active === true,
        expiresAt: asNullableString(suspensionRecord.expiresAt),
        reason: asNullableString(suspensionRecord.reason),
        createdAt: asString(suspensionRecord.createdAt),
        acknowledged: suspensionRecord.acknowledged === true,
        seen: suspensionRecord.seen === true,
        appeal: appealRecord
          ? {
            status: (asNullableString(appealRecord.status) ?? 'pending') as FeedbackAppealStatus,
            message: asString(appealRecord.message),
            submittedAt: asString(appealRecord.submittedAt),
            response: asNullableString(appealRecord.response),
            reviewedAt: asNullableString(appealRecord.reviewedAt),
            seen: appealRecord.seen === true,
          }
          : null,
      }
      : null,
    reports: rows.map((row) => {
      const report = asRecord(row);
      const issueNumber = Number(report.githubIssueNumber);
      return {
        id: asString(report.id),
        kind: report.kind === 'suggestion' ? 'suggestion' : 'bug',
        area: asNullableString(report.area),
        bugCategory: asNullableString(report.bugCategory) as BugCategory | null,
        bugCategoryOther: asNullableString(report.bugCategoryOther),
        suggestionType: asNullableString(report.suggestionType) as SuggestionType | null,
        details: asString(report.details),
        status: (asNullableString(report.status) ?? 'pending') as FeedbackStatus,
        adminMessage: asNullableString(report.adminMessage),
        githubIssueNumber: Number.isInteger(issueNumber) ? issueNumber : null,
        githubIssueUrl: asNullableString(report.githubIssueUrl),
        createdAt: asString(report.createdAt),
        reviewedAt: asNullableString(report.reviewedAt),
        responseSeen: report.responseSeen === true,
      };
    }),
  };
}

/** Marks outcomes as shown so the dashboard raises each toast exactly once. */
export async function markFeedbackNoticesSeen({
  userId,
  reportIds = [],
  markSuspension = false,
  markAppeal = false,
}: {
  userId: string;
  reportIds?: readonly string[];
  markSuspension?: boolean;
  markAppeal?: boolean;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc('feedback_mark_notices_seen', {
    p_user_id: userId,
    p_report_ids: reportIds.length > 0 ? [...reportIds] : null,
    p_mark_suspension: markSuspension,
    p_mark_appeal: markAppeal,
  });
  if (error) throwFeedbackDatabaseError(error);
}

export async function acknowledgeFeedbackSuspension(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('feedback_acknowledge_suspension', {
    p_user_id: userId,
  });
  if (error) throwFeedbackDatabaseError(error);
}

export async function submitFeedbackAppeal({
  userId,
  message,
}: {
  userId: string;
  message: string;
}): Promise<{ submittedAt: string }> {
  const { data, error } = await supabaseAdmin.rpc('feedback_submit_appeal', {
    p_user_id: userId,
    p_message: message,
  });
  if (error) throwFeedbackDatabaseError(error);

  return { submittedAt: asString(asRecord(data).submittedAt) };
}
