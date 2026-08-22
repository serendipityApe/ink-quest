begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-audio', 'generated-audio', false, 15728640, array['audio/mpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
  v_node public.story_nodes%rowtype;
  v_state_snapshot jsonb;
  v_resume_tts boolean;
begin
  if length(trim(p_lease_owner)) < 3 then raise exception 'invalid_lease_owner'; end if;
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then raise exception 'invalid_lease_duration'; end if;

  select * into v_job from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'generation_job_not_found'; end if;
  if v_job.status in ('completed', 'partial_success', 'failed', 'canceled') then return null; end if;
  if v_job.status = 'running' and v_job.lease_expires_at > now() then return null; end if;
  if v_job.attempt >= v_job.max_attempts then raise exception 'generation_job_attempts_exhausted'; end if;

  v_resume_tts := v_job.stage in ('text_completed_tts_pending', 'tts_retry_scheduled', 'tts_lease_expired');

  update public.generation_jobs
  set status = 'running',
      stage = case when v_resume_tts then 'text_completed_tts_pending' else 'planning' end,
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
  values (p_job_id, 'generation.claimed', jsonb_build_object('attempt', v_job.attempt, 'resumeTts', v_resume_tts));

  select * into v_story from public.generated_stories where id = v_job.story_id;
  if v_resume_tts then
    select * into v_node from public.story_nodes where id = v_job.node_id;
  end if;

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
    'stage', v_job.stage,
    'attempt', v_job.attempt,
    'input', v_job.input,
    'targetLanguage', v_story.target_language,
    'learnerLevel', v_story.learner_level,
    'premise', v_story.premise,
    'storyTitle', v_story.title,
    'ttsMode', v_story.tts_mode,
    'ttsVoiceId', v_story.tts_voice_id,
    'storyVersion', v_story.story_version,
    'nodeVersion', v_node.node_version,
    'nodeText', v_node.text,
    'textSegments', v_node.text_segments,
    'stateSnapshot', coalesce(v_state_snapshot, '{}'::jsonb)
  );
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
  if p_choices is null or jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) <> 3 then raise exception 'invalid_story_choices'; end if;
  if p_prompt_version is null or length(trim(p_prompt_version)) = 0 then raise exception 'invalid_prompt_version'; end if;

  select * into v_job from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'generation_job_not_found'; end if;
  if v_job.status in ('completed', 'partial_success') or v_job.stage = 'text_completed_tts_pending' then
    return jsonb_build_object('storyId', v_job.story_id, 'nodeId', v_job.node_id, 'status', v_job.status, 'reused', true);
  end if;
  if v_job.status <> 'running' or v_job.lease_owner <> p_lease_owner then raise exception 'generation_job_lease_mismatch'; end if;
  if v_job.lease_expires_at <= now() then raise exception 'generation_job_lease_expired'; end if;

  select coalesce(sum((item ->> 'credits')::bigint), 0) into v_text_credits
  from public.credit_reservations reservation, jsonb_array_elements(reservation.items) item
  where reservation.id = v_job.reservation_id and item ->> 'code' = 'scene_text';
  if v_text_credits <= 0 then raise exception 'text_credit_line_item_missing'; end if;

  insert into public.story_nodes (
    story_id, parent_node_id, node_version, text, text_segments, summary, state_delta, status, created_by_job_id
  ) values (
    v_job.story_id, v_job.node_id, 1, p_text, p_text_segments, p_summary,
    coalesce(v_snapshot -> 'stateDelta', '{}'::jsonb),
    case when p_tts_deferred then 'text_ready' else 'ready' end,
    p_job_id
  ) returning id into v_node_id;

  insert into public.story_choices (node_id, label, intent, risk_hint, branch_seed)
  select v_node_id, choice.label, choice.intent, choice.risk_hint, coalesce(choice.branch_seed, '{}'::jsonb)
  from jsonb_to_recordset(p_choices) as choice(label text, intent text, risk_hint text, branch_seed jsonb);
  get diagnostics v_choice_count = row_count;
  if v_choice_count <> 3 then raise exception 'invalid_story_choices'; end if;

  insert into public.story_state_snapshots (
    story_id, node_id, world_bible, characters, relationships, timeline_summary, unresolved_threads, state_hash
  ) values (
    v_job.story_id, v_node_id,
    coalesce(v_snapshot -> 'worldBible', '[]'::jsonb),
    coalesce(v_snapshot -> 'characters', '[]'::jsonb),
    coalesce(v_snapshot -> 'relationships', '[]'::jsonb),
    coalesce(v_snapshot -> 'timelineSummary', '[]'::jsonb),
    coalesce(v_snapshot -> 'unresolvedThreads', '[]'::jsonb),
    encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex')
  );

  update public.generated_stories
  set title = nullif(trim(p_title), ''), current_node_id = v_node_id, status = 'active',
      story_version = story_version + 1, prompt_version = p_prompt_version, updated_at = now()
  where id = v_job.story_id;

  perform public.settle_credit_reservation_item(
    v_job.reservation_id, v_text_credits, 'scene_text',
    'settle:' || p_job_id::text || ':scene_text', coalesce(p_model_metadata, '{}'::jsonb)
  );

  update public.generation_jobs
  set node_id = v_node_id,
      status = case when p_tts_deferred then 'running' else 'completed' end,
      stage = case when p_tts_deferred then 'text_completed_tts_pending' else 'completed' end,
      lease_owner = case when p_tts_deferred then lease_owner else null end,
      lease_expires_at = case when p_tts_deferred then now() + interval '10 minutes' else null end,
      completed_at = case when p_tts_deferred then null else now() end,
      updated_at = now()
  where id = p_job_id;

  insert into public.generation_job_events (job_id, event_type, payload)
  values (p_job_id, 'generation.text_committed', jsonb_build_object('nodeId', v_node_id, 'ttsPending', p_tts_deferred));

  return jsonb_build_object(
    'storyId', v_job.story_id, 'nodeId', v_node_id,
    'status', case when p_tts_deferred then 'running' else 'completed' end,
    'ttsPending', p_tts_deferred, 'reused', false
  );
end;
$$;

create or replace function public.commit_generated_story_audio(
  p_job_id uuid,
  p_lease_owner text,
  p_provider text,
  p_voice_id text,
  p_object_key text,
  p_content_hash text,
  p_duration_ms integer,
  p_timestamps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_node public.story_nodes%rowtype;
  v_tts_credits bigint;
  v_audio_id uuid;
begin
  if length(trim(p_provider)) = 0 or length(trim(p_object_key)) = 0 or length(trim(p_content_hash)) < 16 then raise exception 'invalid_audio_metadata'; end if;
  if p_duration_ms <= 0 then raise exception 'invalid_audio_duration'; end if;
  if p_timestamps is null or jsonb_typeof(p_timestamps) <> 'array' then raise exception 'invalid_audio_timestamps'; end if;

  select * into v_job from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'generation_job_not_found'; end if;
  if v_job.status = 'completed' then
    select id into v_audio_id from public.audio_assets where created_by_job_id = p_job_id and status = 'ready' limit 1;
    return jsonb_build_object('storyId', v_job.story_id, 'nodeId', v_job.node_id, 'audioId', v_audio_id, 'reused', true);
  end if;
  if v_job.status <> 'running' or v_job.stage <> 'text_completed_tts_pending' or v_job.lease_owner <> p_lease_owner then raise exception 'generation_job_lease_mismatch'; end if;

  select * into v_node from public.story_nodes where id = v_job.node_id and story_id = v_job.story_id for update;
  if not found then raise exception 'generated_story_node_not_found'; end if;

  select coalesce(sum((item ->> 'credits')::bigint), 0) into v_tts_credits
  from public.credit_reservations reservation, jsonb_array_elements(reservation.items) item
  where reservation.id = v_job.reservation_id and item ->> 'code' = 'scene_tts';
  if v_tts_credits <= 0 then raise exception 'tts_credit_line_item_missing'; end if;

  insert into public.audio_assets (
    story_id, node_id, node_version, status, provider, voice_id, object_key,
    content_hash, duration_ms, timestamps, created_by_job_id, updated_at
  ) values (
    v_job.story_id, v_node.id, v_node.node_version, 'ready', p_provider, nullif(trim(p_voice_id), ''),
    p_object_key, p_content_hash, p_duration_ms, p_timestamps, p_job_id, now()
  )
  on conflict (node_id, node_version, content_hash) do update
  set status = 'ready', provider = excluded.provider, voice_id = excluded.voice_id,
      object_key = excluded.object_key, duration_ms = excluded.duration_ms,
      timestamps = excluded.timestamps, created_by_job_id = excluded.created_by_job_id, updated_at = now()
  returning id into v_audio_id;

  update public.story_nodes set status = 'ready', updated_at = now() where id = v_node.id;
  perform public.settle_credit_reservation_item(
    v_job.reservation_id, v_tts_credits, 'scene_tts',
    'settle:' || p_job_id::text || ':scene_tts',
    jsonb_build_object('provider', p_provider, 'duration_ms', p_duration_ms)
  );

  update public.generation_jobs
  set status = 'completed', stage = 'completed', lease_owner = null, lease_expires_at = null,
      completed_at = now(), updated_at = now()
  where id = p_job_id;

  insert into public.generation_job_events (job_id, event_type, payload)
  values (p_job_id, 'generation.audio_committed', jsonb_build_object('nodeId', v_node.id, 'audioId', v_audio_id));

  return jsonb_build_object('storyId', v_job.story_id, 'nodeId', v_node.id, 'audioId', v_audio_id, 'reused', false);
end;
$$;

create or replace function public.record_generated_story_tts_failure(
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
  select * into v_job from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'generation_job_not_found'; end if;
  if v_job.status in ('completed', 'partial_success', 'failed', 'canceled') then return v_job.status; end if;
  if v_job.lease_owner <> p_lease_owner then raise exception 'generation_job_lease_mismatch'; end if;

  v_retry := p_retryable and v_job.attempt < v_job.max_attempts;
  update public.generation_jobs
  set status = case when v_retry then 'queued' else 'partial_success' end,
      stage = case when v_retry then 'tts_retry_scheduled' else 'text_completed_tts_failed' end,
      lease_owner = null, lease_expires_at = null,
      error_code = left(p_error_code, 100), error_message_safe = left(p_error_message_safe, 500),
      completed_at = case when v_retry then null else now() end, updated_at = now()
  where id = p_job_id;

  insert into public.generation_job_events (job_id, event_type, payload)
  values (
    p_job_id,
    case when v_retry then 'generation.tts_retry_scheduled' else 'generation.tts_failed' end,
    jsonb_build_object('errorCode', left(p_error_code, 100), 'attempt', v_job.attempt)
  );

  if v_retry then
    insert into public.job_outbox (job_id, status, next_attempt_at)
    values (p_job_id, 'pending', now() + interval '30 seconds')
    on conflict (job_id) do update
    set status = 'pending', next_attempt_at = excluded.next_attempt_at, published_at = null;
    return 'queued';
  end if;

  update public.story_nodes set status = 'ready', updated_at = now() where id = v_job.node_id;
  perform public.release_credit_reservation(
    v_job.reservation_id, 'tts_generation_failed', 'release:' || p_job_id::text || ':tts_failure'
  );
  return 'partial_success';
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
  v_tts_stage boolean;
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
    v_tts_stage := v_job.stage = 'text_completed_tts_pending';
    if v_job.attempt < v_job.max_attempts then
      update public.generation_jobs
      set status = 'queued',
          stage = case when v_tts_stage then 'tts_lease_expired' else 'lease_expired' end,
          lease_owner = null, lease_expires_at = null, updated_at = now()
      where id = v_job.id;

      insert into public.job_outbox (job_id, status, next_attempt_at)
      values (v_job.id, 'pending', now())
      on conflict (job_id) do update
      set status = 'pending', next_attempt_at = now(), published_at = null;
    elsif v_tts_stage then
      update public.generation_jobs
      set status = 'partial_success', stage = 'text_completed_tts_failed',
          lease_owner = null, lease_expires_at = null, error_code = 'tts_lease_expired',
          error_message_safe = 'Narration stopped before completion.',
          completed_at = now(), updated_at = now()
      where id = v_job.id;
      update public.story_nodes set status = 'ready', updated_at = now() where id = v_job.node_id;
      perform public.release_credit_reservation(
        v_job.reservation_id, 'tts_generation_lease_expired', 'release:' || v_job.id::text || ':tts_lease_expired'
      );
    else
      update public.generation_jobs
      set status = 'failed', stage = 'lease_expired', lease_owner = null,
          lease_expires_at = null, error_code = 'lease_expired',
          error_message_safe = 'Story generation stopped before completion.',
          completed_at = now(), updated_at = now()
      where id = v_job.id;
      update public.generated_stories set status = 'failed', updated_at = now() where id = v_job.story_id;
      perform public.release_credit_reservation(
        v_job.reservation_id, 'generation_lease_expired', 'release:' || v_job.id::text || ':lease_expired'
      );
    end if;

    insert into public.generation_job_events (job_id, event_type, payload)
    values (v_job.id, 'generation.lease_expired', jsonb_build_object('attempt', v_job.attempt, 'ttsStage', v_tts_stage));
    v_recovered := v_recovered + 1;
  end loop;

  return v_recovered;
end;
$$;

revoke all on function public.commit_generated_story_audio(uuid, text, text, text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.record_generated_story_tts_failure(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.commit_generated_story_audio(uuid, text, text, text, text, text, integer, jsonb) to service_role;
grant execute on function public.record_generated_story_tts_failure(uuid, text, text, text, boolean) to service_role;

commit;
