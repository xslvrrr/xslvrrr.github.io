-- Safe bounded migration handshake plus read-only bootstrap and cursor sync.
-- Collections larger than bounded request path remain pending for later staged worker migration.

create or replace function public.begin_study_migration_v1(
  p_user_id uuid,
  p_lease_owner uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_source jsonb;
  v_source_checksum text;
  v_state public.study_migration_state%rowtype;
  v_timestamp timestamptz := now();
begin
  if p_user_id is null or p_lease_owner is null then
    raise exception using errcode = '22023', message = 'Study migration identity is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select flashcard_sets
  into v_source
  from public.users
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  v_source_checksum := encode(
    extensions.digest(convert_to(v_source::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into v_state
  from public.study_migration_state
  where user_id = p_user_id
  for update;

  if found
    and v_state.status in ('verified', 'cutover')
    and v_state.source_checksum = v_source_checksum then
    return jsonb_build_object(
      'status', v_state.status,
      'source', v_source,
      'sourceChecksum', v_source_checksum,
      'startedAt', coalesce(v_state.started_at, v_timestamp)
    );
  end if;

  if found
    and v_state.status = 'backfilling'
    and v_state.lease_expires_at is not null
    and v_state.lease_expires_at > v_timestamp then
    return jsonb_build_object(
      'status', 'in-progress',
      'retryAfterSeconds', greatest(1, extract(epoch from (v_state.lease_expires_at - v_timestamp))::integer)
    );
  end if;

  insert into public.study_migration_state (
    user_id,
    schema_version,
    status,
    source_checksum,
    attempt_count,
    lease_owner,
    lease_expires_at,
    started_at,
    completed_at,
    last_error_code,
    updated_at
  ) values (
    p_user_id,
    1,
    'backfilling',
    v_source_checksum,
    1,
    p_lease_owner,
    v_timestamp + interval '10 minutes',
    v_timestamp,
    null,
    null,
    v_timestamp
  )
  on conflict (user_id) do update
  set status = 'backfilling',
      source_checksum = excluded.source_checksum,
      attempt_count = public.study_migration_state.attempt_count + 1,
      lease_owner = excluded.lease_owner,
      lease_expires_at = excluded.lease_expires_at,
      started_at = excluded.started_at,
      completed_at = null,
      last_error_code = null,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'status', 'backfilling',
    'source', v_source,
    'sourceChecksum', v_source_checksum,
    'startedAt', v_timestamp
  );
end;
$$;

revoke all on function public.begin_study_migration_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_study_migration_v1(uuid, uuid)
  to service_role;

create or replace function public.defer_study_migration_v1(
  p_user_id uuid,
  p_lease_owner uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null
    or p_lease_owner is null
    or p_error_code not in ('STAGED_MIGRATION_REQUIRED', 'INVALID_LEGACY_SOURCE') then
    raise exception using errcode = '22023', message = 'Invalid Study migration deferral';
  end if;

  update public.study_migration_state
  set status = 'pending',
      last_error_code = p_error_code,
      lease_owner = null,
      lease_expires_at = null,
      updated_at = now()
  where user_id = p_user_id
    and status = 'backfilling'
    and lease_owner = p_lease_owner;

  return jsonb_build_object('status', 'staged-migration-required');
end;
$$;

revoke all on function public.defer_study_migration_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.defer_study_migration_v1(uuid, uuid, text)
  to service_role;

create or replace function public.backfill_study_legacy_v1(
  p_user_id uuid,
  p_lease_owner uuid,
  p_expected_source jsonb,
  p_expected_source_checksum text,
  p_decks jsonb,
  p_notes jsonb,
  p_cards jsonb,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_source jsonb;
  v_source_checksum text;
  v_payload_checksum text;
  v_deck_count integer;
  v_note_count integer;
  v_card_count integer;
  v_event_count integer;
  v_source_set_count integer;
  v_source_card_count integer;
  v_invalid_source_count integer;
  v_timestamp timestamptz := now();
  v_state public.study_migration_state%rowtype;
begin
  if p_user_id is null
    or p_lease_owner is null
    or p_expected_source is null
    or p_expected_source_checksum is null
    or char_length(p_expected_source_checksum) <> 64 then
    raise exception using errcode = '22023', message = 'Invalid Study migration identity';
  end if;
  if jsonb_typeof(p_decks) is distinct from 'array'
    or jsonb_typeof(p_notes) is distinct from 'array'
    or jsonb_typeof(p_cards) is distinct from 'array'
    or jsonb_typeof(p_events) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Study migration payloads must be arrays';
  end if;

  v_deck_count := jsonb_array_length(p_decks);
  v_note_count := jsonb_array_length(p_notes);
  v_card_count := jsonb_array_length(p_cards);
  v_event_count := jsonb_array_length(p_events);

  if v_deck_count > 60
    or v_note_count > 500
    or v_card_count > 500
    or v_event_count > 500
    or v_note_count <> v_card_count
    or v_card_count <> v_event_count
    or octet_length(p_decks::text) + octet_length(p_notes::text)
      + octet_length(p_cards::text) + octet_length(p_events::text) > 8388608 then
    update public.study_migration_state
    set status = 'pending',
        last_error_code = 'STAGED_MIGRATION_REQUIRED',
        lease_owner = null,
        lease_expires_at = null,
        updated_at = v_timestamp
    where user_id = p_user_id and lease_owner = p_lease_owner;
    return jsonb_build_object('status', 'staged-migration-required');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select flashcard_sets
  into v_source
  from public.users
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  v_source_checksum := encode(
    extensions.digest(convert_to(v_source::text, 'UTF8'), 'sha256'),
    'hex'
  );

  if v_source is distinct from p_expected_source
    or v_source_checksum <> p_expected_source_checksum then
    update public.study_migration_state
    set status = 'pending',
        source_checksum = v_source_checksum,
        last_error_code = 'SOURCE_CHANGED',
        lease_owner = null,
        lease_expires_at = null,
        updated_at = v_timestamp
    where user_id = p_user_id;
    return jsonb_build_object('status', 'source-changed');
  end if;

  if jsonb_typeof(v_source) is distinct from 'array' or octet_length(v_source::text) > 4194304 then
    update public.study_migration_state
    set status = 'pending',
        last_error_code = 'STAGED_MIGRATION_REQUIRED',
        lease_owner = null,
        lease_expires_at = null,
        updated_at = v_timestamp
    where user_id = p_user_id;
    return jsonb_build_object('status', 'staged-migration-required');
  end if;

  select
    count(*)::integer,
    coalesce(sum(case when jsonb_typeof(entry -> 'cards') = 'array' then jsonb_array_length(entry -> 'cards') else 0 end), 0)::integer,
    count(*) filter (
      where jsonb_typeof(entry) is distinct from 'object'
        or jsonb_typeof(entry -> 'title') is distinct from 'string'
        or char_length(btrim(entry ->> 'title')) not between 1 and 120
        or (entry ? 'description' and (jsonb_typeof(entry -> 'description') is distinct from 'string' or char_length(btrim(entry ->> 'description')) > 500))
        or (entry ? 'cards' and jsonb_typeof(entry -> 'cards') is distinct from 'array')
        or (jsonb_typeof(entry -> 'cards') = 'array' and jsonb_array_length(entry -> 'cards') > 500)
        or exists (
          select 1
          from jsonb_array_elements(case when jsonb_typeof(entry -> 'cards') = 'array' then entry -> 'cards' else '[]'::jsonb end) card
          where jsonb_typeof(card) is distinct from 'object'
            or jsonb_typeof(card -> 'front') is distinct from 'string'
            or char_length(btrim(card ->> 'front')) not between 1 and 2000
            or jsonb_typeof(card -> 'back') is distinct from 'string'
            or char_length(btrim(card ->> 'back')) not between 1 and 4000
        )
    )::integer
  into v_source_set_count, v_source_card_count, v_invalid_source_count
  from jsonb_array_elements(v_source) input(entry);

  if v_source_set_count <> v_deck_count
    or v_source_card_count <> v_card_count
    or v_source_set_count > 60
    or v_source_card_count > 500
    or v_invalid_source_count > 0 then
    update public.study_migration_state
    set status = 'pending',
        last_error_code = case when v_invalid_source_count > 0 then 'INVALID_LEGACY_SOURCE' else 'STAGED_MIGRATION_REQUIRED' end,
        lease_owner = null,
        lease_expires_at = null,
        updated_at = v_timestamp
    where user_id = p_user_id;
    return jsonb_build_object('status', 'staged-migration-required');
  end if;

  select * into v_state
  from public.study_migration_state
  where user_id = p_user_id
  for update;

  if found
    and v_state.status in ('verified', 'cutover')
    and v_state.source_checksum = v_source_checksum then
    return jsonb_build_object(
      'status', v_state.status,
      'sourceChecksum', v_source_checksum,
      'normalizedChecksum', v_state.normalized_checksum,
      'decks', v_state.actual_deck_count,
      'notes', v_state.actual_note_count,
      'cards', v_state.actual_card_count,
      'events', v_state.actual_event_count
    );
  end if;

  if not found
    or v_state.status <> 'backfilling'
    or v_state.lease_owner is distinct from p_lease_owner
    or v_state.lease_expires_at < v_timestamp then
    return jsonb_build_object('status', 'lease-lost');
  end if;

  v_payload_checksum := encode(extensions.digest(convert_to(jsonb_build_object(
    'decks', p_decks,
    'notes', p_notes,
    'cards', p_cards,
    'events', p_events
  )::text, 'UTF8'), 'sha256'), 'hex');

  update public.study_migration_state
  set normalized_checksum = v_payload_checksum,
      expected_deck_count = v_deck_count,
      expected_note_count = v_note_count,
      expected_card_count = v_card_count,
      expected_event_count = v_event_count,
      updated_at = v_timestamp
  where user_id = p_user_id;

  delete from public.study_review_events
  where user_id = p_user_id
    and event_kind = 'migration'
    and result ->> 'status' = 'migration';

  delete from public.study_decks
  where user_id = p_user_id
    and legacy_key like 'migration:%';

  insert into public.study_decks (
    id, user_id, parent_deck_id, legacy_key, title, description, pinned,
    sort_order, revision, archived_at, deleted_at, created_at, updated_at
  )
  select
    (entry ->> 'id')::uuid,
    p_user_id,
    nullif(entry ->> 'parentDeckId', '')::uuid,
    'migration:' || (entry ->> 'id'),
    btrim(entry ->> 'title'),
    coalesce(entry ->> 'description', ''),
    coalesce((entry ->> 'pinned')::boolean, false),
    coalesce((entry ->> 'sortOrder')::integer, 0),
    greatest(coalesce((entry ->> 'revision')::bigint, 1), 1),
    nullif(entry ->> 'archivedAt', '')::timestamptz,
    nullif(entry ->> 'deletedAt', '')::timestamptz,
    (entry ->> 'createdAt')::timestamptz,
    (entry ->> 'updatedAt')::timestamptz
  from jsonb_array_elements(p_decks) as input(entry);

  insert into public.study_notes (
    id, user_id, deck_id, legacy_key, note_type, schema_version, fields, tags,
    content_hash, source_kind, revision, deleted_at, created_at, updated_at
  )
  select
    (entry ->> 'id')::uuid,
    p_user_id,
    (entry ->> 'deckId')::uuid,
    'migration:' || (entry ->> 'id'),
    'basic',
    1,
    entry -> 'fields',
    array(select jsonb_array_elements_text(coalesce(entry -> 'tags', '[]'::jsonb))),
    encode(extensions.digest(convert_to((entry -> 'fields')::text, 'UTF8'), 'sha256'), 'hex'),
    'legacy-jsonb',
    greatest(coalesce((entry ->> 'revision')::bigint, 1), 1),
    nullif(entry ->> 'deletedAt', '')::timestamptz,
    (entry ->> 'createdAt')::timestamptz,
    (entry ->> 'updatedAt')::timestamptz
  from jsonb_array_elements(p_notes) as input(entry)
  where jsonb_typeof(entry -> 'fields') = 'object'
    and char_length(btrim(entry #>> '{fields,prompt}')) between 1 and 2000
    and char_length(btrim(entry #>> '{fields,answer}')) between 1 and 4000;

  insert into public.study_cards (
    id, user_id, deck_id, note_id, legacy_key, template_key, ordinal, card_state,
    is_suspended, is_buried, due_at, stability, difficulty, elapsed_days,
    scheduled_days, learning_steps, repetitions, lapses, last_reviewed_at,
    scheduler_name, scheduler_version, parameters_version, scheduler_metadata,
    schedule_revision, deleted_at, created_at, updated_at
  )
  select
    (entry ->> 'id')::uuid,
    p_user_id,
    (entry ->> 'deckId')::uuid,
    (entry ->> 'noteId')::uuid,
    'migration:' || (entry ->> 'id'),
    entry ->> 'templateKey',
    coalesce((entry ->> 'ordinal')::integer, 0),
    entry ->> 'state',
    coalesce((entry ->> 'isSuspended')::boolean, false),
    coalesce((entry ->> 'isBuried')::boolean, false),
    (entry ->> 'dueAt')::timestamptz,
    coalesce((entry ->> 'stability')::double precision, 0),
    coalesce((entry ->> 'difficulty')::double precision, 0),
    coalesce((entry ->> 'elapsedDays')::double precision, 0),
    coalesce((entry ->> 'scheduledDays')::double precision, 0),
    coalesce((entry ->> 'learningSteps')::integer, 0),
    coalesce((entry ->> 'repetitions')::integer, 0),
    coalesce((entry ->> 'lapses')::integer, 0),
    nullif(entry ->> 'lastReviewedAt', '')::timestamptz,
    entry ->> 'schedulerName',
    entry ->> 'schedulerVersion',
    entry ->> 'parametersVersion',
    coalesce(entry -> 'schedulerMetadata', '{}'::jsonb),
    coalesce((entry ->> 'scheduleRevision')::bigint, 0),
    nullif(entry ->> 'deletedAt', '')::timestamptz,
    (entry ->> 'createdAt')::timestamptz,
    (entry ->> 'updatedAt')::timestamptz
  from jsonb_array_elements(p_cards) as input(entry);

  insert into public.study_review_events (
    id, user_id, card_id, card_reference_id, event_kind, reviewed_at,
    received_at, after_state, scheduler_name, scheduler_version,
    parameters_version, result
  )
  select
    (entry ->> 'id')::uuid,
    p_user_id,
    (entry ->> 'cardId')::uuid,
    (entry ->> 'cardId')::uuid,
    'migration',
    (entry ->> 'reviewedAt')::timestamptz,
    (entry ->> 'receivedAt')::timestamptz,
    entry -> 'afterState',
    'legacy-sm2-v1',
    '1',
    'legacy',
    jsonb_build_object('status', 'migration', 'eventId', entry ->> 'id')
  from jsonb_array_elements(p_events) as input(entry);

  insert into public.study_preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.study_sync_state (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select count(*)::integer into v_deck_count
  from public.study_decks
  where user_id = p_user_id and legacy_key like 'migration:%' and deleted_at is null;

  select count(*)::integer into v_note_count
  from public.study_notes
  where user_id = p_user_id and legacy_key like 'migration:%' and deleted_at is null;

  select count(*)::integer into v_card_count
  from public.study_cards
  where user_id = p_user_id and legacy_key like 'migration:%' and deleted_at is null;

  select count(*)::integer into v_event_count
  from public.study_review_events
  where user_id = p_user_id
    and event_kind = 'migration'
    and result ->> 'status' = 'migration';

  if v_deck_count <> jsonb_array_length(p_decks)
    or v_note_count <> jsonb_array_length(p_notes)
    or v_card_count <> jsonb_array_length(p_cards)
    or v_event_count <> jsonb_array_length(p_events) then
    update public.study_migration_state
    set status = 'failed',
        actual_deck_count = v_deck_count,
        actual_note_count = v_note_count,
        actual_card_count = v_card_count,
        actual_event_count = v_event_count,
        last_error_code = 'COUNT_MISMATCH',
        lease_owner = null,
        lease_expires_at = null,
        updated_at = v_timestamp
    where user_id = p_user_id;
    raise exception using errcode = 'P0001', message = 'Study migration count verification failed';
  end if;

  update public.study_migration_state
  set status = 'verified',
      actual_deck_count = v_deck_count,
      actual_note_count = v_note_count,
      actual_card_count = v_card_count,
      actual_event_count = v_event_count,
      last_error_code = null,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = v_timestamp,
      updated_at = v_timestamp
  where user_id = p_user_id;

  return jsonb_build_object(
    'status', 'verified',
    'sourceChecksum', v_source_checksum,
    'normalizedChecksum', v_payload_checksum,
    'decks', v_deck_count,
    'notes', v_note_count,
    'cards', v_card_count,
    'events', v_event_count
  );
end;
$$;

revoke all on function public.backfill_study_legacy_v1(
  uuid, uuid, jsonb, text, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.backfill_study_legacy_v1(
  uuid, uuid, jsonb, text, jsonb, jsonb, jsonb, jsonb
) to service_role;

create or replace function public.cutover_study_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_source_checksum text;
  v_state public.study_migration_state%rowtype;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Study user ID is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select encode(extensions.digest(convert_to(flashcard_sets::text, 'UTF8'), 'sha256'), 'hex')
  into v_source_checksum
  from public.users
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  select * into v_state
  from public.study_migration_state
  where user_id = p_user_id
  for update;

  if not found or v_state.status <> 'verified' then
    return jsonb_build_object('status', 'not-verified');
  end if;
  if v_state.source_checksum is distinct from v_source_checksum then
    update public.study_migration_state
    set status = 'pending',
        last_error_code = 'SOURCE_CHANGED',
        completed_at = null,
        updated_at = now()
    where user_id = p_user_id;
    return jsonb_build_object('status', 'source-changed');
  end if;
  if v_state.normalized_checksum is null
    or v_state.expected_deck_count is distinct from v_state.actual_deck_count
    or v_state.expected_note_count is distinct from v_state.actual_note_count
    or v_state.expected_card_count is distinct from v_state.actual_card_count
    or v_state.expected_event_count is distinct from v_state.actual_event_count then
    return jsonb_build_object('status', 'verification-mismatch');
  end if;

  update public.study_migration_state
  set status = 'cutover',
      last_error_code = null,
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object('status', 'cutover');
end;
$$;

revoke all on function public.cutover_study_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.cutover_study_v1(uuid)
  to service_role;

create or replace function public.get_study_sync_changes_v1(
  p_user_id uuid,
  p_after_cursor bigint,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.study_sync_state%rowtype;
  v_upper_cursor bigint;
  v_next_cursor bigint;
  v_changes jsonb;
begin
  if p_user_id is null or p_after_cursor is null or p_after_cursor < 0
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'Invalid Study sync request';
  end if;

  select * into v_state
  from public.study_sync_state
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object(
      'resetRequired', false,
      'upperCursor', 0,
      'nextCursor', 0,
      'changes', '[]'::jsonb
    );
  end if;

  if p_after_cursor < v_state.minimum_cursor then
    return jsonb_build_object(
      'resetRequired', true,
      'upperCursor', v_state.current_cursor,
      'nextCursor', p_after_cursor,
      'changes', '[]'::jsonb
    );
  end if;

  v_upper_cursor := v_state.current_cursor;

  with selected_cursors as (
    select distinct cursor
    from public.study_sync_changes
    where user_id = p_user_id
      and cursor > p_after_cursor
      and cursor <= v_upper_cursor
    order by cursor
    limit p_limit
  ), selected_changes as (
    select change.*
    from public.study_sync_changes change
    join selected_cursors selected on selected.cursor = change.cursor
    where change.user_id = p_user_id
    order by change.cursor, change.ordinal
  )
  select
    coalesce(max(cursor), p_after_cursor),
    coalesce(jsonb_agg(jsonb_build_object(
      'cursor', cursor,
      'ordinal', ordinal,
      'entityKind', entity_kind,
      'entityId', entity_id,
      'operation', operation,
      'revision', revision,
      'changedAt', changed_at
    ) order by cursor, ordinal), '[]'::jsonb)
  into v_next_cursor, v_changes
  from selected_changes;

  return jsonb_build_object(
    'resetRequired', false,
    'upperCursor', v_upper_cursor,
    'nextCursor', v_next_cursor,
    'changes', v_changes
  );
end;
$$;

revoke all on function public.get_study_sync_changes_v1(uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_study_sync_changes_v1(uuid, bigint, integer)
  to service_role;

create or replace function public.get_study_bootstrap_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_decks jsonb;
  v_preferences public.study_preferences%rowtype;
  v_due_count integer;
  v_active_session_id uuid;
  v_sync_cursor bigint;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Study user ID is required';
  end if;

  select * into v_preferences
  from public.study_preferences
  where user_id = p_user_id;

  select coalesce(current_cursor, 0) into v_sync_cursor
  from public.study_sync_state
  where user_id = p_user_id;
  v_sync_cursor := coalesce(v_sync_cursor, 0);

  select session.id into v_active_session_id
  from public.study_sessions session
  where session.user_id = p_user_id
    and session.status in ('active', 'paused')
  order by session.updated_at desc, session.id
  limit 1;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', deck.id,
      'title', deck.title,
      'description', deck.description,
      'pinned', deck.pinned,
      'revision', deck.revision,
      'cardCount', counts.card_count,
      'dueCount', counts.due_count,
      'newCount', counts.new_count,
      'updatedAt', deck.updated_at
    ) order by deck.pinned desc, deck.sort_order, deck.id), '[]'::jsonb),
    coalesce(sum(counts.due_count), 0)::integer
  into v_decks, v_due_count
  from public.study_decks deck
  left join lateral (
    select
      count(*)::integer as card_count,
      count(*) filter (where card.due_at <= now() and not card.is_suspended and not card.is_buried)::integer as due_count,
      count(*) filter (where card.card_state = 'new')::integer as new_count
    from public.study_cards card
    where card.user_id = p_user_id
      and card.deck_id = deck.id
      and card.deleted_at is null
  ) counts on true
  where deck.user_id = p_user_id
    and deck.deleted_at is null
    and deck.archived_at is null;

  return jsonb_build_object(
    'schemaVersion', 1,
    'decks', v_decks,
    'preferences', jsonb_build_object(
      'experienceMode', coalesce(v_preferences.experience_mode, 'beginner'),
      'desiredRetention', coalesce(v_preferences.desired_retention, 0.9000),
      'dailyTimeBudgetMinutes', coalesce(v_preferences.daily_time_budget_minutes, 20),
      'dailyNewLimit', coalesce(v_preferences.daily_new_limit, 20),
      'dailyReviewLimit', coalesce(v_preferences.daily_review_limit, 200),
      'dayBoundaryHour', coalesce(v_preferences.day_boundary_hour, 4),
      'timeZone', coalesce(v_preferences.time_zone, 'UTC'),
      'defaultMixingStrategy', coalesce(v_preferences.default_mixing_strategy, 'adaptive'),
      'showStreaks', coalesce(v_preferences.show_streaks, true),
      'revision', coalesce(v_preferences.revision, 1)
    ),
    'dueCount', v_due_count,
    'activeSessionId', v_active_session_id,
    'syncCursor', v_sync_cursor,
    'capabilities', jsonb_build_object(
      'normalizedStorage', true,
      'fsrs', true,
      'offlineSync', false,
      'richNotes', false,
      'aiWorkshop', false
    )
  );
end;
$$;

revoke all on function public.get_study_bootstrap_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_study_bootstrap_v1(uuid)
  to service_role;
