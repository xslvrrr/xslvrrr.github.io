/**
 * Issue creation for accepted feature suggestions and bug reports.
 *
 * Authentication is a single server-side token (`GITHUB_ISSUES_TOKEN`) rather than a per-
 * administrator credential, so no browser ever holds it and there is nothing to sign in to. The
 * same token backs the issue list administrators read from the administrator page.
 */

import { logger } from '../logger';
import {
  bugCategoryLabel,
  suggestionTypeLabel,
  type FeedbackKind,
  type BugCategory,
  type SuggestionType,
} from './options';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const DEFAULT_REPOSITORY = 'xslvrrr/xslvrrr.github.io';
const REQUEST_TIMEOUT_MS = 10_000;

export class GithubIssueError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GithubIssueError';
    this.status = status;
  }
}

function repositorySlug(): string {
  return process.env.GITHUB_ISSUES_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
}

function issuesToken(): string | null {
  return process.env.GITHUB_ISSUES_TOKEN?.trim() || null;
}

/** The repository issues are filed in and read from, shown beside the list. */
export function githubIssueRepository(): string {
  return repositorySlug();
}

export interface FeedbackIssueInput {
  readonly id: string;
  readonly kind: FeedbackKind;
  readonly area: string | null;
  readonly bugCategory: BugCategory | null;
  readonly bugCategoryOther: string | null;
  readonly suggestionType: SuggestionType | null;
  readonly details: string;
  readonly createdAt: string;
}

export interface GithubIssueResult {
  readonly number: number;
  readonly url: string;
}

function issueTitle(report: FeedbackIssueInput): string {
  if (report.kind === 'bug') {
    const category = report.bugCategory === 'other'
      ? report.bugCategoryOther || 'Other'
      : bugCategoryLabel(report.bugCategory ?? 'other');
    return `[Bug] ${report.area ?? 'Millennium'} — ${category}`.slice(0, 200);
  }
  return `[Suggestion] ${suggestionTypeLabel(report.suggestionType ?? 'new-concept')}`.slice(0, 200);
}

/**
 * The reporter is deliberately absent from the issue body. Issues are public, the report is not, and
 * nothing in triage needs the account behind it — the administrator queue already shows who filed it.
 */
function issueBody(report: FeedbackIssueInput): string {
  const rows = report.kind === 'bug'
    ? [
      ['Area', report.area ?? '—'],
      [
        'Category',
        report.bugCategory === 'other'
          ? `Other — ${report.bugCategoryOther || '—'}`
          : bugCategoryLabel(report.bugCategory ?? 'other'),
      ],
    ]
    : [['Suggestion type', suggestionTypeLabel(report.suggestionType ?? 'new-concept')]];

  const heading = report.kind === 'bug'
    ? '### Description and steps to reproduce'
    : '### Requested behaviour';

  return [
    ...rows.map(([label, value]) => `**${label}:** ${value}`),
    '',
    heading,
    '',
    report.details,
    '',
    '---',
    `Submitted through Millennium on ${report.createdAt}. Internal reference \`${report.id}\`.`,
  ].join('\n');
}

function issueLabels(kind: FeedbackKind): string[] {
  return kind === 'bug' ? ['bug', 'from-millennium'] : ['enhancement', 'from-millennium'];
}

/** Maps a GitHub failure onto a message an administrator can act on. */
function describeFailure(status: number, body: string): GithubIssueError {
  if (status === 401 || status === 403) {
    return new GithubIssueError('GitHub rejected the configured token. Check GITHUB_ISSUES_TOKEN.', 502);
  }
  if (status === 404) {
    return new GithubIssueError(
      `GitHub could not find ${repositorySlug()}, or the token cannot write to it.`,
      502,
    );
  }
  if (status === 410) {
    return new GithubIssueError(`Issues are disabled on ${repositorySlug()}.`, 502);
  }
  if (status === 422) {
    return new GithubIssueError('GitHub rejected the issue contents.', 502);
  }
  logger.error('GitHub request failed', { status, body: body.slice(0, 500) });
  return new GithubIssueError('GitHub could not complete the request.', 502);
}

async function githubRequest(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(`${GITHUB_API_ORIGIN}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'millennium-feedback',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error('GitHub request did not complete', error);
    throw new GithubIssueError('GitHub could not be reached.', 504);
  }
}

function postIssue(token: string, body: Record<string, unknown>): Promise<Response> {
  return githubRequest(token, `/repos/${repositorySlug()}/issues`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface GithubIssueSummary {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: string;
  readonly labels: readonly string[];
  readonly comments: number;
  readonly createdAt: string;
}

/** How many issues the administrator list shows. Enough to scan, small enough to stay one request. */
const ISSUE_LIST_PAGE_SIZE = 30;

function toIssueSummary(value: unknown): GithubIssueSummary | null {
  if (!value || typeof value !== 'object') return null;
  const issue = value as Record<string, unknown>;
  // The issues endpoint also returns pull requests; they are not issues to triage.
  if ('pull_request' in issue) return null;

  const number = Number(issue.number);
  const url = typeof issue.html_url === 'string' ? issue.html_url : '';
  if (!Number.isInteger(number) || !url) return null;

  return {
    number,
    title: typeof issue.title === 'string' ? issue.title : `Issue #${number}`,
    url,
    state: issue.state === 'closed' ? 'closed' : 'open',
    labels: Array.isArray(issue.labels)
      ? issue.labels
        .map((label) => (label && typeof label === 'object'
          ? String((label as { name?: unknown }).name ?? '')
          : String(label)))
        .filter((label) => label.length > 0)
      : [],
    comments: Math.max(0, Number(issue.comments) || 0),
    createdAt: typeof issue.created_at === 'string' ? issue.created_at : '',
  };
}

/**
 * Lists the repository's issues so administrators can read them without leaving the site.
 *
 * `state` follows GitHub's own vocabulary. Pull requests are filtered out because GitHub returns
 * them from this endpoint too, and they are not something the report queue ever produced.
 */
export async function listRepositoryIssues(
  state: 'open' | 'closed' | 'all' = 'open',
): Promise<GithubIssueSummary[]> {
  const token = issuesToken();
  if (!token) {
    throw new GithubIssueError('GitHub issue access is not configured on this server.', 503);
  }

  const query = new URLSearchParams({
    state,
    per_page: String(ISSUE_LIST_PAGE_SIZE),
    sort: 'created',
    direction: 'desc',
  });
  const response = await githubRequest(token, `/repos/${repositorySlug()}/issues?${query}`);
  if (!response.ok) {
    throw describeFailure(response.status, await response.text().catch(() => ''));
  }

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) {
    throw new GithubIssueError('GitHub returned an unexpected issue list.', 502);
  }
  return payload.map(toIssueSummary).filter((issue): issue is GithubIssueSummary => issue !== null);
}

export async function createFeedbackIssue(report: FeedbackIssueInput): Promise<GithubIssueResult> {
  const token = issuesToken();
  if (!token) {
    throw new GithubIssueError('GitHub issue creation is not configured on this server.', 503);
  }

  const content = { title: issueTitle(report), body: issueBody(report) };
  let response = await postIssue(token, { ...content, labels: issueLabels(report.kind) });

  // A repository that has deleted the default labels rejects the whole issue with 422. The triage
  // labels are a convenience, not the point of the request, so the issue is filed without them.
  if (response.status === 422) {
    logger.error('GitHub rejected the feedback issue labels; retrying without them', {
      repository: repositorySlug(),
    });
    response = await postIssue(token, content);
  }

  if (!response.ok) {
    throw describeFailure(response.status, await response.text().catch(() => ''));
  }

  const payload = await response.json().catch(() => null) as { number?: unknown; html_url?: unknown } | null;
  const number = Number(payload?.number);
  const url = typeof payload?.html_url === 'string' ? payload.html_url : '';
  if (!Number.isInteger(number) || !url) {
    throw new GithubIssueError('GitHub returned an issue without a number or URL.', 502);
  }

  return { number, url };
}
