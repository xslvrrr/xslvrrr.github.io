-- Atomic, idempotent Study review transition. Scheduler output is computed by trusted server code;
-- database validates ownership, revision, before-state, and persistence atomically.

create or replace function public.apply_study_review_v1(
  p_user_id uuid,
  p_card_id uuid,
  p_event_id uuid,
  p_client_operation_id uuid,
  p_expected_schedule_revision bigint,
  p_rating text,
  p_reviewed_at timestamptz,
  p_duration_ms integer,
  p_device_id uuid,
  p_session_id uuid,
  p_before_state jsonb,
  p_after_state jsonb,
  p_preview jsonb,
  p_scheduler_name text,
  p_scheduler_version text,
  p_parameters_version text,
  p_scheduler_profile_id uuid,
  p_retrievability_before double precision,
  p_next_interval_seconds bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_card public.study_cards%rowtype;
  v_updated public.study_cards%rowtype;
  v_existing public.study_review_events%rowtype;
  v_received_at timestamptz := now();
  v_cursor bigint;
  v_fingerprint text;
  v_request jsonb;
  v_result jsonb;
begin
  if p_user_id is null
    or p_card_id is null
    or p_event_id is null
    or p_client_operation_id is null
    or p_reviewed_at is null
    or p_expected_schedule_revision is null
    or p_scheduler_name is null
    or p_scheduler_version is null
    or p_parameters_version is null then
    raise exception using errcode = '22023', message = 'Study review fields are required';
  end if;
  if p_rating is null or p_rating not in ('again', 'hard', 'good', 'easy') then
    raise exception using errcode = '22023', message = 'Invalid Study review rating';
  end if;
  if p_expected_schedule_revision < 0 then
    raise exception using errcode = '22023', message = 'Invalid Study schedule revision';
  end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then
    raise exception using errcode = '22023', message = 'Invalid Study review duration';
  end if;
  if p_reviewed_at < v_received_at - interval '7 days' or p_reviewed_at > v_received_at + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'Study review timestamp is outside the accepted range';
  end if;
  if jsonb_typeof(p_before_state) is distinct from 'object'
    or jsonb_typeof(p_after_state) is distinct from 'object'
    or jsonb_typeof(p_preview) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Study scheduling states and preview must be objects';
  end if;
  if p_retrievability_before is not null and (p_retrievability_before < 0 or p_retrievability_before > 1) then
    raise exception using errcode = '22023', message = 'Invalid Study retrievability';
  end if;
  if p_next_interval_seconds is not null and p_next_interval_seconds < 0 then
    raise exception using errcode = '22023', message = 'Invalid Study interval';
  end if;

  v_request := jsonb_strip_nulls(jsonb_build_object(
    'cardId', p_card_id,
    'clientOperationId', p_client_operation_id,
    'expectedScheduleRevision', p_expected_schedule_revision,
    'rating', p_rating,
    'reviewedAt', p_reviewed_at,
    'durationMs', p_duration_ms,
    'deviceId', p_device_id,
    'sessionId', p_session_id
  ));
  v_fingerprint := encode(extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.study_sync_state (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select current_cursor
  into v_cursor
  from public.study_sync_state
  where user_id = p_user_id
  for update;

  select *
  into v_existing
  from public.study_review_events
  where user_id = p_user_id
    and client_operation_id = p_client_operation_id;

  if found then
    if v_existing.operation_fingerprint is distinct from v_fingerprint then
      raise exception using errcode = '22023', message = 'Study operation ID was reused with different input';
    end if;
    return jsonb_set(v_existing.result, '{status}', '"duplicate"'::jsonb, true);
  end if;

  select *
  into v_card
  from public.study_cards
  where id = p_card_id
    and user_id = p_user_id
    and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  if v_card.is_suspended or v_card.is_buried then
    return jsonb_build_object('status', 'unavailable');
  end if;

  if v_card.last_reviewed_at is not null and p_reviewed_at < v_card.last_reviewed_at then
    return jsonb_build_object('status', 'invalid-review-time');
  end if;

  if p_session_id is not null then
    perform 1
    from public.study_session_cards
    where session_id = p_session_id
      and user_id = p_user_id
      and card_reference_id = p_card_id
      and status = 'pending'
    for update;
    if not found then
      return jsonb_build_object('status', 'invalid-session');
    end if;
  end if;

  if v_card.schedule_revision <> p_expected_schedule_revision then
    return jsonb_build_object(
      'status', 'conflict',
      'scheduleRevision', v_card.schedule_revision
    );
  end if;

  if p_before_state ->> 'state' is distinct from v_card.card_state
    or (p_before_state ->> 'dueAt')::timestamptz is distinct from v_card.due_at
    or (p_before_state ->> 'stability')::double precision is distinct from v_card.stability
    or (p_before_state ->> 'difficulty')::double precision is distinct from v_card.difficulty
    or (p_before_state ->> 'elapsedDays')::double precision is distinct from v_card.elapsed_days
    or (p_before_state ->> 'scheduledDays')::double precision is distinct from v_card.scheduled_days
    or (p_before_state ->> 'learningSteps')::integer is distinct from v_card.learning_steps
    or (p_before_state ->> 'repetitions')::integer is distinct from v_card.repetitions
    or (p_before_state ->> 'lapses')::integer is distinct from v_card.lapses
    or (p_before_state ->> 'lastReviewedAt')::timestamptz is distinct from v_card.last_reviewed_at then
    return jsonb_build_object(
      'status', 'conflict',
      'scheduleRevision', v_card.schedule_revision
    );
  end if;

  update public.study_sync_state
  set current_cursor = current_cursor + 1,
      updated_at = v_received_at
  where user_id = p_user_id
  returning current_cursor into v_cursor;

  update public.study_cards
  set card_state = p_after_state ->> 'state',
      due_at = (p_after_state ->> 'dueAt')::timestamptz,
      stability = (p_after_state ->> 'stability')::double precision,
      difficulty = (p_after_state ->> 'difficulty')::double precision,
      elapsed_days = (p_after_state ->> 'elapsedDays')::double precision,
      scheduled_days = (p_after_state ->> 'scheduledDays')::double precision,
      learning_steps = (p_after_state ->> 'learningSteps')::integer,
      repetitions = (p_after_state ->> 'repetitions')::integer,
      lapses = (p_after_state ->> 'lapses')::integer,
      last_reviewed_at = (p_after_state ->> 'lastReviewedAt')::timestamptz,
      scheduler_name = p_scheduler_name,
      scheduler_version = p_scheduler_version,
      parameters_version = p_parameters_version,
      scheduler_profile_id = p_scheduler_profile_id,
      scheduler_metadata = case
        when scheduler_name = 'legacy-sm2-v1'
          then scheduler_metadata || jsonb_build_object('migratedToFsrsAt', v_received_at)
        else scheduler_metadata
      end,
      schedule_revision = schedule_revision + 1,
      updated_at = v_received_at
  where id = p_card_id
    and user_id = p_user_id
    and schedule_revision = p_expected_schedule_revision
  returning * into v_updated;

  if not found then
    return jsonb_build_object('status', 'conflict');
  end if;

  v_result := jsonb_build_object(
    'status', 'accepted',
    'operationId', p_client_operation_id,
    'eventId', p_event_id,
    'syncCursor', v_cursor,
    'preview', p_preview,
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
    id,
    user_id,
    card_id,
    card_reference_id,
    session_id,
    client_operation_id,
    operation_fingerprint,
    request,
    device_id,
    event_kind,
    rating,
    reviewed_at,
    received_at,
    duration_ms,
    before_state,
    after_state,
    scheduler_name,
    scheduler_version,
    parameters_version,
    scheduler_profile_id,
    retrievability_before,
    next_interval_seconds,
    result
  ) values (
    p_event_id,
    p_user_id,
    p_card_id,
    p_card_id,
    p_session_id,
    p_client_operation_id,
    v_fingerprint,
    v_request,
    p_device_id,
    'review',
    p_rating,
    p_reviewed_at,
    v_received_at,
    p_duration_ms,
    p_before_state,
    p_after_state,
    p_scheduler_name,
    p_scheduler_version,
    p_parameters_version,
    p_scheduler_profile_id,
    p_retrievability_before,
    p_next_interval_seconds,
    v_result
  );

  insert into public.study_sync_changes (
    user_id,
    cursor,
    ordinal,
    entity_kind,
    entity_id,
    operation,
    revision,
    changed_at
  ) values (
    p_user_id,
    v_cursor,
    0,
    'card',
    p_card_id,
    'upsert',
    v_updated.schedule_revision,
    v_received_at
  );

  if p_session_id is not null then
    update public.study_session_cards
    set status = 'reviewed',
        review_event_id = p_event_id,
        updated_at = v_received_at
    where session_id = p_session_id
      and user_id = p_user_id
      and card_reference_id = p_card_id
      and status = 'pending';
  end if;

  return v_result;
end;
$$;

revoke all on function public.apply_study_review_v1(
  uuid, uuid, uuid, uuid, bigint, text, timestamptz, integer, uuid, uuid,
  jsonb, jsonb, jsonb, text, text, text, uuid, double precision, bigint
) from public, anon, authenticated;

grant execute on function public.apply_study_review_v1(
  uuid, uuid, uuid, uuid, bigint, text, timestamptz, integer, uuid, uuid,
  jsonb, jsonb, jsonb, text, text, text, uuid, double precision, bigint
) to service_role;
