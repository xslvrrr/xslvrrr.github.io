-- Bug reports and feature suggestions, plus the administrator review queue behind them.
--
-- Users submit through `feedback_submit_report`, which refuses a submission while the account holds
-- an active suspension. Administrators drain a single shared queue: the first administrator to act
-- on a report resolves it for everyone, so the pending counter is the same number on every screen.
--
-- Every function is `security definer` and re-checks `users.role` from current database state,
-- matching `202607240003_administrator_status.sql`. Session cookies never carry authority here.

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  kind text not null check (kind in ('bug', 'suggestion')),
  area text,
  bug_category text check (bug_category in ('performance', 'looks-wrong', 'crashes', 'not-working', 'other')),
  bug_category_other text,
  suggestion_type text check (suggestion_type in ('new-page', 'page-addition', 'new-concept', 'settings-addition')),
  details text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  github_issue_number integer,
  github_issue_url text,
  created_at timestamptz not null default now(),
  -- A bug carries an area and a category; a suggestion carries a type. Neither borrows the other's
  -- answers, so the review dialog can render a row without re-deriving which questions were asked.
  constraint feedback_reports_answers_check check (
    (kind = 'bug'
      and area is not null
      and bug_category is not null
      and suggestion_type is null
      and (bug_category <> 'other' or bug_category_other is not null))
    or
    (kind = 'suggestion'
      and suggestion_type is not null
      and area is null
      and bug_category is null
      and bug_category_other is null)
  )
);

-- The queue reads pending rows oldest first; a partial index keeps that scan off resolved history.
create index if not exists feedback_reports_pending_idx
  on public.feedback_reports (created_at)
  where status = 'pending';
create index if not exists feedback_reports_user_idx
  on public.feedback_reports (user_id, created_at desc);

alter table public.feedback_reports enable row level security;
revoke all on table public.feedback_reports from public, anon, authenticated;
grant select, insert, update on table public.feedback_reports to service_role;

-- A null `expires_at` is a permanent suspension. Rows are kept after expiry so an administrator can
-- see that an account was suspended before and extend it instead of starting over.
create table if not exists public.feedback_suspensions (
  user_id uuid primary key references public.users(id) on delete cascade,
  expires_at timestamptz,
  reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback_suspensions enable row level security;
revoke all on table public.feedback_suspensions from public, anon, authenticated;
grant select, insert, update, delete on table public.feedback_suspensions to service_role;

create or replace function public.feedback_require_admin(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock_shared(hashtext('millennium:admin-role'));
  if not exists (
    select 1 from public.users
    where id = p_actor_user_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_NOT_AUTHORIZED';
  end if;
end;
$$;

comment on function public.feedback_require_admin(uuid) is
  'Raises ADMIN_NOT_AUTHORIZED unless the actor is an administrator in current database state.';

revoke all on function public.feedback_require_admin(uuid) from public, anon, authenticated;

create or replace function public.feedback_submit_report(
  p_user_id uuid,
  p_kind text,
  p_area text,
  p_bug_category text,
  p_bug_category_other text,
  p_suggestion_type text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  suspension public.feedback_suspensions%rowtype;
  inserted public.feedback_reports%rowtype;
begin
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception using errcode = '23503', message = 'FEEDBACK_USER_NOT_FOUND';
  end if;

  select * into suspension
  from public.feedback_suspensions
  where user_id = p_user_id;

  if found and (suspension.expires_at is null or suspension.expires_at > now()) then
    raise exception using errcode = '42501', message = 'FEEDBACK_SUSPENDED';
  end if;

  insert into public.feedback_reports (
    user_id, kind, area, bug_category, bug_category_other, suggestion_type, details
  )
  values (
    p_user_id,
    p_kind,
    nullif(btrim(coalesce(p_area, '')), ''),
    p_bug_category,
    nullif(btrim(coalesce(p_bug_category_other, '')), ''),
    p_suggestion_type,
    btrim(p_details)
  )
  returning * into inserted;

  return jsonb_build_object(
    'id', inserted.id,
    'createdAt', inserted.created_at,
    'pending', (select count(*) from public.feedback_reports where status = 'pending')
  );
end;
$$;

comment on function public.feedback_submit_report(uuid, text, text, text, text, text, text) is
  'Records a bug report or feature suggestion, refusing accounts with an active report suspension.';

revoke all on function public.feedback_submit_report(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.feedback_admin_queue(
  p_actor_user_id uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  perform public.feedback_require_admin(p_actor_user_id);

  return jsonb_build_object(
    'pending', (select count(*) from public.feedback_reports where status = 'pending'),
    'reports', coalesce((
      select jsonb_agg(entry order by entry->>'createdAt')
      from (
        select jsonb_build_object(
          'id', report.id,
          'kind', report.kind,
          'area', report.area,
          'bugCategory', report.bug_category,
          'bugCategoryOther', report.bug_category_other,
          'suggestionType', report.suggestion_type,
          'details', report.details,
          'createdAt', report.created_at,
          'reporter', jsonb_build_object(
            'id', report.user_id,
            'name', coalesce(reporter.name, ''),
            'email', coalesce(reporter.email, ''),
            'school', coalesce(reporter.school, ''),
            'suspended', exists (
              select 1 from public.feedback_suspensions as suspension
              where suspension.user_id = report.user_id
                and (suspension.expires_at is null or suspension.expires_at > now())
            )
          )
        ) as entry
        from public.feedback_reports as report
        left join public.users as reporter on reporter.id = report.user_id
        where report.status = 'pending'
        order by report.created_at
        limit bounded_limit
      ) as queued
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.feedback_admin_queue(uuid, integer) is
  'Oldest-first pending report queue plus the total pending count shown in the administrator badge.';

revoke all on function public.feedback_admin_queue(uuid, integer) from public, anon, authenticated;

create or replace function public.feedback_admin_resolve(
  p_actor_user_id uuid,
  p_report_id uuid,
  p_status text,
  p_github_issue_number integer default null,
  p_github_issue_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved public.feedback_reports%rowtype;
begin
  perform public.feedback_require_admin(p_actor_user_id);

  if p_status not in ('accepted', 'dismissed') then
    raise exception using errcode = '22023', message = 'FEEDBACK_STATUS_INVALID';
  end if;

  -- Restricting the update to pending rows makes two administrators acting at once safe: the second
  -- one changes no rows and is told the report was already handled instead of overwriting the first.
  update public.feedback_reports
  set status = p_status,
      reviewed_by = p_actor_user_id,
      reviewed_at = now(),
      github_issue_number = coalesce(p_github_issue_number, github_issue_number),
      github_issue_url = coalesce(p_github_issue_url, github_issue_url)
  where id = p_report_id and status = 'pending'
  returning * into resolved;

  if not found then
    raise exception using errcode = '23505', message = 'FEEDBACK_ALREADY_REVIEWED';
  end if;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, metadata)
  values (
    p_actor_user_id,
    resolved.user_id,
    'feedback.' || p_status,
    jsonb_build_object(
      'reportId', resolved.id,
      'kind', resolved.kind,
      'githubIssueNumber', resolved.github_issue_number
    )
  );

  return jsonb_build_object(
    'id', resolved.id,
    'status', resolved.status,
    'pending', (select count(*) from public.feedback_reports where status = 'pending')
  );
end;
$$;

comment on function public.feedback_admin_resolve(uuid, uuid, text, integer, text) is
  'Accepts or dismisses a pending report exactly once and records the decision in the audit log.';

revoke all on function public.feedback_admin_resolve(uuid, uuid, text, integer, text)
  from public, anon, authenticated;

create or replace function public.feedback_admin_set_suspension(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_expires_at timestamptz,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.feedback_suspensions%rowtype;
begin
  perform public.feedback_require_admin(p_actor_user_id);

  if not exists (select 1 from public.users where id = p_target_user_id) then
    raise exception using errcode = '23503', message = 'FEEDBACK_USER_NOT_FOUND';
  end if;

  insert into public.feedback_suspensions (user_id, expires_at, reason, created_by)
  values (p_target_user_id, p_expires_at, nullif(btrim(coalesce(p_reason, '')), ''), p_actor_user_id)
  on conflict (user_id) do update
    set expires_at = excluded.expires_at,
        reason = coalesce(excluded.reason, public.feedback_suspensions.reason),
        created_by = excluded.created_by,
        updated_at = now()
  returning * into saved;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, metadata)
  values (
    p_actor_user_id,
    p_target_user_id,
    'feedback.suspend',
    jsonb_build_object('expiresAt', saved.expires_at, 'reason', saved.reason)
  );

  return jsonb_build_object('userId', saved.user_id, 'expiresAt', saved.expires_at);
end;
$$;

comment on function public.feedback_admin_set_suspension(uuid, uuid, timestamptz, text) is
  'Creates or extends a report suspension. A null expiry is permanent.';

revoke all on function public.feedback_admin_set_suspension(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;

create or replace function public.feedback_admin_clear_suspension(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  perform public.feedback_require_admin(p_actor_user_id);

  delete from public.feedback_suspensions where user_id = p_target_user_id;
  get diagnostics removed = row_count;

  if removed = 0 then
    raise exception using errcode = 'P0002', message = 'FEEDBACK_SUSPENSION_NOT_FOUND';
  end if;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, metadata)
  values (p_actor_user_id, p_target_user_id, 'feedback.suspension-revoked', '{}'::jsonb);

  return jsonb_build_object('userId', p_target_user_id);
end;
$$;

comment on function public.feedback_admin_clear_suspension(uuid, uuid) is
  'Revokes a report suspension so the account can submit again immediately.';

revoke all on function public.feedback_admin_clear_suspension(uuid, uuid) from public, anon, authenticated;

create or replace function public.feedback_admin_list_suspensions(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.feedback_require_admin(p_actor_user_id);

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'userId', suspension.user_id,
        'name', coalesce(account.name, ''),
        'email', coalesce(account.email, ''),
        'expiresAt', suspension.expires_at,
        'reason', suspension.reason,
        'createdAt', suspension.created_at,
        'updatedAt', suspension.updated_at
      )
      -- Permanent suspensions have no expiry, so they sort first and stay at the top of the table.
      order by suspension.expires_at nulls first
    )
    from public.feedback_suspensions as suspension
    left join public.users as account on account.id = suspension.user_id
  ), '[]'::jsonb);
end;
$$;

comment on function public.feedback_admin_list_suspensions(uuid) is
  'Every report suspension on record, including lapsed ones, for the administrator management table.';

revoke all on function public.feedback_admin_list_suspensions(uuid) from public, anon, authenticated;
