-- Phase 4 offline sync: cursor pull with materialized entity payloads, bounded snapshot
-- fallback, and explicit sync-change retention. Additive only.

create or replace function public.pull_study_sync_v1(
  p_user_id uuid,
  p_after_cursor bigint,
  p_limit integer default 200
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
      'status', 'ok',
      'upperCursor', 0,
      'nextCursor', 0,
      'hasMore', false,
      'changes', '[]'::jsonb
    );
  end if;

  -- A client cursor older than retained history cannot be completed incrementally.
  if p_after_cursor < v_state.minimum_cursor then
    return jsonb_build_object(
      'status', 'reset-required',
      'upperCursor', v_state.current_cursor,
      'nextCursor', p_after_cursor,
      'hasMore', false,
      'changes', '[]'::jsonb
    );
  end if;

  v_upper_cursor := v_state.current_cursor;

  with selected_cursors as (
    -- Whole cursor groups only: a transaction's changes are never split across pages.
    select distinct cursor
    from public.study_sync_changes
    where user_id = p_user_id
      and cursor > p_after_cursor
      and cursor <= v_upper_cursor
    order by cursor
    limit p_limit
  ), selected as (
    select change.*
    from public.study_sync_changes change
    join selected_cursors chosen on chosen.cursor = change.cursor
    where change.user_id = p_user_id
  ), hydrated as (
    select
      selected.cursor as change_cursor,
      selected.ordinal as change_ordinal,
      selected.entity_kind,
      selected.entity_id,
      selected.operation,
      selected.revision,
      selected.changed_at,
      case
        when selected.operation = 'delete' then null
        when selected.entity_kind = 'deck' then (
          select jsonb_build_object(
            'id', deck.id,
            'title', deck.title,
            'description', deck.description,
            'pinned', deck.pinned,
            'sortOrder', deck.sort_order,
            'revision', deck.revision,
            'archivedAt', deck.archived_at,
            'createdAt', deck.created_at,
            'updatedAt', deck.updated_at
          )
          from public.study_decks deck
          where deck.id = selected.entity_id
            and deck.user_id = p_user_id
            and deck.deleted_at is null
        )
        when selected.entity_kind = 'note' then (
          select jsonb_build_object(
            'id', note.id,
            'deckId', note.deck_id,
            'noteType', note.note_type,
            'schemaVersion', note.schema_version,
            'fields', note.fields,
            'tags', to_jsonb(note.tags),
            'revision', note.revision,
            'createdAt', note.created_at,
            'updatedAt', note.updated_at
          )
          from public.study_notes note
          where note.id = selected.entity_id
            and note.user_id = p_user_id
            and note.deleted_at is null
        )
        when selected.entity_kind = 'card' then (
          select jsonb_build_object(
            'id', card.id,
            'userId', card.user_id,
            'deckId', card.deck_id,
            'noteId', card.note_id,
            'templateKey', card.template_key,
            'ordinal', card.ordinal,
            'isSuspended', card.is_suspended,
            'isBuried', card.is_buried,
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
            'schedulerName', card.scheduler_name,
            'schedulerVersion', card.scheduler_version,
            'parametersVersion', card.parameters_version,
            'schedulerMetadata', card.scheduler_metadata,
            'scheduleRevision', card.schedule_revision,
            'createdAt', card.created_at,
            'updatedAt', card.updated_at,
            'deletedAt', card.deleted_at
          )
          from public.study_cards card
          where card.id = selected.entity_id
            and card.user_id = p_user_id
            and card.deleted_at is null
        )
        when selected.entity_kind = 'preference' then (
          select jsonb_build_object(
            'experienceMode', preference.experience_mode,
            'desiredRetention', preference.desired_retention,
            'dailyTimeBudgetMinutes', preference.daily_time_budget_minutes,
            'dailyNewLimit', preference.daily_new_limit,
            'dailyReviewLimit', preference.daily_review_limit,
            'dayBoundaryHour', preference.day_boundary_hour,
            'timeZone', preference.time_zone,
            'defaultMixingStrategy', preference.default_mixing_strategy,
            'showStreaks', preference.show_streaks,
            'revision', preference.revision
          )
          from public.study_preferences preference
          where preference.user_id = p_user_id
        )
        else null
      end as entity
    from selected
  )
  select
    coalesce(max(change_cursor), p_after_cursor),
    coalesce(jsonb_agg(jsonb_build_object(
      'cursor', change_cursor,
      'ordinal', change_ordinal,
      'entityKind', entity_kind,
      'entityId', entity_id,
      -- A row deleted after the change was recorded still resolves to a tombstone.
      'operation', case when entity is null then 'delete' else operation end,
      'revision', revision,
      'changedAt', changed_at,
      'entity', entity
    ) order by change_cursor, change_ordinal), '[]'::jsonb)
  into v_next_cursor, v_changes
  from hydrated;

  return jsonb_build_object(
    'status', 'ok',
    'upperCursor', v_upper_cursor,
    'nextCursor', v_next_cursor,
    'hasMore', v_next_cursor < v_upper_cursor,
    'changes', v_changes
  );
end;
$$;

revoke all on function public.pull_study_sync_v1(uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.pull_study_sync_v1(uuid, bigint, integer)
  to service_role;

create or replace function public.get_study_snapshot_v1(
  p_user_id uuid,
  p_limit integer default 4000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cursor bigint;
  v_deck_count integer;
  v_note_count integer;
  v_card_count integer;
  v_decks jsonb;
  v_notes jsonb;
  v_cards jsonb;
  v_preferences jsonb;
begin
  if p_user_id is null or p_limit is null or p_limit < 1 or p_limit > 20000 then
    raise exception using errcode = '22023', message = 'Invalid Study snapshot request';
  end if;

  select coalesce(current_cursor, 0) into v_cursor
  from public.study_sync_state
  where user_id = p_user_id;
  v_cursor := coalesce(v_cursor, 0);

  select count(*)::integer into v_deck_count
  from public.study_decks
  where user_id = p_user_id and deleted_at is null;

  select count(*)::integer into v_note_count
  from public.study_notes
  where user_id = p_user_id and deleted_at is null;

  select count(*)::integer into v_card_count
  from public.study_cards
  where user_id = p_user_id and deleted_at is null;

  -- Oversized libraries stay online-only rather than silently receiving partial local data.
  if v_deck_count + v_note_count + v_card_count > p_limit then
    return jsonb_build_object(
      'status', 'too-large',
      'cursor', v_cursor,
      'deckCount', v_deck_count,
      'noteCount', v_note_count,
      'cardCount', v_card_count
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', deck.id,
    'title', deck.title,
    'description', deck.description,
    'pinned', deck.pinned,
    'sortOrder', deck.sort_order,
    'revision', deck.revision,
    'archivedAt', deck.archived_at,
    'createdAt', deck.created_at,
    'updatedAt', deck.updated_at
  ) order by deck.pinned desc, deck.sort_order, deck.id), '[]'::jsonb)
  into v_decks
  from public.study_decks deck
  where deck.user_id = p_user_id and deck.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', note.id,
    'deckId', note.deck_id,
    'noteType', note.note_type,
    'schemaVersion', note.schema_version,
    'fields', note.fields,
    'tags', to_jsonb(note.tags),
    'revision', note.revision,
    'createdAt', note.created_at,
    'updatedAt', note.updated_at
  ) order by note.created_at, note.id), '[]'::jsonb)
  into v_notes
  from public.study_notes note
  where note.user_id = p_user_id and note.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', card.id,
    'userId', card.user_id,
    'deckId', card.deck_id,
    'noteId', card.note_id,
    'templateKey', card.template_key,
    'ordinal', card.ordinal,
    'isSuspended', card.is_suspended,
    'isBuried', card.is_buried,
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
    'schedulerName', card.scheduler_name,
    'schedulerVersion', card.scheduler_version,
    'parametersVersion', card.parameters_version,
    'schedulerMetadata', card.scheduler_metadata,
    'scheduleRevision', card.schedule_revision,
    'createdAt', card.created_at,
    'updatedAt', card.updated_at,
    'deletedAt', card.deleted_at
  ) order by card.due_at, card.id), '[]'::jsonb)
  into v_cards
  from public.study_cards card
  where card.user_id = p_user_id and card.deleted_at is null;

  select jsonb_build_object(
    'experienceMode', coalesce(preference.experience_mode, 'beginner'),
    'desiredRetention', coalesce(preference.desired_retention, 0.9000),
    'dailyTimeBudgetMinutes', coalesce(preference.daily_time_budget_minutes, 20),
    'dailyNewLimit', coalesce(preference.daily_new_limit, 20),
    'dailyReviewLimit', coalesce(preference.daily_review_limit, 200),
    'dayBoundaryHour', coalesce(preference.day_boundary_hour, 4),
    'timeZone', coalesce(preference.time_zone, 'UTC'),
    'defaultMixingStrategy', coalesce(preference.default_mixing_strategy, 'adaptive'),
    'showStreaks', coalesce(preference.show_streaks, true),
    'revision', coalesce(preference.revision, 1)
  )
  into v_preferences
  from (select 1) placeholder
  left join public.study_preferences preference on preference.user_id = p_user_id;

  return jsonb_build_object(
    'status', 'ok',
    'cursor', v_cursor,
    'decks', v_decks,
    'notes', v_notes,
    'cards', v_cards,
    'preferences', v_preferences
  );
end;
$$;

revoke all on function public.get_study_snapshot_v1(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_study_snapshot_v1(uuid, integer)
  to service_role;

-- Retention for the change stream. Clients older than the retained window receive a snapshot
-- instead of an incomplete incremental history.
create or replace function public.prune_study_sync_changes_v1(
  p_retention_days integer default 30,
  p_batch_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cutoff timestamptz;
  v_deleted integer := 0;
  v_users integer := 0;
begin
  if p_retention_days is null or p_retention_days < 1 or p_retention_days > 3650
    or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 100000 then
    raise exception using errcode = '22023', message = 'Invalid Study retention request';
  end if;

  v_cutoff := now() - make_interval(days => p_retention_days);

  with expired as (
    select user_id, cursor, ordinal
    from public.study_sync_changes
    where changed_at < v_cutoff
    order by user_id, cursor, ordinal
    limit p_batch_limit
  ), removed as (
    delete from public.study_sync_changes change
    using expired
    where change.user_id = expired.user_id
      and change.cursor = expired.cursor
      and change.ordinal = expired.ordinal
    returning change.user_id, change.cursor
  ), boundaries as (
    select user_id, max(cursor) as highest_removed
    from removed
    group by user_id
  ), advanced as (
    update public.study_sync_state state
    set minimum_cursor = greatest(state.minimum_cursor, boundaries.highest_removed),
        updated_at = now()
    from boundaries
    where state.user_id = boundaries.user_id
    returning state.user_id
  )
  select
    (select count(*)::integer from removed),
    (select count(*)::integer from advanced)
  into v_deleted, v_users;

  return jsonb_build_object('deleted', v_deleted, 'accounts', v_users);
end;
$$;

revoke all on function public.prune_study_sync_changes_v1(integer, integer)
  from public, anon, authenticated;
grant execute on function public.prune_study_sync_changes_v1(integer, integer)
  to service_role;
