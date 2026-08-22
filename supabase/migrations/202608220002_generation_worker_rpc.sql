begin;

alter table public.generation_jobs add column if not exists lease_owner text;
alter table public.generation_jobs add column if not exists started_at timestamptz;
alter table public.generation_jobs add column if not exists completed_at timestamptz;

alter table public.job_outbox enable row level security;

create or replace function public.claim_generation_job(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_story public.generated_stories%rowtype;
  v_state_snapshot jsonb;
begin
  if length(trim(p_lease_owner)) < 3 then raise exception 'invalid_lease_owner'; end if;
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then raise exception 'invalid_lease_duration'; end if;

  select * into v_job
  from public.generation_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'generation_job_not_found'; end if;
  if v_job.status in ('completed', 'partial_success', 'failed', 'canceled') then return null; end if;
  if v_job.status = 'running' and v_job.lease_expires_at > now() then return null; end if;
  if v_job.attempt >= v_job.max_attempts then raise exception 'generation_job_attempts_exhausted'; end if;

  update public.generation_jobs
  set status = 'running',
      stage = 'planning',
      attempt = attempt + 1,
      lease_owner = p_lease_owner,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      started_at = coalesce(started_at, now()),
      error_code = null,
      error_message_safe = null,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  update public.job_outbox
  set status = 'published', published_at = now(), attempts = attempts + 1
  where job_id = p_job_id;

  insert into public.generation_job_events (job_id, event_type, payload)
  values (p_job_id, 'generation.claimed', jsonb_build_object('attempt', v_job.attempt));

  select * into v_story from public.generated_stories where id = v_job.story_id;
  select jsonb_build_object(
    'worldBible', snapshot.world_bible,
    'characters', snapshot.characters,
    'relationships', snapshot.relationships,
    'timelineSummary', snapshot.timeline_summary,
    'unresolvedThreads', snapshot.unresolved_threads
  ) into v_state_snapshot
  from public.story_state_snapshots snapshot
  where snapshot.story_id = v_job.story_id
  order by snapshot.created_at desc
  limit 1;

  return jsonb_build_object(
    'jobId', v_job.id,
    'userId', v_job.user_id,
    'storyId', v_job.story_id,
    'nodeId', v_job.node_id,
    'reservationId', v_job.reservation_id,
    'jobType', v_job.job_type,
    'attempt', v_job.attempt,
    'input', v_job.input,
    'targetLanguage', v_story.target_language,
    'learnerLevel', v_story.learner_level,
    'premise', v_story.premise,
    'storyTitle', v_story.title,
    'ttsMode', v_story.tts_mode,
    'storyVersion', v_story.story_version,
    'stateSnapshot', coalesce(v_state_snapshot, '{}'::jsonb)
  );
end;
$$;

create or replace function public.create_story_branch_job(
  p_user_id uuid,
  p_story_id uuid,
  p_choice_id uuid,
  p_quoted_amount bigint,
  p_pricing_version text,
  p_idempotency_key text,
  p_items jsonb,
  p_input jsonb default '{}'::jsonb
)
returns table (story_id uuid, job_id uuid, reservation_id uuid, reused boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_story public.generated_stories%rowtype;
  v_choice public.story_choices%rowtype;
  v_choice_node_id uuid;
  v_available bigint;
  v_job_id uuid;
  v_reservation_id uuid;
begin
  if p_quoted_amount <= 0 then raise exception 'invalid_quote'; end if;
  if length(trim(p_idempotency_key)) < 8 then raise exception 'invalid_idempotency_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));

  select j.story_id, j.id, j.reservation_id
  into story_id, job_id, reservation_id
  from public.generation_jobs j
  where j.user_id = p_user_id and j.idempotency_key = p_idempotency_key;
  if found then
    reused := true;
    return next;
    return;
  end if;

  select * into v_story from public.generated_stories
  where id = p_story_id and owner_id = p_user_id
  for update;
  if not found then raise exception 'generated_story_not_found'; end if;
  if v_story.current_node_id is null then raise exception 'story_has_no_current_node'; end if;

  select choice.* into v_choice
  from public.story_choices choice
  where choice.id = p_choice_id
    and exists (
      select 1 from public.story_nodes node
      where node.id = choice.node_id and node.story_id = p_story_id
    )
  for update;
  v_choice_node_id := v_choice.node_id;
  if not found or v_choice_node_id <> v_story.current_node_id then raise exception 'invalid_story_choice'; end if;
  if exists (
    select 1 from public.story_choices
    where node_id = v_story.current_node_id and selected_at is not null
  ) then raise exception 'story_choice_already_selected'; end if;

  insert into public.credit_accounts (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  select available into v_available from public.credit_accounts where user_id = p_user_id for update;
  if v_available < p_quoted_amount then raise exception 'insufficient_credits'; end if;

  insert into public.credit_reservations (
    user_id, status, quoted_amount, pricing_version, items, idempotency_key, expires_at
  ) values (
    p_user_id, 'reserved', p_quoted_amount, p_pricing_version, p_items,
    p_idempotency_key, now() + interval '30 minutes'
  ) returning id into v_reservation_id;

  update public.credit_accounts
  set available = available - p_quoted_amount,
      reserved = reserved + p_quoted_amount,
      version = version + 1,
      updated_at = now()
  where user_id = p_user_id
  returning available into v_available;

  insert into public.credit_ledger (
    user_id, reservation_id, entry_type, amount, balance_after,
    source_type, source_id, idempotency_key, metadata
  ) values (
    p_user_id, v_reservation_id, 'reserve', -p_quoted_amount, v_available,
    'generation', v_reservation_id::text, 'reserve:' || v_reservation_id::text,
    jsonb_build_object('pricing_version', p_pricing_version, 'items', p_items)
  );

  update public.story_choices set selected_at = now() where id = p_choice_id;
  update public.generated_stories set status = 'generating', updated_at = now() where id = p_story_id;

  insert into public.generation_jobs (
    user_id, story_id, node_id, job_type, status, stage,
    reservation_id, idempotency_key, input
  ) values (
    p_user_id, p_story_id, v_story.current_node_id, 'scene', 'queued', 'queued',
    v_reservation_id, p_idempotency_key,
    coalesce(p_input, '{}'::jsonb) || jsonb_build_object(
      'selectedChoice', jsonb_build_object(
        'id', v_choice.id,
        'label', v_choice.label,
        'intent', v_choice.intent,
        'branchSeed', v_choice.branch_seed
      )
    )
  ) returning id into v_job_id;

  insert into public.job_outbox (job_id) values (v_job_id);
  insert into public.generation_job_events (job_id, event_type, payload)
  values (v_job_id, 'generation.reserved', jsonb_build_object('choiceId', p_choice_id));

  story_id := p_story_id;
  job_id := v_job_id;
  reservation_id := v_reservation_id;
  reused := false;
  return next;
end;
$$;

create or replace function public.commit_generated_story_text(
  p_job_id uuid,
  p_lease_owner text,
  p_title text,
  p_text text,
  p_text_segments jsonb,
  p_choices jsonb,
  p_summary text,
  p_state_snapshot jsonb,
  p_prompt_version text,
  p_model_metadata jsonb default '{}'::jsonb,
  p_tts_deferred boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_node_id uuid;
  v_text_credits bigint;
  v_choice_count integer;
  v_snapshot jsonb := coalesce(p_state_snapshot, '{}'::jsonb);
begin
  if p_text is null or length(trim(p_text)) < 20 then raise exception 'generated_text_too_short'; end if;
  if p_text_segments is null or jsonb_typeof(p_text_segments) <> 'array' then raise exception 'invalid_text_segments'; end if;
  if p_choices is null or jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) <> 3 then
    raise exception 'invalid_story_choices';
  end if;
  if p_prompt_version is null or length(trim(p_prompt_version)) = 0 then raise exception 'invalid_prompt_version'; end if;

  select * into v_job
  from public.generation_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'generation_job_not_found'; end if;
  if v_job.status in ('completed', 'partial_success') then
    return jsonb_build_object('storyId', v_job.story_id, 'nodeId', v_job.node_id, 'reused', true);
  end if;
  if v_job.status <> 'running' or v_job.lease_owner <> p_lease_owner then
    raise exception 'generation_job_lease_mismatch';
  end if;
  if v_job.lease_expires_at <= now() then raise exception 'generation_job_lease_expired'; end if;

  select coalesce(sum((item ->> 'credits')::bigint), 0) into v_text_credits
  from public.credit_reservations reservation,
       jsonb_array_elements(reservation.items) item
  where reservation.id = v_job.reservation_id and item ->> 'code' = 'scene_text';

  if v_text_credits <= 0 then raise exception 'text_credit_line_item_missing'; end if;

  insert into public.story_nodes (
    story_id, parent_node_id, node_version, text, text_segments, summary, state_delta,
    status, created_by_job_id
  ) values (
    v_job.story_id, v_job.node_id, 1, p_text, p_text_segments, p_summary,
    coalesce(v_snapshot -> 'stateDelta', '{}'::jsonb), 'ready', p_job_id
  ) returning id into v_node_id;

  insert into public.story_choices (node_id, label, intent, risk_hint, branch_seed)
  select v_node_id, choice.label, choice.intent, choice.risk_hint, coalesce(choice.branch_seed, '{}'::jsonb)
  from jsonb_to_recordset(p_choices) as choice(
    label text,
    intent text,
    risk_hint text,
    branch_seed jsonb
  );
  get diagnostics v_choice_count = row_count;
  if v_choice_count <> 3 then raise exception 'invalid_story_choices'; end if;

  insert into public.story_state_snapshots (
    story_id, node_id, world_bible, characters, relationships, timeline_summary,
    unresolved_threads, state_hash
  ) values (
    v_job.story_id,
    v_node_id,
    coalesce(v_snapshot -> 'worldBible', '[]'::jsonb),
    coalesce(v_snapshot -> 'characters', '[]'::jsonb),
    coalesce(v_snapshot -> 'relationships', '[]'::jsonb),
    coalesce(v_snapshot -> 'timelineSummary', '[]'::jsonb),
    coalesce(v_snapshot -> 'unresolvedThreads', '[]'::jsonb),
    encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex')
  );

  update public.generated_stories
  set title = nullif(trim(p_title), ''),
      current_node_id = v_node_id,
      status = 'active',
      story_version = story_version + 1,
      prompt_version = p_prompt_version,
      updated_at = now()
  where id = v_job.story_id;

  perform public.settle_credit_reservation_item(
    v_job.reservation_id,
    v_text_credits,
    'scene_text',
    'settle:' || p_job_id::text || ':scene_text',
    coalesce(p_model_metadata, '{}'::jsonb)
  );

  if p_tts_deferred then
    perform public.release_credit_reservation(
      v_job.reservation_id,
      'tts_deferred_until_phase_d',
      'release:' || p_job_id::text || ':tts_deferred'
    );
  end if;

  update public.generation_jobs
  set node_id = v_node_id,
      status = case when p_tts_deferred then 'partial_success' else 'completed' end,
      stage = case when p_tts_deferred then 'text_completed_tts_deferred' else 'completed' end,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = now(),
      updated_at = now()
  where id = p_job_id;

  insert into public.generation_job_events (job_id, event_type, payload)
  values (
    p_job_id,
    'generation.committed',
    jsonb_build_object('nodeId', v_node_id, 'ttsDeferred', p_tts_deferred)
  );

  return jsonb_build_object(
    'storyId', v_job.story_id,
    'nodeId', v_node_id,
    'status', case when p_tts_deferred then 'partial_success' else 'completed' end,
    'reused', false
  );
end;
$$;

create or replace function public.record_generation_job_failure(
  p_job_id uuid,
  p_lease_owner text,
  p_error_code text,
  p_error_message_safe text,
  p_retryable boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_retry boolean;
begin
  select * into v_job
  from public.generation_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'generation_job_not_found'; end if;
  if v_job.status in ('completed', 'partial_success', 'failed', 'canceled') then return v_job.status; end if;
  if v_job.lease_owner <> p_lease_owner then raise exception 'generation_job_lease_mismatch'; end if;

  v_retry := p_retryable and v_job.attempt < v_job.max_attempts;

  update public.generation_jobs
  set status = case when v_retry then 'queued' else 'failed' end,
      stage = case when v_retry then 'retry_scheduled' else 'failed' end,
      lease_owner = null,
      lease_expires_at = null,
      error_code = left(p_error_code, 100),
      error_message_safe = left(p_error_message_safe, 500),
      completed_at = case when v_retry then null else now() end,
      updated_at = now()
  where id = p_job_id;

  insert into public.generation_job_events (job_id, event_type, payload)
  values (
    p_job_id,
    case when v_retry then 'generation.retry_scheduled' else 'generation.failed' end,
    jsonb_build_object('errorCode', left(p_error_code, 100), 'attempt', v_job.attempt)
  );

  if v_retry then
    insert into public.job_outbox (job_id, status, next_attempt_at)
    values (p_job_id, 'pending', now() + interval '30 seconds')
    on conflict (job_id) do update
    set status = 'pending', next_attempt_at = excluded.next_attempt_at, published_at = null;
    return 'queued';
  end if;

  update public.generated_stories set status = 'failed', updated_at = now() where id = v_job.story_id;
  perform public.release_credit_reservation(
    v_job.reservation_id,
    'generation_failed',
    'release:' || p_job_id::text || ':terminal_failure'
  );
  return 'failed';
end;
$$;

create or replace function public.recover_expired_generation_jobs(p_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_recovered integer := 0;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid_recovery_limit'; end if;

  for v_job in
    select * from public.generation_jobs
    where status = 'running' and lease_expires_at <= now()
    order by lease_expires_at
    limit p_limit
    for update skip locked
  loop
    if v_job.attempt < v_job.max_attempts then
      update public.generation_jobs
      set status = 'queued', stage = 'lease_expired', lease_owner = null,
          lease_expires_at = null, updated_at = now()
      where id = v_job.id;

      insert into public.job_outbox (job_id, status, next_attempt_at)
      values (v_job.id, 'pending', now())
      on conflict (job_id) do update
      set status = 'pending', next_attempt_at = now(), published_at = null;
    else
      update public.generation_jobs
      set status = 'failed', stage = 'lease_expired', lease_owner = null,
          lease_expires_at = null, error_code = 'lease_expired',
          error_message_safe = 'Story generation stopped before completion.',
          completed_at = now(), updated_at = now()
      where id = v_job.id;
      update public.generated_stories set status = 'failed', updated_at = now() where id = v_job.story_id;
      perform public.release_credit_reservation(
        v_job.reservation_id,
        'generation_lease_expired',
        'release:' || v_job.id::text || ':lease_expired'
      );
    end if;

    insert into public.generation_job_events (job_id, event_type, payload)
    values (v_job.id, 'generation.lease_expired', jsonb_build_object('attempt', v_job.attempt));
    v_recovered := v_recovered + 1;
  end loop;

  return v_recovered;
end;
$$;

revoke all on function public.claim_generation_job(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.create_story_branch_job(uuid, uuid, uuid, bigint, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.commit_generated_story_text(uuid, text, text, text, jsonb, jsonb, text, jsonb, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.record_generation_job_failure(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.recover_expired_generation_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_generation_job(uuid, text, integer) to service_role;
grant execute on function public.create_story_branch_job(uuid, uuid, uuid, bigint, text, text, jsonb, jsonb) to service_role;
grant execute on function public.commit_generated_story_text(uuid, text, text, text, jsonb, jsonb, text, jsonb, text, jsonb, boolean) to service_role;
grant execute on function public.record_generation_job_failure(uuid, text, text, text, boolean) to service_role;
grant execute on function public.recover_expired_generation_jobs(integer) to service_role;

commit;
