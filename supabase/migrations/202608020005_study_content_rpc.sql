-- Transactional Study content mutations, paginated reads, exact review undo, and preferences.
-- Scheduler math stays in trusted server code; the database owns ownership, revisions, and atomicity.

create or replace function public.study_deck_summary_v1(p_user_id uuid, p_deck_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', deck.id,
    'title', deck.title,
    'description', deck.description,
    'pinned', deck.pinned,
    'revision', deck.revision,
    'cardCount', counts.card_count,
    'dueCount', counts.due_count,
    'newCount', counts.new_count,
    'updatedAt', deck.updated_at
  )
  from public.study_decks deck
  left join lateral (
    select
      count(*)::integer as card_count,
      count(*) filter (
        where card.due_at <= now() and not card.is_suspended and not card.is_buried
      )::integer as due_count,
      count(*) filter (where card.card_state = 'new')::integer as new_count
    from public.study_cards card
    where card.user_id = p_user_id
      and card.deck_id = deck.id
      and card.deleted_at is null
  ) counts on true
  where deck.user_id = p_user_id
    and deck.id = p_deck_id;
$$;

revoke all on function public.study_deck_summary_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.study_deck_summary_v1(uuid, uuid) to service_role;

create or replace function public.study_next_cursor_v1(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cursor bigint;
begin
  insert into public.study_sync_state (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.study_sync_state
  set current_cursor = current_cursor + 1,
      updated_at = now()
  where user_id = p_user_id
  returning current_cursor into v_cursor;

  return v_cursor;
end;
$$;

revoke all on function public.study_next_cursor_v1(uuid) from public, anon, authenticated;
grant execute on function public.study_next_cursor_v1(uuid) to service_role;

-- Deck create/update. A null expected revision means create; the deck ID is client-supplied so
-- retries are idempotent instead of producing duplicates.
create or replace function public.upsert_study_deck_v1(
  p_user_id uuid,
  p_deck_id uuid,
  p_title text,
  p_description text,
  p_pinned boolean,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deck public.study_decks%rowtype;
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_deck_count integer;
  v_sort_order integer;
begin
  if p_user_id is null or p_deck_id is null then
    raise exception using errcode = '22023', message = 'Study deck identity is required';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 1 or char_length(btrim(p_title)) > 120 then
    raise exception using errcode = '22023', message = 'Invalid Study deck title';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception using errcode = '22023', message = 'Invalid Study deck description';
  end if;
  if p_expected_revision is not null and p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'Invalid Study deck revision';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select * into v_deck
  from public.study_decks
  where id = p_deck_id and user_id = p_user_id
  for update;

  if p_expected_revision is null then
    if found then
      -- Idempotent retry of the same create.
      if v_deck.deleted_at is not null then
        return jsonb_build_object('status', 'conflict');
      end if;
      return jsonb_build_object(
        'status', 'duplicate',
        'deck', public.study_deck_summary_v1(p_user_id, p_deck_id)
      );
    end if;

    select count(*)::integer into v_deck_count
    from public.study_decks
    where user_id = p_user_id and deleted_at is null;

    if v_deck_count >= 60 then
      return jsonb_build_object('status', 'limit-reached');
    end if;

    select coalesce(max(sort_order), -1) + 1 into v_sort_order
    from public.study_decks
    where user_id = p_user_id and deleted_at is null;

    v_cursor := public.study_next_cursor_v1(p_user_id);

    insert into public.study_decks (
      id, user_id, title, description, pinned, sort_order, revision, created_at, updated_at
    ) values (
      p_deck_id, p_user_id, btrim(p_title), coalesce(p_description, ''), coalesce(p_pinned, false),
      v_sort_order, 1, v_timestamp, v_timestamp
    );
  else
    if not found or v_deck.deleted_at is not null then
      return jsonb_build_object('status', 'not-found');
    end if;
    if v_deck.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict', 'revision', v_deck.revision);
    end if;

    v_cursor := public.study_next_cursor_v1(p_user_id);

    update public.study_decks
    set title = btrim(p_title),
        description = coalesce(p_description, ''),
        pinned = coalesce(p_pinned, pinned),
        revision = revision + 1,
        updated_at = v_timestamp
    where id = p_deck_id and user_id = p_user_id and revision = p_expected_revision;

    if not found then
      return jsonb_build_object('status', 'conflict');
    end if;
  end if;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select p_user_id, v_cursor, 0, 'deck', p_deck_id, 'upsert', deck.revision, v_timestamp
  from public.study_decks deck
  where deck.id = p_deck_id and deck.user_id = p_user_id;

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'deck', public.study_deck_summary_v1(p_user_id, p_deck_id)
  );
end;
$$;

revoke all on function public.upsert_study_deck_v1(uuid, uuid, text, text, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.upsert_study_deck_v1(uuid, uuid, text, text, boolean, bigint)
  to service_role;

create or replace function public.delete_study_deck_v1(p_user_id uuid, p_deck_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_ordinal integer := 1;
begin
  if p_user_id is null or p_deck_id is null then
    raise exception using errcode = '22023', message = 'Study deck identity is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  perform 1
  from public.study_decks
  where id = p_deck_id and user_id = p_user_id and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  v_cursor := public.study_next_cursor_v1(p_user_id);

  update public.study_cards
  set deleted_at = v_timestamp, updated_at = v_timestamp
  where user_id = p_user_id and deck_id = p_deck_id and deleted_at is null;

  update public.study_notes
  set deleted_at = v_timestamp, updated_at = v_timestamp
  where user_id = p_user_id and deck_id = p_deck_id and deleted_at is null;

  update public.study_decks
  set deleted_at = v_timestamp, revision = revision + 1, updated_at = v_timestamp
  where id = p_deck_id and user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select p_user_id, v_cursor, 0, 'deck', p_deck_id, 'delete', deck.revision, v_timestamp
  from public.study_decks deck
  where deck.id = p_deck_id and deck.user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select
    p_user_id,
    v_cursor,
    v_ordinal + (row_number() over (order by entity_kind, entity_id))::integer - 1,
    entity_kind,
    entity_id,
    'delete',
    revision,
    v_timestamp
  from (
    select 'note'::text as entity_kind, note.id as entity_id, note.revision as revision
    from public.study_notes note
    where note.user_id = p_user_id and note.deck_id = p_deck_id and note.deleted_at = v_timestamp
    union all
    select 'card'::text, card.id, card.schedule_revision
    from public.study_cards card
    where card.user_id = p_user_id and card.deck_id = p_deck_id and card.deleted_at = v_timestamp
  ) removed;

  return jsonb_build_object('status', 'accepted', 'syncCursor', v_cursor);
end;
$$;

revoke all on function public.delete_study_deck_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_study_deck_v1(uuid, uuid) to service_role;

-- Note create/update with stable template keys. Cards for retained templates keep their scheduling;
-- removed templates are soft-deleted; new templates get the server-computed initial state.
create or replace function public.upsert_study_note_v1(
  p_user_id uuid,
  p_note_id uuid,
  p_deck_id uuid,
  p_note_type text,
  p_fields jsonb,
  p_tags text[],
  p_expected_revision bigint,
  p_templates jsonb,
  p_initial_state jsonb,
  p_scheduler_name text,
  p_scheduler_version text,
  p_parameters_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_note public.study_notes%rowtype;
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_card_count integer;
  v_new_templates integer;
  v_ordinal integer := 1;
begin
  if p_user_id is null or p_note_id is null or p_deck_id is null then
    raise exception using errcode = '22023', message = 'Study note identity is required';
  end if;
  if p_note_type is null or p_note_type <> 'basic' then
    raise exception using errcode = '22023', message = 'Unsupported Study note type';
  end if;
  if jsonb_typeof(p_fields) is distinct from 'object'
    or jsonb_typeof(p_templates) is distinct from 'array'
    or jsonb_typeof(p_initial_state) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid Study note payload';
  end if;
  if jsonb_array_length(p_templates) < 1 or jsonb_array_length(p_templates) > 8 then
    raise exception using errcode = '22023', message = 'Invalid Study card template list';
  end if;
  if p_expected_revision is not null and p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'Invalid Study note revision';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  perform 1
  from public.study_decks
  where id = p_deck_id and user_id = p_user_id and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('status', 'deck-not-found');
  end if;

  select * into v_note
  from public.study_notes
  where id = p_note_id and user_id = p_user_id
  for update;

  if p_expected_revision is null then
    if found then
      if v_note.deleted_at is not null then
        return jsonb_build_object('status', 'conflict');
      end if;
      return jsonb_build_object('status', 'duplicate', 'noteId', p_note_id);
    end if;

    select count(*)::integer into v_card_count
    from public.study_cards
    where user_id = p_user_id and deck_id = p_deck_id and deleted_at is null;

    if v_card_count + jsonb_array_length(p_templates) > 500 then
      return jsonb_build_object('status', 'limit-reached');
    end if;

    v_cursor := public.study_next_cursor_v1(p_user_id);

    insert into public.study_notes (
      id, user_id, deck_id, note_type, schema_version, fields, tags, source_kind,
      revision, created_at, updated_at
    ) values (
      p_note_id, p_user_id, p_deck_id, p_note_type, 1, p_fields,
      coalesce(p_tags, '{}'::text[]), 'manual', 1, v_timestamp, v_timestamp
    );
  else
    if not found or v_note.deleted_at is not null then
      return jsonb_build_object('status', 'not-found');
    end if;
    if v_note.deck_id <> p_deck_id then
      return jsonb_build_object('status', 'conflict');
    end if;
    if v_note.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict', 'revision', v_note.revision);
    end if;

    v_cursor := public.study_next_cursor_v1(p_user_id);

    update public.study_notes
    set fields = p_fields,
        tags = coalesce(p_tags, '{}'::text[]),
        revision = revision + 1,
        updated_at = v_timestamp
    where id = p_note_id and user_id = p_user_id and revision = p_expected_revision;

    if not found then
      return jsonb_build_object('status', 'conflict');
    end if;
  end if;

  -- Retire cards whose template no longer exists on this note.
  update public.study_cards
  set deleted_at = v_timestamp, updated_at = v_timestamp
  where user_id = p_user_id
    and note_id = p_note_id
    and deleted_at is null
    and template_key not in (
      select template ->> 'templateKey'
      from jsonb_array_elements(p_templates) as template
    );

  -- Create cards for templates that do not exist yet.
  insert into public.study_cards (
    id, user_id, deck_id, note_id, template_key, ordinal,
    card_state, due_at, stability, difficulty, elapsed_days, scheduled_days,
    learning_steps, repetitions, lapses, last_reviewed_at,
    scheduler_name, scheduler_version, parameters_version, schedule_revision,
    created_at, updated_at
  )
  select
    (template ->> 'cardId')::uuid,
    p_user_id,
    p_deck_id,
    p_note_id,
    template ->> 'templateKey',
    coalesce((template ->> 'ordinal')::integer, 0),
    p_initial_state ->> 'state',
    (p_initial_state ->> 'dueAt')::timestamptz,
    (p_initial_state ->> 'stability')::double precision,
    (p_initial_state ->> 'difficulty')::double precision,
    (p_initial_state ->> 'elapsedDays')::double precision,
    (p_initial_state ->> 'scheduledDays')::double precision,
    (p_initial_state ->> 'learningSteps')::integer,
    (p_initial_state ->> 'repetitions')::integer,
    (p_initial_state ->> 'lapses')::integer,
    (p_initial_state ->> 'lastReviewedAt')::timestamptz,
    p_scheduler_name,
    p_scheduler_version,
    p_parameters_version,
    0,
    v_timestamp,
    v_timestamp
  from jsonb_array_elements(p_templates) as template
  where not exists (
    select 1
    from public.study_cards existing
    where existing.user_id = p_user_id
      and existing.note_id = p_note_id
      and existing.template_key = template ->> 'templateKey'
      and existing.deleted_at is null
  );

  get diagnostics v_new_templates = row_count;

  update public.study_decks
  set updated_at = v_timestamp
  where id = p_deck_id and user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select p_user_id, v_cursor, 0, 'note', p_note_id, 'upsert', note.revision, v_timestamp
  from public.study_notes note
  where note.id = p_note_id and note.user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select
    p_user_id,
    v_cursor,
    v_ordinal + (row_number() over (order by card.id))::integer - 1,
    'card',
    card.id,
    case when card.deleted_at is null then 'upsert' else 'delete' end,
    card.schedule_revision,
    v_timestamp
  from public.study_cards card
  where card.user_id = p_user_id
    and card.note_id = p_note_id
    and card.updated_at = v_timestamp;

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'noteId', p_note_id,
    'createdCards', v_new_templates,
    'deck', public.study_deck_summary_v1(p_user_id, p_deck_id)
  );
end;
$$;

revoke all on function public.upsert_study_note_v1(
  uuid, uuid, uuid, text, jsonb, text[], bigint, jsonb, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.upsert_study_note_v1(
  uuid, uuid, uuid, text, jsonb, text[], bigint, jsonb, jsonb, text, text, text
) to service_role;

create or replace function public.delete_study_note_v1(p_user_id uuid, p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_note public.study_notes%rowtype;
  v_timestamp timestamptz := now();
  v_cursor bigint;
begin
  if p_user_id is null or p_note_id is null then
    raise exception using errcode = '22023', message = 'Study note identity is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select * into v_note
  from public.study_notes
  where id = p_note_id and user_id = p_user_id and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  v_cursor := public.study_next_cursor_v1(p_user_id);

  update public.study_cards
  set deleted_at = v_timestamp, updated_at = v_timestamp
  where user_id = p_user_id and note_id = p_note_id and deleted_at is null;

  update public.study_notes
  set deleted_at = v_timestamp, revision = revision + 1, updated_at = v_timestamp
  where id = p_note_id and user_id = p_user_id;

  update public.study_decks
  set updated_at = v_timestamp
  where id = v_note.deck_id and user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select p_user_id, v_cursor, 0, 'note', p_note_id, 'delete', note.revision, v_timestamp
  from public.study_notes note
  where note.id = p_note_id and note.user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select
    p_user_id,
    v_cursor,
    (row_number() over (order by card.id))::integer,
    'card',
    card.id,
    'delete',
    card.schedule_revision,
    v_timestamp
  from public.study_cards card
  where card.user_id = p_user_id
    and card.note_id = p_note_id
    and card.deleted_at = v_timestamp;

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'deck', public.study_deck_summary_v1(p_user_id, v_note.deck_id)
  );
end;
$$;

revoke all on function public.delete_study_note_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_study_note_v1(uuid, uuid) to service_role;

-- Keyset-paginated deck contents. Study home never loads the whole library through this path.
create or replace function public.get_study_deck_contents_v1(
  p_user_id uuid,
  p_deck_id uuid,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_notes jsonb;
  v_has_more boolean := false;
  v_next_created_at timestamptz;
  v_next_id uuid;
begin
  if p_user_id is null or p_deck_id is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'Invalid Study deck contents request';
  end if;

  perform 1
  from public.study_decks
  where id = p_deck_id and user_id = p_user_id and deleted_at is null;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  with page as (
    select note.*
    from public.study_notes note
    where note.user_id = p_user_id
      and note.deck_id = p_deck_id
      and note.deleted_at is null
      and (
        p_after_created_at is null
        or (note.created_at, note.id) > (p_after_created_at, p_after_id)
      )
    order by note.created_at, note.id
    limit p_limit + 1
  ), limited as (
    select * from page order by created_at, id limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', limited.id,
      'deckId', limited.deck_id,
      'noteType', limited.note_type,
      'schemaVersion', limited.schema_version,
      'fields', limited.fields,
      'tags', to_jsonb(limited.tags),
      'revision', limited.revision,
      'createdAt', limited.created_at,
      'updatedAt', limited.updated_at,
      'cards', coalesce(cards.items, '[]'::jsonb)
    ) order by limited.created_at, limited.id), '[]'::jsonb),
    (select count(*) from page) > p_limit,
    max(limited.created_at),
    (array_agg(limited.id order by limited.created_at desc, limited.id desc))[1]
  into v_notes, v_has_more, v_next_created_at, v_next_id
  from limited
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', card.id,
      'templateKey', card.template_key,
      'ordinal', card.ordinal,
      'state', card.card_state,
      'dueAt', card.due_at,
      'isSuspended', card.is_suspended,
      'isBuried', card.is_buried,
      'repetitions', card.repetitions,
      'lapses', card.lapses,
      'lastReviewedAt', card.last_reviewed_at,
      'scheduleRevision', card.schedule_revision
    ) order by card.ordinal, card.id) as items
    from public.study_cards card
    where card.user_id = p_user_id
      and card.note_id = limited.id
      and card.deleted_at is null
  ) cards on true;

  return jsonb_build_object(
    'status', 'ok',
    'notes', v_notes,
    'nextCursor', case
      when v_has_more and v_next_created_at is not null
        then to_char(v_next_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF') || '|' || v_next_id::text
      else null
    end
  );
end;
$$;

revoke all on function public.get_study_deck_contents_v1(uuid, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_study_deck_contents_v1(uuid, uuid, timestamptz, uuid, integer)
  to service_role;

-- Due-first review queue with the note content each card renders.
create or replace function public.get_study_review_queue_v1(
  p_user_id uuid,
  p_deck_id uuid,
  p_limit integer default 50,
  p_include_new boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb;
begin
  if p_user_id is null or p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = '22023', message = 'Invalid Study queue request';
  end if;

  select coalesce(jsonb_agg(item order by item_due_at, item_id), '[]'::jsonb)
  into v_items
  from (
    select
      card.due_at as item_due_at,
      card.id as item_id,
      jsonb_build_object(
        'cardId', card.id,
        'noteId', note.id,
        'deckId', card.deck_id,
        'deckTitle', deck.title,
        'templateKey', card.template_key,
        'state', card.card_state,
        'dueAt', card.due_at,
        'stability', card.stability,
        'difficulty', card.difficulty,
        'elapsedDays', card.elapsed_days,
        'scheduledDays', card.scheduled_days,
        'learningSteps', card.learning_steps,
        'repetitions', card.repetitions,
        'lapses', card.lapses,
        'lastReviewedAt', card.last_reviewed_at,
        'scheduleRevision', card.schedule_revision,
        'noteRevision', note.revision,
        'noteType', note.note_type,
        'fields', note.fields,
        'tags', to_jsonb(note.tags)
      ) as item
    from public.study_cards card
    join public.study_notes note
      on note.id = card.note_id and note.user_id = card.user_id
    join public.study_decks deck
      on deck.id = card.deck_id and deck.user_id = card.user_id
    where card.user_id = p_user_id
      and card.deleted_at is null
      and not card.is_suspended
      and not card.is_buried
      and note.deleted_at is null
      and deck.deleted_at is null
      and deck.archived_at is null
      and (p_deck_id is null or card.deck_id = p_deck_id)
      and card.due_at <= now()
      and (p_include_new or card.card_state <> 'new')
    order by card.due_at, card.id
    limit p_limit
  ) queue;

  return jsonb_build_object('status', 'ok', 'items', v_items);
end;
$$;

revoke all on function public.get_study_review_queue_v1(uuid, uuid, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.get_study_review_queue_v1(uuid, uuid, integer, boolean)
  to service_role;

-- Exact undo. Restores the target event's stored before_state and records a compensating event;
-- review history is never deleted. Only the latest effective review of a card can be undone.
create or replace function public.undo_study_review_v1(
  p_user_id uuid,
  p_target_event_id uuid,
  p_undo_event_id uuid,
  p_client_operation_id uuid,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target public.study_review_events%rowtype;
  v_existing public.study_review_events%rowtype;
  v_card public.study_cards%rowtype;
  v_updated public.study_cards%rowtype;
  v_before jsonb;
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_result jsonb;
begin
  if p_user_id is null or p_target_event_id is null or p_undo_event_id is null
    or p_client_operation_id is null then
    raise exception using errcode = '22023', message = 'Study undo identity is required';
  end if;

  insert into public.study_sync_state (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  perform 1 from public.study_sync_state where user_id = p_user_id for update;

  select * into v_existing
  from public.study_review_events
  where user_id = p_user_id and client_operation_id = p_client_operation_id;

  if found then
    if v_existing.event_kind <> 'undo' or v_existing.target_event_id is distinct from p_target_event_id then
      raise exception using errcode = '22023', message = 'Study operation ID was reused with different input';
    end if;
    return jsonb_set(v_existing.result, '{status}', '"duplicate"'::jsonb, true);
  end if;

  select * into v_target
  from public.study_review_events
  where id = p_target_event_id and user_id = p_user_id;

  if not found or v_target.event_kind <> 'review' or v_target.card_id is null then
    return jsonb_build_object('status', 'not-found');
  end if;

  perform 1
  from public.study_review_events
  where user_id = p_user_id and target_event_id = p_target_event_id;

  if found then
    return jsonb_build_object('status', 'already-undone');
  end if;

  select * into v_card
  from public.study_cards
  where id = v_target.card_id and user_id = p_user_id and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  -- The target must still be the card's newest scheduling transition.
  if v_card.schedule_revision is distinct from (v_target.result -> 'card' ->> 'scheduleRevision')::bigint then
    return jsonb_build_object('status', 'superseded', 'scheduleRevision', v_card.schedule_revision);
  end if;

  v_before := v_target.before_state;
  if jsonb_typeof(v_before) is distinct from 'object' then
    return jsonb_build_object('status', 'not-undoable');
  end if;

  v_cursor := public.study_next_cursor_v1(p_user_id);

  update public.study_cards
  set card_state = v_before ->> 'state',
      due_at = (v_before ->> 'dueAt')::timestamptz,
      stability = (v_before ->> 'stability')::double precision,
      difficulty = (v_before ->> 'difficulty')::double precision,
      elapsed_days = (v_before ->> 'elapsedDays')::double precision,
      scheduled_days = (v_before ->> 'scheduledDays')::double precision,
      learning_steps = (v_before ->> 'learningSteps')::integer,
      repetitions = (v_before ->> 'repetitions')::integer,
      lapses = (v_before ->> 'lapses')::integer,
      last_reviewed_at = (v_before ->> 'lastReviewedAt')::timestamptz,
      scheduler_name = coalesce(v_before ->> 'schedulerName', scheduler_name),
      scheduler_version = coalesce(v_before ->> 'schedulerVersion', scheduler_version),
      parameters_version = coalesce(v_before ->> 'parametersVersion', parameters_version),
      schedule_revision = schedule_revision + 1,
      updated_at = v_timestamp
  where id = v_card.id and user_id = p_user_id
  returning * into v_updated;

  v_result := jsonb_build_object(
    'status', 'accepted',
    'operationId', p_client_operation_id,
    'eventId', p_undo_event_id,
    'targetEventId', p_target_event_id,
    'syncCursor', v_cursor,
    'card', jsonb_build_object(
      'id', v_updated.id,
      'userId', v_updated.user_id,
      'deckId', v_updated.deck_id,
      'noteId', v_updated.note_id,
      'templateKey', v_updated.template_key,
      'ordinal', v_updated.ordinal,
      'isSuspended', v_updated.is_suspended,
      'isBuried', v_updated.is_buried,
      'state', v_updated.card_state,
      'dueAt', v_updated.due_at,
      'stability', v_updated.stability,
      'difficulty', v_updated.difficulty,
      'elapsedDays', v_updated.elapsed_days,
      'scheduledDays', v_updated.scheduled_days,
      'learningSteps', v_updated.learning_steps,
      'repetitions', v_updated.repetitions,
      'lapses', v_updated.lapses,
      'lastReviewedAt', v_updated.last_reviewed_at,
      'schedulerName', v_updated.scheduler_name,
      'schedulerVersion', v_updated.scheduler_version,
      'parametersVersion', v_updated.parameters_version,
      'schedulerMetadata', v_updated.scheduler_metadata,
      'scheduleRevision', v_updated.schedule_revision,
      'createdAt', v_updated.created_at,
      'updatedAt', v_updated.updated_at,
      'deletedAt', v_updated.deleted_at
    )
  );

  insert into public.study_review_events (
    id, user_id, card_id, card_reference_id, session_id, client_operation_id,
    operation_fingerprint, request, device_id, event_kind, rating, reviewed_at, received_at,
    before_state, after_state, scheduler_name, scheduler_version, parameters_version,
    scheduler_profile_id, target_event_id, result
  ) values (
    p_undo_event_id,
    p_user_id,
    v_updated.id,
    v_updated.id,
    v_target.session_id,
    p_client_operation_id,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'targetEventId', p_target_event_id,
      'clientOperationId', p_client_operation_id,
      'deviceId', p_device_id
    )),
    p_device_id,
    'undo',
    null,
    v_timestamp,
    v_timestamp,
    v_target.after_state,
    v_before,
    v_updated.scheduler_name,
    v_updated.scheduler_version,
    v_updated.parameters_version,
    v_target.scheduler_profile_id,
    p_target_event_id,
    v_result
  );

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  ) values (
    p_user_id, v_cursor, 0, 'card', v_updated.id, 'upsert', v_updated.schedule_revision, v_timestamp
  );

  if v_target.session_id is not null then
    update public.study_session_cards
    set status = 'pending', review_event_id = null, updated_at = v_timestamp
    where session_id = v_target.session_id
      and user_id = p_user_id
      and card_reference_id = v_updated.id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.undo_study_review_v1(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.undo_study_review_v1(uuid, uuid, uuid, uuid, uuid)
  to service_role;

-- Most recent undoable review for the signed-in learner, used to offer Undo in the review flow.
create or replace function public.get_study_undoable_review_v1(p_user_id uuid, p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.study_review_events%rowtype;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Study user ID is required';
  end if;

  select event.* into v_event
  from public.study_review_events event
  join public.study_cards card
    on card.id = event.card_id and card.user_id = event.user_id
  where event.user_id = p_user_id
    and event.event_kind = 'review'
    and (p_card_id is null or event.card_id = p_card_id)
    and card.deleted_at is null
    and card.schedule_revision = (event.result -> 'card' ->> 'scheduleRevision')::bigint
    and not exists (
      select 1
      from public.study_review_events undo
      where undo.user_id = p_user_id and undo.target_event_id = event.id
    )
  order by event.received_at desc, event.id desc
  limit 1;

  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'eventId', v_event.id,
    'cardId', v_event.card_id,
    'rating', v_event.rating,
    'reviewedAt', v_event.reviewed_at
  );
end;
$$;

revoke all on function public.get_study_undoable_review_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_study_undoable_review_v1(uuid, uuid)
  to service_role;

create or replace function public.save_study_preferences_v1(
  p_user_id uuid,
  p_experience_mode text,
  p_desired_retention numeric,
  p_daily_time_budget_minutes integer,
  p_daily_new_limit integer,
  p_daily_review_limit integer,
  p_day_boundary_hour integer,
  p_time_zone text,
  p_default_mixing_strategy text,
  p_show_streaks boolean,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preferences public.study_preferences%rowtype;
  v_timestamp timestamptz := now();
  v_cursor bigint;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Study user ID is required';
  end if;

  insert into public.study_preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_preferences
  from public.study_preferences
  where user_id = p_user_id
  for update;

  if p_expected_revision is not null and v_preferences.revision <> p_expected_revision then
    return jsonb_build_object('status', 'conflict', 'revision', v_preferences.revision);
  end if;

  v_cursor := public.study_next_cursor_v1(p_user_id);

  update public.study_preferences
  set experience_mode = coalesce(p_experience_mode, experience_mode),
      desired_retention = coalesce(p_desired_retention, desired_retention),
      daily_time_budget_minutes = coalesce(p_daily_time_budget_minutes, daily_time_budget_minutes),
      daily_new_limit = coalesce(p_daily_new_limit, daily_new_limit),
      daily_review_limit = coalesce(p_daily_review_limit, daily_review_limit),
      day_boundary_hour = coalesce(p_day_boundary_hour, day_boundary_hour),
      time_zone = coalesce(p_time_zone, time_zone),
      default_mixing_strategy = coalesce(p_default_mixing_strategy, default_mixing_strategy),
      show_streaks = coalesce(p_show_streaks, show_streaks),
      revision = revision + 1,
      updated_at = v_timestamp
  where user_id = p_user_id
  returning * into v_preferences;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  ) values (
    p_user_id, v_cursor, 0, 'preference', p_user_id, 'upsert', v_preferences.revision, v_timestamp
  );

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'preferences', jsonb_build_object(
      'experienceMode', v_preferences.experience_mode,
      'desiredRetention', v_preferences.desired_retention,
      'dailyTimeBudgetMinutes', v_preferences.daily_time_budget_minutes,
      'dailyNewLimit', v_preferences.daily_new_limit,
      'dailyReviewLimit', v_preferences.daily_review_limit,
      'dayBoundaryHour', v_preferences.day_boundary_hour,
      'timeZone', v_preferences.time_zone,
      'defaultMixingStrategy', v_preferences.default_mixing_strategy,
      'showStreaks', v_preferences.show_streaks,
      'revision', v_preferences.revision
    )
  );
end;
$$;

revoke all on function public.save_study_preferences_v1(
  uuid, text, numeric, integer, integer, integer, integer, text, text, boolean, bigint
) from public, anon, authenticated;
grant execute on function public.save_study_preferences_v1(
  uuid, text, numeric, integer, integer, integer, integer, text, text, boolean, bigint
) to service_role;
