-- Smart Sessions and analytics. Search v2 accepts the compiled query filter as typed parameters;
-- the client never sends SQL, and an unsupported query is refused before it reaches the database.

create or replace function public.search_study_cards_v2(
  p_user_id uuid,
  p_text text,
  p_deck_ids uuid[],
  p_deck_titles text[],
  p_exclude_deck_titles text[],
  p_tags text[],
  p_exclude_tags text[],
  p_note_types text[],
  p_exclude_note_types text[],
  p_states text[],
  p_exclude_states text[],
  p_only_due boolean,
  p_only_lapsed boolean,
  p_minimum_lapses integer,
  p_maximum_lapses integer,
  p_minimum_stability double precision,
  p_maximum_stability double precision,
  p_minimum_difficulty double precision,
  p_maximum_difficulty double precision,
  p_minimum_repetitions integer,
  p_added_within_days integer,
  p_rated_within_days integer,
  p_sort text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb;
  v_total integer;
  v_query tsquery;
  v_now timestamptz := now();
begin
  if p_user_id is null or p_limit is null or p_limit < 1 or p_limit > 500
    or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception using errcode = '22023', message = 'Invalid Study search request';
  end if;
  if p_sort is not null and p_sort not in
    ('due', 'created', 'lapses', 'difficulty', 'stability', 'random') then
    raise exception using errcode = '22023', message = 'Invalid Study search order';
  end if;

  if p_text is not null and btrim(p_text) <> '' then
    v_query := plainto_tsquery('simple', p_text);
  end if;

  with matched as (
    select
      card.id as card_id,
      card.deck_id,
      card.note_id,
      card.template_key,
      card.card_state,
      card.is_suspended,
      card.is_buried,
      card.due_at,
      card.stability,
      card.difficulty,
      card.elapsed_days,
      card.scheduled_days,
      card.learning_steps,
      card.repetitions,
      card.lapses,
      card.last_reviewed_at,
      card.schedule_revision,
      card.created_at,
      note.note_type,
      note.fields,
      note.tags,
      note.revision as note_revision,
      deck.title as deck_title
    from public.study_cards card
    join public.study_notes note
      on note.id = card.note_id and note.user_id = card.user_id
    join public.study_decks deck
      on deck.id = card.deck_id and deck.user_id = card.user_id
    where card.user_id = p_user_id
      and card.deleted_at is null
      and note.deleted_at is null
      and deck.deleted_at is null
      and deck.archived_at is null
      and (p_deck_ids is null or cardinality(p_deck_ids) = 0 or card.deck_id = any(p_deck_ids))
      and (
        p_deck_titles is null or cardinality(p_deck_titles) = 0
        or exists (select 1 from unnest(p_deck_titles) as wanted where lower(deck.title) = lower(wanted))
      )
      and (
        p_exclude_deck_titles is null or cardinality(p_exclude_deck_titles) = 0
        or not exists (
          select 1 from unnest(p_exclude_deck_titles) as unwanted where lower(deck.title) = lower(unwanted)
        )
      )
      and (p_tags is null or cardinality(p_tags) = 0 or note.tags && p_tags)
      and (p_exclude_tags is null or cardinality(p_exclude_tags) = 0 or not (note.tags && p_exclude_tags))
      and (p_note_types is null or cardinality(p_note_types) = 0 or note.note_type = any(p_note_types))
      and (
        p_exclude_note_types is null or cardinality(p_exclude_note_types) = 0
        or note.note_type <> all(p_exclude_note_types)
      )
      and (
        p_states is null or cardinality(p_states) = 0
        or (card.is_suspended and 'suspended' = any(p_states))
        or (card.is_buried and 'buried' = any(p_states))
        or (not card.is_suspended and not card.is_buried and card.card_state = any(p_states))
      )
      and (
        p_exclude_states is null or cardinality(p_exclude_states) = 0
        or not (
          (card.is_suspended and 'suspended' = any(p_exclude_states))
          or (card.is_buried and 'buried' = any(p_exclude_states))
          or (not card.is_suspended and not card.is_buried and card.card_state = any(p_exclude_states))
        )
      )
      and (not coalesce(p_only_due, false) or (card.due_at <= v_now and not card.is_suspended and not card.is_buried))
      and (not coalesce(p_only_lapsed, false) or card.lapses > 0)
      and (p_minimum_lapses is null or card.lapses >= p_minimum_lapses)
      and (p_maximum_lapses is null or card.lapses <= p_maximum_lapses)
      and (p_minimum_stability is null or card.stability >= p_minimum_stability)
      and (p_maximum_stability is null or card.stability <= p_maximum_stability)
      and (p_minimum_difficulty is null or card.difficulty >= p_minimum_difficulty)
      and (p_maximum_difficulty is null or card.difficulty <= p_maximum_difficulty)
      and (p_minimum_repetitions is null or card.repetitions >= p_minimum_repetitions)
      and (p_added_within_days is null or card.created_at >= v_now - make_interval(days => p_added_within_days))
      and (
        p_rated_within_days is null
        or (card.last_reviewed_at is not null
          and card.last_reviewed_at >= v_now - make_interval(days => p_rated_within_days))
      )
      and (v_query is null or note.search_document @@ v_query)
  ), counted as (
    select count(*)::integer as total from matched
  ), page as (
    select *
    from matched
    order by
      case when coalesce(p_sort, 'due') = 'due' then due_at end asc,
      case when p_sort = 'created' then created_at end desc,
      case when p_sort = 'lapses' then lapses end desc,
      case when p_sort = 'difficulty' then difficulty end desc,
      case when p_sort = 'stability' then stability end desc,
      card_id
    limit p_limit
    offset p_offset
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'cardId', page.card_id,
      'noteId', page.note_id,
      'deckId', page.deck_id,
      'deckTitle', page.deck_title,
      'templateKey', page.template_key,
      'noteType', page.note_type,
      'fields', page.fields,
      'tags', to_jsonb(page.tags),
      'noteRevision', page.note_revision,
      'state', case
        when page.is_suspended then 'suspended'
        when page.is_buried then 'buried'
        else page.card_state
      end,
      'cardState', page.card_state,
      'dueAt', page.due_at,
      'stability', page.stability,
      'difficulty', page.difficulty,
      'elapsedDays', page.elapsed_days,
      'scheduledDays', page.scheduled_days,
      'learningSteps', page.learning_steps,
      'repetitions', page.repetitions,
      'lapses', page.lapses,
      'lastReviewedAt', page.last_reviewed_at,
      'scheduleRevision', page.schedule_revision,
      'createdAt', page.created_at
    )), '[]'::jsonb),
    (select total from counted)
  into v_items, v_total
  from page;

  return jsonb_build_object('status', 'ok', 'items', v_items, 'total', coalesce(v_total, 0));
end;
$$;

revoke all on function public.search_study_cards_v2(
  uuid, text, uuid[], text[], text[], text[], text[], text[], text[], text[], text[],
  boolean, boolean, integer, integer, double precision, double precision,
  double precision, double precision, integer, integer, integer, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.search_study_cards_v2(
  uuid, text, uuid[], text[], text[], text[], text[], text[], text[], text[], text[],
  boolean, boolean, integer, integer, double precision, double precision,
  double precision, double precision, integer, integer, integer, text, integer, integer
) to service_role;

create or replace function public.save_study_smart_session_v1(
  p_user_id uuid,
  p_session_id uuid,
  p_name text,
  p_description text,
  p_query_text text,
  p_query_ast jsonb,
  p_ordering_strategy text,
  p_configuration jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.study_smart_sessions%rowtype;
  v_timestamp timestamptz := now();
  v_count integer;
begin
  if p_user_id is null or p_session_id is null then
    raise exception using errcode = '22023', message = 'Study session identity is required';
  end if;
  if p_ordering_strategy not in ('adaptive', 'blocked', 'mixed') then
    raise exception using errcode = '22023', message = 'Invalid Study session order';
  end if;

  select * into v_existing
  from public.study_smart_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if p_expected_revision is null then
    if found and v_existing.deleted_at is null then
      return jsonb_build_object('status', 'duplicate', 'sessionId', p_session_id);
    end if;

    select count(*)::integer into v_count
    from public.study_smart_sessions
    where user_id = p_user_id and deleted_at is null;
    if v_count >= 50 then
      return jsonb_build_object('status', 'limit-reached');
    end if;

    insert into public.study_smart_sessions (
      id, user_id, name, description, query_text, query_ast, ordering_strategy, configuration
    ) values (
      p_session_id, p_user_id, p_name, coalesce(p_description, ''), p_query_text, p_query_ast,
      p_ordering_strategy, coalesce(p_configuration, '{}'::jsonb)
    );
  else
    if not found or v_existing.deleted_at is not null then
      return jsonb_build_object('status', 'not-found');
    end if;
    if v_existing.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict');
    end if;

    update public.study_smart_sessions
    set name = p_name,
        description = coalesce(p_description, ''),
        query_text = p_query_text,
        query_ast = p_query_ast,
        ordering_strategy = p_ordering_strategy,
        configuration = coalesce(p_configuration, '{}'::jsonb),
        revision = revision + 1,
        updated_at = v_timestamp
    where id = p_session_id and user_id = p_user_id and revision = p_expected_revision;
  end if;

  return (
    select jsonb_build_object(
      'status', 'accepted',
      'session', jsonb_build_object(
        'id', session.id,
        'name', session.name,
        'description', session.description,
        'queryText', session.query_text,
        'queryAst', session.query_ast,
        'orderingStrategy', session.ordering_strategy,
        'configuration', session.configuration,
        'revision', session.revision,
        'updatedAt', session.updated_at
      )
    )
    from public.study_smart_sessions session
    where session.id = p_session_id and session.user_id = p_user_id
  );
end;
$$;

revoke all on function public.save_study_smart_session_v1(
  uuid, uuid, text, text, text, jsonb, text, jsonb, bigint
) from public, anon, authenticated;
grant execute on function public.save_study_smart_session_v1(
  uuid, uuid, text, text, text, jsonb, text, jsonb, bigint
) to service_role;

create or replace function public.delete_study_smart_session_v1(p_user_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.study_smart_sessions
  set deleted_at = now(), revision = revision + 1, updated_at = now()
  where id = p_session_id and user_id = p_user_id and deleted_at is null;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  return jsonb_build_object('status', 'accepted');
end;
$$;

revoke all on function public.delete_study_smart_session_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_study_smart_session_v1(uuid, uuid)
  to service_role;

-- Analytics derived from review events and current card projections. Content free: counts,
-- timings, and scheduling state only, never card text.
create or replace function public.get_study_analytics_v1(
  p_user_id uuid,
  p_history_days integer default 90,
  p_forecast_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_history jsonb;
  v_forecast jsonb;
  v_ratings jsonb;
  v_totals jsonb;
  v_decks jsonb;
  v_leeches integer;
  v_backlog integer;
  v_oldest_overdue_days integer;
begin
  if p_user_id is null
    or p_history_days is null or p_history_days < 1 or p_history_days > 365
    or p_forecast_days is null or p_forecast_days < 1 or p_forecast_days > 365 then
    raise exception using errcode = '22023', message = 'Invalid Study analytics request';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', day::date,
    'reviews', coalesce(counts.reviews, 0),
    'minutes', round(coalesce(counts.duration_ms, 0) / 60000.0, 1)
  ) order by day), '[]'::jsonb)
  into v_history
  from generate_series(
    (v_now - make_interval(days => p_history_days - 1))::date,
    v_now::date,
    interval '1 day'
  ) as day
  left join lateral (
    select
      count(*)::integer as reviews,
      sum(coalesce(event.duration_ms, 0))::bigint as duration_ms
    from public.study_review_events event
    where event.user_id = p_user_id
      and event.event_kind = 'review'
      and event.reviewed_at >= day
      and event.reviewed_at < day + interval '1 day'
  ) counts on true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', day::date,
    'due', coalesce(counts.due, 0)
  ) order by day), '[]'::jsonb)
  into v_forecast
  from generate_series(
    v_now::date,
    (v_now + make_interval(days => p_forecast_days - 1))::date,
    interval '1 day'
  ) as day
  left join lateral (
    select count(*)::integer as due
    from public.study_cards card
    where card.user_id = p_user_id
      and card.deleted_at is null
      and not card.is_suspended
      and not card.is_buried
      and card.due_at >= day
      and card.due_at < day + interval '1 day'
  ) counts on true;

  select jsonb_build_object(
    'again', count(*) filter (where rating = 'again'),
    'hard', count(*) filter (where rating = 'hard'),
    'good', count(*) filter (where rating = 'good'),
    'easy', count(*) filter (where rating = 'easy')
  )
  into v_ratings
  from public.study_review_events
  where user_id = p_user_id
    and event_kind = 'review'
    and reviewed_at >= v_now - make_interval(days => p_history_days);

  -- True retention counts only reviews of cards that were already in the review state: a first
  -- exposure to a new card is not a retention measurement.
  select jsonb_build_object(
    'reviewCount', count(*)::integer,
    'matureReviewCount', count(*) filter (where before_state ->> 'state' = 'review')::integer,
    'matureRecalledCount', count(*) filter (
      where before_state ->> 'state' = 'review' and rating <> 'again'
    )::integer,
    'studyMinutes', round(sum(coalesce(duration_ms, 0)) / 60000.0, 1)
  )
  into v_totals
  from public.study_review_events
  where user_id = p_user_id
    and event_kind = 'review'
    and reviewed_at >= v_now - make_interval(days => p_history_days);

  select count(*)::integer into v_leeches
  from public.study_cards
  where user_id = p_user_id and deleted_at is null and lapses >= 8;

  select
    count(*)::integer,
    coalesce(max(extract(day from v_now - due_at))::integer, 0)
  into v_backlog, v_oldest_overdue_days
  from public.study_cards
  where user_id = p_user_id
    and deleted_at is null
    and not is_suspended
    and not is_buried
    and due_at <= v_now;

  select coalesce(jsonb_agg(deck_stats order by deck_stats ->> 'title'), '[]'::jsonb)
  into v_decks
  from (
    select jsonb_build_object(
      'deckId', deck.id,
      'title', deck.title,
      'cardCount', count(card.id)::integer,
      'dueCount', count(card.id) filter (
        where card.due_at <= v_now and not card.is_suspended and not card.is_buried
      )::integer,
      'lapseCount', coalesce(sum(card.lapses), 0)::integer,
      'averageDifficulty', round(coalesce(avg(nullif(card.difficulty, 0)), 0)::numeric, 2)
    ) as deck_stats
    from public.study_decks deck
    left join public.study_cards card
      on card.deck_id = deck.id and card.user_id = deck.user_id and card.deleted_at is null
    where deck.user_id = p_user_id and deck.deleted_at is null and deck.archived_at is null
    group by deck.id, deck.title
  ) decks;

  return jsonb_build_object(
    'generatedAt', v_now,
    'historyDays', p_history_days,
    'forecastDays', p_forecast_days,
    'history', v_history,
    'forecast', v_forecast,
    'ratings', coalesce(v_ratings, '{}'::jsonb),
    'totals', coalesce(v_totals, '{}'::jsonb),
    'leechCount', coalesce(v_leeches, 0),
    'backlogCount', coalesce(v_backlog, 0),
    'oldestOverdueDays', coalesce(v_oldest_overdue_days, 0),
    'decks', v_decks
  );
end;
$$;

revoke all on function public.get_study_analytics_v1(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_study_analytics_v1(uuid, integer, integer)
  to service_role;
