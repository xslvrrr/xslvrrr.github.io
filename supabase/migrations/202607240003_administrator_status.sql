-- Server-enforced administrator roles, tooling, and audit history.

alter table public.users
  add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('user', 'admin'));
  end if;
end
$$;

create index if not exists users_role_idx on public.users (role);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert on table public.admin_audit_log to service_role;

create or replace function public.admin_list_users(
  p_actor_user_id uuid,
  p_search text default '',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  millennium_uid text,
  email text,
  display_name text,
  school_name text,
  account_role text,
  subscription_tier text,
  subscription_status text,
  created_at timestamptz,
  last_sync timestamptz,
  ai_requests bigint,
  ai_spent_usd numeric,
  trial_status text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  bounded_offset integer := greatest(0, coalesce(p_offset, 0));
  normalized_search text := lower(trim(coalesce(p_search, '')));
begin
  perform pg_advisory_xact_lock_shared(hashtext('millennium:admin-role'));
  if not exists (
    select 1 from public.users
    where id = p_actor_user_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_NOT_AUTHORIZED';
  end if;

  return query
  with filtered_users as (
    select account.*
    from public.users as account
    where normalized_search = ''
      or position(
        normalized_search in lower(concat_ws(
          ' ',
          coalesce(account.name, ''),
          coalesce(account.email, ''),
          coalesce(account.millennium_uid, ''),
          coalesce(account.school, '')
        ))
      ) > 0
  )
  select
    account.id,
    account.millennium_uid,
    account.email,
    account.name,
    account.school,
    account.role,
    account.subscription_tier,
    account.subscription_status,
    account.created_at,
    account.last_sync,
    (
      select count(*)
      from public.ai_usage as usage
      where usage.user_id = account.id
        and usage.created_at >= date_trunc('month', now())
    ),
    (
      select coalesce(sum(usage.cost_usd), 0)
      from public.ai_usage as usage
      where usage.user_id = account.id
        and usage.created_at >= date_trunc('month', now())
    ),
    trial.status,
    count(*) over()
  from filtered_users as account
  left join public.study_trial_uses as trial on trial.user_id = account.id
  order by account.created_at desc, account.id
  limit bounded_limit
  offset bounded_offset;
end;
$$;

create or replace function public.admin_get_overview(p_actor_user_id uuid)
returns jsonb
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

  return jsonb_build_object(
    'users', (select count(*) from public.users),
    'administrators', (select count(*) from public.users where role = 'admin'),
    'paidUsers', (
      select count(*)
      from public.users
      where subscription_tier in ('study', 'frontier')
        and subscription_status in ('active', 'trialing')
    ),
    'monthlyAiSpendUsd', (
      select coalesce(sum(cost_usd), 0)
      from public.ai_usage
      where created_at >= date_trunc('month', now())
    )
  );
end;
$$;

create or replace function public.admin_set_user_role(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns table (user_id uuid, account_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_role text;
begin
  perform pg_advisory_xact_lock(hashtext('millennium:admin-role'));
  if not exists (
    select 1 from public.users
    where id = p_actor_user_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_NOT_AUTHORIZED';
  end if;
  if p_role not in ('user', 'admin') then
    raise exception using errcode = '22023', message = 'ADMIN_ROLE_INVALID';
  end if;

  select role into previous_role
  from public.users
  where id = p_target_user_id
  for update;
  if previous_role is null then
    raise exception using errcode = 'P0002', message = 'ADMIN_USER_NOT_FOUND';
  end if;
  if p_actor_user_id = p_target_user_id and p_role <> 'admin' then
    raise exception using errcode = '22023', message = 'ADMIN_SELF_DEMOTION';
  end if;
  if previous_role = 'admin'
    and p_role <> 'admin'
    and (select count(*) from public.users where role = 'admin') <= 1
  then
    raise exception using errcode = '22023', message = 'ADMIN_LAST_ADMIN';
  end if;

  update public.users
  set role = p_role
  where id = p_target_user_id;

  if previous_role is distinct from p_role then
    insert into public.admin_audit_log (
      actor_user_id,
      target_user_id,
      action,
      metadata
    ) values (
      p_actor_user_id,
      p_target_user_id,
      'user.role.updated',
      jsonb_build_object('previousRole', previous_role, 'role', p_role)
    );
  end if;

  return query select p_target_user_id, p_role;
end;
$$;

create or replace function public.admin_reset_user_ai(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_reset_usage boolean default false,
  p_reset_trial boolean default false,
  p_clear_approvals boolean default false,
  p_rate_limit_keys text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_usage integer := 0;
  deleted_trials integer := 0;
  deleted_approvals integer := 0;
  deleted_rate_limits integer := 0;
begin
  perform pg_advisory_xact_lock_shared(hashtext('millennium:admin-role'));
  if not exists (
    select 1 from public.users
    where id = p_actor_user_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_NOT_AUTHORIZED';
  end if;
  if not exists (select 1 from public.users where id = p_target_user_id) then
    raise exception using errcode = 'P0002', message = 'ADMIN_USER_NOT_FOUND';
  end if;
  if not coalesce(p_reset_usage, false)
    and not coalesce(p_reset_trial, false)
    and not coalesce(p_clear_approvals, false)
    and coalesce(cardinality(p_rate_limit_keys), 0) = 0
  then
    raise exception using errcode = '22023', message = 'ADMIN_RESET_EMPTY';
  end if;

  if coalesce(p_reset_usage, false) then
    delete from public.ai_usage
    where user_id = p_target_user_id
      and created_at >= date_trunc('month', now());
    get diagnostics deleted_usage = row_count;
  end if;

  if coalesce(p_reset_trial, false) then
    delete from public.study_trial_uses where user_id = p_target_user_id;
    get diagnostics deleted_trials = row_count;
  end if;

  if coalesce(p_clear_approvals, false) then
    delete from public.assistant_action_approvals where user_id = p_target_user_id;
    get diagnostics deleted_approvals = row_count;
  end if;

  if coalesce(cardinality(p_rate_limit_keys), 0) > 0 then
    delete from public.api_rate_limits where key = any(p_rate_limit_keys);
    get diagnostics deleted_rate_limits = row_count;
  end if;

  insert into public.admin_audit_log (
    actor_user_id,
    target_user_id,
    action,
    metadata
  ) values (
    p_actor_user_id,
    p_target_user_id,
    'user.ai.reset',
    jsonb_build_object(
      'resetUsage', coalesce(p_reset_usage, false),
      'resetTrial', coalesce(p_reset_trial, false),
      'clearApprovals', coalesce(p_clear_approvals, false),
      'deletedUsage', deleted_usage,
      'deletedTrials', deleted_trials,
      'deletedApprovals', deleted_approvals,
      'deletedRateLimits', deleted_rate_limits
    )
  );

  return jsonb_build_object(
    'deletedUsage', deleted_usage,
    'deletedTrials', deleted_trials,
    'deletedApprovals', deleted_approvals,
    'deletedRateLimits', deleted_rate_limits
  );
end;
$$;

revoke all on function public.admin_list_users(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_overview(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_reset_user_ai(uuid, uuid, boolean, boolean, boolean, text[]) from public, anon, authenticated;

grant execute on function public.admin_list_users(uuid, text, integer, integer) to service_role;
grant execute on function public.admin_get_overview(uuid) to service_role;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to service_role;
grant execute on function public.admin_reset_user_ai(uuid, uuid, boolean, boolean, boolean, text[]) to service_role;

-- Promote first administrator out of band after applying this migration:
-- update public.users set role = 'admin' where id = '<trusted-user-uuid>';
