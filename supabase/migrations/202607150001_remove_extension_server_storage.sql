-- Remove server-side extension-only storage while preserving web login tokens.

-- PostgreSQL cannot change a function's OUT row type with CREATE OR REPLACE.
-- Drop the old signature before removing the tables it references and recreating it.
drop function if exists public.prune_expired_operational_data();
drop function if exists public.delete_expired_classroom_data();

-- Drop reviewed extension-only tables. Unexpected dependencies should fail this
-- migration rather than being removed implicitly.
drop table if exists public.extension_installations;
drop table if exists public.classroom_data;

-- Remove extension telemetry embedded in otherwise-retained portal payloads.
update public.users
set portal_data = portal_data - 'extensionVersion'
where portal_data ? 'extensionVersion';

create function public.prune_expired_operational_data()
returns table (
  api_rate_limits_deleted bigint,
  login_tokens_deleted bigint,
  assistant_action_approvals_deleted bigint,
  portal_sync_leases_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_rate_limits_deleted bigint := 0;
  v_login_tokens_deleted bigint := 0;
  v_assistant_action_approvals_deleted bigint := 0;
  v_portal_sync_leases_deleted bigint := 0;
begin
  delete from public.api_rate_limits
  where expires_at <= now();
  get diagnostics v_api_rate_limits_deleted = row_count;

  delete from public.login_tokens
  where expires_at <= now();
  get diagnostics v_login_tokens_deleted = row_count;

  delete from public.assistant_action_approvals
  where expires_at <= now();
  get diagnostics v_assistant_action_approvals_deleted = row_count;

  delete from public.portal_sync_leases
  where expires_at <= now();
  get diagnostics v_portal_sync_leases_deleted = row_count;

  return query select
    v_api_rate_limits_deleted,
    v_login_tokens_deleted,
    v_assistant_action_approvals_deleted,
    v_portal_sync_leases_deleted;
end;
$$;

revoke all on function public.prune_expired_operational_data() from public, anon, authenticated;
grant execute on function public.prune_expired_operational_data() to service_role;
