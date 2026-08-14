create or replace function public.merge_portal_account(
  p_user_id uuid,
  p_account jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if jsonb_typeof(p_account) is distinct from 'object' then
    raise exception 'Portal account details must be a JSON object' using errcode = '22023';
  end if;

  select (coalesce(users.portal_data, '{}'::jsonb) -> 'account') is distinct from p_account
  into v_changed
  from public.users
  where users.id = p_user_id
  for update;

  if not found then
    raise exception 'Portal account disappeared during sync' using errcode = '23503';
  end if;

  if v_changed then
    update public.users
    set portal_data = jsonb_set(
      coalesce(users.portal_data, '{}'::jsonb),
      '{account}',
      p_account,
      true
    )
    where users.id = p_user_id;
  end if;

  return v_changed;
end;
$$;

revoke all on function public.merge_portal_account(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.merge_portal_account(uuid, jsonb) to service_role;
