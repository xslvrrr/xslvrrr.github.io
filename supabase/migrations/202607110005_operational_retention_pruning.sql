-- One service-role RPC for bounded-lifetime operational records.
create index if not exists extension_installations_expires_at_idx
  on public.extension_installations (expires_at);

create or replace function public.prune_expired_operational_data()
returns table (
  classroom_data_deleted bigint,
  api_rate_limits_deleted bigint,
  login_tokens_deleted bigint,
  assistant_action_approvals_deleted bigint,
  portal_sync_leases_deleted bigint,
  extension_installations_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classroom_data_deleted bigint := 0;
  v_api_rate_limits_deleted bigint := 0;
  v_login_tokens_deleted bigint := 0;
  v_assistant_action_approvals_deleted bigint := 0;
  v_portal_sync_leases_deleted bigint := 0;
  v_extension_installations_deleted bigint := 0;
begin
  delete from public.classroom_data
  where retention_expires_at <= now();
  get diagnostics v_classroom_data_deleted = row_count;

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

  delete from public.extension_installations
  where expires_at <= now();
  get diagnostics v_extension_installations_deleted = row_count;

  return query select
    v_classroom_data_deleted,
    v_api_rate_limits_deleted,
    v_login_tokens_deleted,
    v_assistant_action_approvals_deleted,
    v_portal_sync_leases_deleted,
    v_extension_installations_deleted;
end;
$$;

revoke all on function public.prune_expired_operational_data() from public, anon, authenticated;
grant execute on function public.prune_expired_operational_data() to service_role;
