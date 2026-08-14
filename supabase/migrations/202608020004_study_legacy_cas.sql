-- Optimistic concurrency for compatibility JSONB writes while normalized storage is not cut over.

create or replace function public.save_legacy_flashcard_sets_v1(
  p_user_id uuid,
  p_expected_revision bigint,
  p_sets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_revision bigint;
  v_migration_status text;
  v_next_revision bigint;
begin
  if p_user_id is null
    or p_expected_revision is null
    or p_expected_revision < 0
    or jsonb_typeof(p_sets) is distinct from 'array'
    or jsonb_array_length(p_sets) > 60 then
    raise exception using errcode = '22023', message = 'Invalid legacy Study save request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select flashcard_sets_revision
  into v_current_revision
  from public.users
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  select status into v_migration_status
  from public.study_migration_state
  where user_id = p_user_id
  for update;

  if v_migration_status = 'cutover' then
    return jsonb_build_object('status', 'client-upgrade-required');
  end if;

  if v_current_revision <> p_expected_revision then
    return jsonb_build_object(
      'status', 'conflict',
      'revision', v_current_revision
    );
  end if;

  update public.users
  set flashcard_sets = p_sets,
      flashcard_sets_revision = flashcard_sets_revision + 1
  where id = p_user_id
  returning flashcard_sets_revision into v_next_revision;

  if v_migration_status is not null then
    update public.study_migration_state
    set status = 'pending',
        last_error_code = 'LEGACY_SOURCE_CHANGED',
        lease_owner = null,
        lease_expires_at = null,
        completed_at = null,
        updated_at = now()
    where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'status', 'accepted',
    'revision', v_next_revision,
    'sets', p_sets
  );
end;
$$;

revoke all on function public.save_legacy_flashcard_sets_v1(uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_legacy_flashcard_sets_v1(uuid, bigint, jsonb)
  to service_role;
