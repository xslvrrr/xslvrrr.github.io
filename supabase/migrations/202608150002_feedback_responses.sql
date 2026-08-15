-- Administrator replies, suspension appeals, and the history a reporter can read back.
--
-- The first migration recorded decisions but said nothing back to the reporter. This adds the reply
-- an administrator writes, the appeal a suspended account may send once, and the "seen" marks that
-- let the dashboard raise each outcome as a toast exactly once.

alter table public.feedback_reports
  add column if not exists admin_message text,
  add column if not exists response_seen_at timestamptz;

alter table public.feedback_suspensions
  add column if not exists acknowledged_at timestamptz,
  add column if not exists suspended_seen_at timestamptz,
  add column if not exists appeal_message text,
  add column if not exists appealed_at timestamptz,
  add column if not exists appeal_status text,
  add column if not exists appeal_response text,
  add column if not exists appeal_reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists appeal_reviewed_at timestamptz,
  add column if not exists appeal_seen_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_suspensions_appeal_status_check'
      and conrelid = 'public.feedback_suspensions'::regclass
  ) then
    alter table public.feedback_suspensions
      add constraint feedback_suspensions_appeal_status_check
      check (appeal_status is null or appeal_status in ('pending', 'accepted', 'declined'));
  end if;
end
$$;

-- Appeals are answered oldest first, like reports.
create index if not exists feedback_suspensions_appeal_idx
  on public.feedback_suspensions (appealed_at)
  where appeal_status = 'pending';

-- ---------------------------------------------------------------- reporter-facing

create or replace function public.feedback_user_overview(
  p_user_id uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  suspension public.feedback_suspensions%rowtype;
  suspension_json jsonb := null;
begin
  select * into suspension from public.feedback_suspensions where user_id = p_user_id;

  if found then
    suspension_json := jsonb_build_object(
      'active', suspension.expires_at is null or suspension.expires_at > now(),
      'expiresAt', suspension.expires_at,
      'reason', suspension.reason,
      'createdAt', suspension.created_at,
      'acknowledged', suspension.acknowledged_at is not null,
      'seen', suspension.suspended_seen_at is not null,
      'appeal', case
        when suspension.appealed_at is null then null
        else jsonb_build_object(
          'status', coalesce(suspension.appeal_status, 'pending'),
          'message', suspension.appeal_message,
          'submittedAt', suspension.appealed_at,
          'response', suspension.appeal_response,
          'reviewedAt', suspension.appeal_reviewed_at,
          'seen', suspension.appeal_seen_at is not null
        )
      end
    );
  end if;

  return jsonb_build_object(
    'suspension', suspension_json,
    'reports', coalesce((
      select jsonb_agg(entry order by entry->>'createdAt' desc)
      from (
        select jsonb_build_object(
          'id', report.id,
          'kind', report.kind,
          'area', report.area,
          'bugCategory', report.bug_category,
          'bugCategoryOther', report.bug_category_other,
          'suggestionType', report.suggestion_type,
          'details', report.details,
          'status', report.status,
          'adminMessage', report.admin_message,
          'githubIssueNumber', report.github_issue_number,
          'githubIssueUrl', report.github_issue_url,
          'createdAt', report.created_at,
          'reviewedAt', report.reviewed_at,
          'responseSeen', report.response_seen_at is not null
        ) as entry
        from public.feedback_reports as report
        where report.user_id = p_user_id
        order by report.created_at desc
        limit bounded_limit
      ) as history
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.feedback_user_overview(uuid, integer) is
  'Everything a reporter sees about their own reports: history, replies, suspension, and appeal.';

revoke all on function public.feedback_user_overview(uuid, integer) from public, anon, authenticated;

create or replace function public.feedback_mark_notices_seen(
  p_user_id uuid,
  p_report_ids uuid[] default null,
  p_mark_suspension boolean default false,
  p_mark_appeal boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_report_ids is not null and array_length(p_report_ids, 1) is not null then
    update public.feedback_reports
    set response_seen_at = now()
    where user_id = p_user_id
      and id = any(p_report_ids)
      and status <> 'pending'
      and response_seen_at is null;
  end if;

  if p_mark_suspension then
    update public.feedback_suspensions
    set suspended_seen_at = now()
    where user_id = p_user_id and suspended_seen_at is null;
  end if;

  if p_mark_appeal then
    update public.feedback_suspensions
    set appeal_seen_at = now()
    where user_id = p_user_id
      and appeal_status in ('accepted', 'declined')
      and appeal_seen_at is null;
  end if;
end;
$$;

comment on function public.feedback_mark_notices_seen(uuid, uuid[], boolean, boolean) is
  'Marks outcomes as shown so each one raises a toast exactly once.';

revoke all on function public.feedback_mark_notices_seen(uuid, uuid[], boolean, boolean)
  from public, anon, authenticated;

create or replace function public.feedback_acknowledge_suspension(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.feedback_suspensions
  set acknowledged_at = coalesce(acknowledged_at, now()),
      suspended_seen_at = coalesce(suspended_seen_at, now())
  where user_id = p_user_id;
$$;

comment on function public.feedback_acknowledge_suspension(uuid) is
  'Records that the suspended account read the notice.';

revoke all on function public.feedback_acknowledge_suspension(uuid) from public, anon, authenticated;

create or replace function public.feedback_submit_appeal(
  p_user_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  suspension public.feedback_suspensions%rowtype;
begin
  select * into suspension from public.feedback_suspensions where user_id = p_user_id for update;
  if not found or (suspension.expires_at is not null and suspension.expires_at <= now()) then
    raise exception using errcode = 'P0002', message = 'FEEDBACK_NOT_SUSPENDED';
  end if;

  -- One appeal per suspension. Extending an active suspension keeps the same row, so it does not
  -- hand back another attempt; a suspension issued after a revocation is a new row and does.
  if suspension.appealed_at is not null then
    raise exception using errcode = '23505', message = 'FEEDBACK_APPEAL_ALREADY_SENT';
  end if;

  update public.feedback_suspensions
  set appeal_message = btrim(p_message),
      appealed_at = now(),
      appeal_status = 'pending',
      acknowledged_at = coalesce(acknowledged_at, now()),
      suspended_seen_at = coalesce(suspended_seen_at, now()),
      updated_at = now()
  where user_id = p_user_id
  returning * into suspension;

  return jsonb_build_object('submittedAt', suspension.appealed_at);
end;
$$;

comment on function public.feedback_submit_appeal(uuid, text) is
  'Records the single appeal a suspended account is allowed for its current suspension.';

revoke all on function public.feedback_submit_appeal(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- administrator-facing

-- Replaces the first migration's version so a decision can carry a reply to the reporter.
create or replace function public.feedback_admin_resolve(
  p_actor_user_id uuid,
  p_report_id uuid,
  p_status text,
  p_github_issue_number integer default null,
  p_github_issue_url text default null,
  p_admin_message text default null
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
      admin_message = nullif(btrim(coalesce(p_admin_message, '')), ''),
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
      'githubIssueNumber', resolved.github_issue_number,
      'replied', resolved.admin_message is not null
    )
  );

  return jsonb_build_object(
    'id', resolved.id,
    'status', resolved.status,
    'pending', (select count(*) from public.feedback_reports where status = 'pending')
  );
end;
$$;

comment on function public.feedback_admin_resolve(uuid, uuid, text, integer, text, text) is
  'Accepts or dismisses a pending report exactly once, optionally replying to the reporter.';

revoke all on function public.feedback_admin_resolve(uuid, uuid, text, integer, text, text)
  from public, anon, authenticated;

-- The five-argument version this replaces would otherwise stay callable alongside it.
drop function if exists public.feedback_admin_resolve(uuid, uuid, text, integer, text);

-- Replaces the first migration's version. A suspension issued to an account whose previous one has
-- lapsed or was never appealed starts clean; extending an active suspension keeps its appeal state.
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
  existing public.feedback_suspensions%rowtype;
  saved public.feedback_suspensions%rowtype;
  is_extension boolean;
begin
  perform public.feedback_require_admin(p_actor_user_id);

  if not exists (select 1 from public.users where id = p_target_user_id) then
    raise exception using errcode = '23503', message = 'FEEDBACK_USER_NOT_FOUND';
  end if;

  select * into existing
  from public.feedback_suspensions
  where user_id = p_target_user_id
  for update;

  is_extension := found and (existing.expires_at is null or existing.expires_at > now());

  if is_extension then
    update public.feedback_suspensions
    set expires_at = p_expires_at,
        reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), reason),
        created_by = p_actor_user_id,
        updated_at = now()
    where user_id = p_target_user_id
    returning * into saved;
  else
    insert into public.feedback_suspensions (user_id, expires_at, reason, created_by)
    values (p_target_user_id, p_expires_at, nullif(btrim(coalesce(p_reason, '')), ''), p_actor_user_id)
    on conflict (user_id) do update
      set expires_at = excluded.expires_at,
          reason = excluded.reason,
          created_by = excluded.created_by,
          created_at = now(),
          updated_at = now(),
          acknowledged_at = null,
          suspended_seen_at = null,
          appeal_message = null,
          appealed_at = null,
          appeal_status = null,
          appeal_response = null,
          appeal_reviewed_by = null,
          appeal_reviewed_at = null,
          appeal_seen_at = null
    returning * into saved;
  end if;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, metadata)
  values (
    p_actor_user_id,
    p_target_user_id,
    case when is_extension then 'feedback.suspension-extended' else 'feedback.suspend' end,
    jsonb_build_object('expiresAt', saved.expires_at, 'reason', saved.reason)
  );

  return jsonb_build_object('userId', saved.user_id, 'expiresAt', saved.expires_at);
end;
$$;

comment on function public.feedback_admin_set_suspension(uuid, uuid, timestamptz, text) is
  'Creates or extends a report suspension. A null expiry is permanent. A new suspension resets the '
  'appeal state; extending an active one does not hand back a second appeal.';

revoke all on function public.feedback_admin_set_suspension(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;

create or replace function public.feedback_admin_appeals(p_actor_user_id uuid)
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
        'status', coalesce(suspension.appeal_status, 'pending'),
        'message', suspension.appeal_message,
        'submittedAt', suspension.appealed_at,
        'response', suspension.appeal_response,
        'reviewedAt', suspension.appeal_reviewed_at,
        'expiresAt', suspension.expires_at,
        'reason', suspension.reason
      )
      -- Unanswered appeals first, then the most recently submitted.
      order by (suspension.appeal_status = 'pending') desc, suspension.appealed_at desc
    )
    from public.feedback_suspensions as suspension
    left join public.users as account on account.id = suspension.user_id
    where suspension.appealed_at is not null
  ), '[]'::jsonb);
end;
$$;

comment on function public.feedback_admin_appeals(uuid) is
  'Every suspension appeal on record, unanswered ones first.';

revoke all on function public.feedback_admin_appeals(uuid) from public, anon, authenticated;

create or replace function public.feedback_admin_resolve_appeal(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_status text,
  p_response text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved public.feedback_suspensions%rowtype;
begin
  perform public.feedback_require_admin(p_actor_user_id);

  if p_status not in ('accepted', 'declined') then
    raise exception using errcode = '22023', message = 'FEEDBACK_STATUS_INVALID';
  end if;

  -- An accepted appeal lifts the suspension by expiring it now rather than deleting the row, so the
  -- history stays readable to both sides and a repeat suspension is still visible as a repeat.
  update public.feedback_suspensions
  set appeal_status = p_status,
      appeal_response = nullif(btrim(coalesce(p_response, '')), ''),
      appeal_reviewed_by = p_actor_user_id,
      appeal_reviewed_at = now(),
      appeal_seen_at = null,
      expires_at = case when p_status = 'accepted' then now() else expires_at end,
      updated_at = now()
  where user_id = p_target_user_id and appeal_status = 'pending'
  returning * into resolved;

  if not found then
    raise exception using errcode = 'P0002', message = 'FEEDBACK_APPEAL_NOT_PENDING';
  end if;

  insert into public.admin_audit_log (actor_user_id, target_user_id, action, metadata)
  values (
    p_actor_user_id,
    p_target_user_id,
    'feedback.appeal-' || p_status,
    jsonb_build_object('replied', resolved.appeal_response is not null)
  );

  return jsonb_build_object('userId', resolved.user_id, 'status', resolved.appeal_status);
end;
$$;

comment on function public.feedback_admin_resolve_appeal(uuid, uuid, text, text) is
  'Answers a pending appeal exactly once. Accepting expires the suspension immediately.';

revoke all on function public.feedback_admin_resolve_appeal(uuid, uuid, text, text)
  from public, anon, authenticated;

-- Replaces the first migration's version so the administrator table can show appeal state alongside
-- the suspension it belongs to.
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
        'updatedAt', suspension.updated_at,
        'appealStatus', suspension.appeal_status
      )
      -- Permanent suspensions have no expiry, so they sort first and stay at the top of the table.
      order by suspension.expires_at nulls first
    )
    from public.feedback_suspensions as suspension
    left join public.users as account on account.id = suspension.user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.feedback_admin_list_suspensions(uuid) from public, anon, authenticated;
