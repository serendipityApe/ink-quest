-- PREPARED ONLY: do not apply or activate recovery until the existing backlog
-- decision and dictionary-capacity/credential approvals have been recorded.
begin;

create table public.generation_dictionary_versions (
  version text primary key,
  ready boolean not null default false,
  expected_rows bigint not null check (expected_rows > 0),
  sources jsonb not null check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now()
);
create table public.generation_dictionary_entries (
  version text not null references public.generation_dictionary_versions(version),
  language text not null check (language in ('zh','en')),
  word text not null check (length(word) between 1 and 256),
  reading text,
  candidates jsonb not null check (jsonb_typeof(candidates) = 'array'),
  level text,
  primary key (version, language, word)
);
create table public.generation_edge_state (
  job_id uuid primary key references public.generation_jobs(id) on delete cascade,
  phase text not null check (phase in ('plan','write','enrich','gloss','commit','audio','done')),
  outputs jsonb not null default '{}'::jsonb,
  epoch bigint not null default 0,
  in_flight boolean not null default false,
  revision bigint not null default 0,
  next_attempt_at timestamptz not null default now()
);
alter table public.generation_dictionary_versions enable row level security;
alter table public.generation_dictionary_entries enable row level security;
alter table public.generation_edge_state enable row level security;
revoke all on public.generation_dictionary_versions, public.generation_dictionary_entries, public.generation_edge_state from public, anon, authenticated;
grant all on public.generation_dictionary_versions, public.generation_dictionary_entries, public.generation_edge_state to service_role;

create function public.lookup_generation_dictionary(p_language text, p_words text[], p_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ready boolean;
begin
  if p_language not in ('zh','en') or cardinality(p_words) > 100 then raise exception 'invalid_dictionary_request'; end if;
  select ready into v_ready from public.generation_dictionary_versions where version = p_version;
  return jsonb_build_object('version',p_version,'ready',coalesce(v_ready,false),'entries',
    coalesce((select jsonb_agg(jsonb_build_object('word',word,'reading',reading,'candidates',candidates,'level',level))
      from public.generation_dictionary_entries where version=p_version and language=p_language and word=any(p_words)), '[]'::jsonb));
end $$;

-- Import completion must be checked explicitly; no empty dictionary is ready.
create function public.verify_generation_dictionary(p_version text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_expected bigint; v_actual bigint;
begin
  select expected_rows into v_expected from public.generation_dictionary_versions where version=p_version for update;
  if not found then raise exception 'dictionary_version_not_found'; end if;
  select count(*) into v_actual from public.generation_dictionary_entries where version=p_version;
  if v_actual <> v_expected then raise exception 'dictionary_import_incomplete'; end if;
  if not exists(select 1 from public.generation_dictionary_entries where version=p_version and language='zh')
    or not exists(select 1 from public.generation_dictionary_entries where version=p_version and language='en') then
    raise exception 'dictionary_language_missing';
  end if;
  update public.generation_dictionary_versions set ready=true where version=p_version;
  return true;
end $$;

create function public.edge_fence(p_job_id uuid, p_owner text, p_epoch bigint)
returns public.generation_edge_state language plpgsql security definer set search_path = public as $$
declare v_job public.generation_jobs%rowtype; v_state public.generation_edge_state%rowtype;
begin
  select * into v_job from public.generation_jobs where id=p_job_id for update;
  select * into v_state from public.generation_edge_state where job_id=p_job_id for update;
  if v_job.status is distinct from 'running' or v_job.lease_owner is distinct from p_owner
    or v_state.epoch is distinct from p_epoch or v_job.lease_expires_at is null or v_job.lease_expires_at <= now() then
    raise exception 'generation_lease_fenced';
  end if;
  if not exists(select 1 from public.credit_reservations where id=v_job.reservation_id
    and status in ('reserved','partially_settled') and expires_at>now()) then raise exception 'generation_reservation_inactive'; end if;
  return v_state;
end $$;

create function public.edge_wake_generation_job(p_job_id uuid, p_delay_seconds integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_revision bigint;
begin
  update public.generation_edge_state set revision=revision+1,
    next_attempt_at=now()+make_interval(secs=>p_delay_seconds) where job_id=p_job_id returning revision into v_revision;
  insert into public.job_outbox(job_id,status,next_attempt_at) values(p_job_id,'pending',now()+make_interval(secs=>p_delay_seconds))
  on conflict(job_id) do update set status='pending',published_at=null,next_attempt_at=excluded.next_attempt_at;
  return jsonb_build_object('jobId',p_job_id,'revision',v_revision);
end $$;

-- Internal helper: caller holds the job lock. Only unconsumed credit is released.
create function public.edge_abort_generation_job(p_job_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner text := 'edge-recovery:' || gen_random_uuid()::text; v_has_text boolean;
begin
  select exists(select 1 from public.story_nodes where created_by_job_id=p_job_id) into v_has_text;
  update public.generation_jobs set status='running',lease_owner=v_owner,lease_expires_at=now()+interval '150 seconds' where id=p_job_id;
  if v_has_text then
    perform public.record_generated_story_tts_failure(p_job_id,v_owner,p_code,'Narration stopped; completed story text is preserved.',false);
  else
    perform public.record_generation_job_failure(p_job_id,v_owner,p_code,'Story generation stopped before completion.',false);
  end if;
  update public.generation_edge_state set phase='done',in_flight=false,outputs='{}' where job_id=p_job_id;
  update public.job_outbox set status='published',published_at=now() where job_id=p_job_id;
end $$;

create function public.edge_claim_generation_job(p_job_id uuid, p_owner text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_job public.generation_jobs%rowtype; v_story public.generated_stories%rowtype;
  v_state public.generation_edge_state%rowtype; v_node public.story_nodes%rowtype;
  v_snapshot jsonb; v_reservation public.credit_reservations%rowtype;
begin
  if length(trim(p_owner)) < 8 then raise exception 'invalid_lease_owner'; end if;
  select * into v_job from public.generation_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('kind','missing'); end if;
  if v_job.status in ('completed','partial_success','failed','canceled') then return jsonb_build_object('kind','terminal'); end if;
  select * into v_reservation from public.credit_reservations where id=v_job.reservation_id for update;
  if v_reservation.status not in ('reserved','partially_settled') or v_reservation.expires_at<=now() then
    perform public.edge_abort_generation_job(p_job_id,'generation_deadline_expired');
    return jsonb_build_object('kind','terminal');
  end if;
  if v_job.status='running' and v_job.lease_expires_at>now() then
    return jsonb_build_object('kind','busy','retryAfterSeconds',ceil(extract(epoch from v_job.lease_expires_at-now())));
  end if;
  insert into public.generation_edge_state(job_id,phase) values(p_job_id,
    case when v_job.stage in ('text_completed_tts_pending','tts_retry_scheduled','tts_lease_expired') then 'audio'
      when v_job.job_type='opening' then 'plan' else 'write' end) on conflict do nothing;
  select * into v_state from public.generation_edge_state where job_id=p_job_id for update;
  if v_state.next_attempt_at>now() then
    return jsonb_build_object('kind','busy','retryAfterSeconds',ceil(extract(epoch from v_state.next_attempt_at-now())));
  end if;
  if v_job.attempt>=v_job.max_attempts and v_job.error_code is not null then
    perform public.edge_abort_generation_job(p_job_id,'generation_attempts_exhausted');
    return jsonb_build_object('kind','terminal');
  end if;
  update public.generation_edge_state set epoch=epoch+1 where job_id=p_job_id returning * into v_state;
  update public.generation_jobs set status='running',
    stage=case when v_state.phase='audio' then 'text_completed_tts_pending' else 'edge_'||v_state.phase end,
    attempt=case when attempt=0 or error_code is not null then attempt+1 else attempt end,
    lease_owner=p_owner,lease_expires_at=now()+interval '150 seconds',started_at=coalesce(started_at,now()),
    error_code=null,error_message_safe=null,updated_at=now() where id=p_job_id returning * into v_job;
  select * into v_story from public.generated_stories where id=v_job.story_id;
  if v_state.phase='audio' then select * into v_node from public.story_nodes where id=v_job.node_id; end if;
  select jsonb_build_object('worldBible',world_bible,'characters',characters,'relationships',relationships,
    'timelineSummary',timeline_summary,'unresolvedThreads',unresolved_threads) into v_snapshot
    from public.story_state_snapshots where story_id=v_job.story_id order by created_at desc limit 1;
  return jsonb_build_object('kind','claimed','lease',jsonb_build_object(
    'owner',p_owner,'epoch',v_state.epoch,'phase',v_state.phase,'outputs',v_state.outputs,'ambiguous',v_state.in_flight,
    'job',jsonb_build_object('jobId',v_job.id,'userId',v_job.user_id,'storyId',v_job.story_id,'nodeId',v_job.node_id,
      'reservationId',v_job.reservation_id,'jobType',v_job.job_type,'stage',v_job.stage,'attempt',v_job.attempt,'input',v_job.input,
      'targetLanguage',v_story.target_language,'learnerLevel',v_story.learner_level,'premise',v_story.premise,'storyTitle',v_story.title,
      'ttsMode',v_story.tts_mode,'ttsVoiceId',v_story.tts_voice_id,'storyVersion',v_story.story_version,
      'nodeVersion',v_node.node_version,'nodeText',v_node.text,'textSegments',v_node.text_segments,'stateSnapshot',coalesce(v_snapshot,'{}'))));
end $$;

create function public.edge_begin_generation_stage(p_job_id uuid,p_owner text,p_epoch bigint)
returns void language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype;
begin
  v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
  if v_state.in_flight then raise exception 'upstream_attempt_already_started'; end if;
  update public.generation_edge_state set in_flight=true where job_id=p_job_id;
end $$;

create function public.edge_checkpoint_generation_stage(p_job_id uuid,p_owner text,p_epoch bigint,p_next text,p_output jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype;
begin
  v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
  if (v_state.phase||':'||p_next) not in ('plan:write','write:enrich','enrich:gloss','gloss:commit') then raise exception 'invalid_stage_transition'; end if;
  if jsonb_typeof(p_output)<>'object' or octet_length((v_state.outputs||p_output)::text)>1000000 then raise exception 'invalid_checkpoint_size'; end if;
  update public.generation_edge_state set outputs=outputs||p_output,phase=p_next,in_flight=false where job_id=p_job_id;
  update public.generation_jobs set status='queued',stage='edge_'||p_next,lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_job_id;
  return public.edge_wake_generation_job(p_job_id);
end $$;

create function public.edge_commit_generated_text(p_job_id uuid,p_owner text,p_epoch bigint,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype; v_result jsonb; v_tts boolean;
begin
  v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
  if v_state.phase<>'commit' then raise exception 'invalid_generation_phase'; end if;
  v_tts:=(p_input->>'ttsDeferred')::boolean;
  v_result:=public.commit_generated_story_text(p_job_id,p_owner,p_input->>'title',p_input->>'text',p_input->'textSegments',
    p_input->'choices',p_input->>'summary',p_input->'stateSnapshot',p_input->>'promptVersion',p_input->'modelMetadata',v_tts);
  update public.generation_edge_state set phase=case when v_tts then 'audio' else 'done' end,in_flight=false,outputs='{}' where job_id=p_job_id;
  if v_tts then
    update public.generation_jobs set status='queued',stage='tts_retry_scheduled',lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_job_id;
    return public.edge_wake_generation_job(p_job_id);
  end if;
  update public.job_outbox set status='published',published_at=now() where job_id=p_job_id;
  return null;
end $$;

create function public.edge_commit_generated_audio(p_job_id uuid,p_owner text,p_epoch bigint,p_input jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype;
begin
  v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
  if v_state.phase<>'audio' then raise exception 'invalid_generation_phase'; end if;
  perform public.commit_generated_story_audio(p_job_id,p_owner,p_input->>'provider',p_input->>'voiceId',p_input->>'objectKey',
    p_input->>'contentHash',(p_input->>'durationMs')::integer,p_input->'timestamps');
  update public.generation_edge_state set phase='done',in_flight=false,outputs='{}' where job_id=p_job_id;
  update public.job_outbox set status='published',published_at=now() where job_id=p_job_id;
end $$;

create function public.edge_fail_generation_stage(p_job_id uuid,p_owner text,p_epoch bigint,p_code text,p_retryable boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype; v_status text;
begin
  v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
  if v_state.phase='audio' then
    v_status:=public.record_generated_story_tts_failure(p_job_id,p_owner,p_code,'Narration could not be completed.',p_retryable);
  else
    v_status:=public.record_generation_job_failure(p_job_id,p_owner,p_code,'Story generation could not be completed.',p_retryable);
  end if;
  update public.generation_edge_state set in_flight=false,phase=case when v_status='queued' then phase else 'done' end,
    outputs=case when v_status='queued' then outputs else '{}'::jsonb end where job_id=p_job_id;
  if v_status='queued' then return public.edge_wake_generation_job(p_job_id,30); end if;
  update public.job_outbox set status='published',published_at=now() where job_id=p_job_id;
  return null;
end $$;

create function public.edge_pending_generation_jobs()
returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('jobId',q.job_id,'revision',q.revision)),'[]'::jsonb) from (
    select o.job_id,coalesce(s.revision,0) revision from public.job_outbox o
    join public.generation_jobs j on j.id=o.job_id left join public.generation_edge_state s on s.job_id=j.id
    where o.status='pending' and o.next_attempt_at<=now() and j.status='queued'
    order by o.next_attempt_at limit 5
  ) q;
$$;
create function public.edge_mark_generation_published(p_job_id uuid,p_revision bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
  -- Lock job first, like claim/checkpoint/recovery, to avoid reverse lock order.
  perform 1 from public.generation_jobs where id=p_job_id for update;
  update public.job_outbox set status='published',published_at=now(),attempts=attempts+1
  where job_id=p_job_id and status='pending' and p_revision=coalesce((select revision from public.generation_edge_state where job_id=p_job_id),0);
end $$;

create function public.edge_recover_generation_jobs()
returns void language plpgsql security definer set search_path=public as $$
declare v_job public.generation_jobs%rowtype; v_state public.generation_edge_state%rowtype; v_res public.credit_reservations%rowtype;
begin
  for v_job in select j.* from public.generation_jobs j join public.credit_reservations r on r.id=j.reservation_id
    where j.status in ('queued','running') and
      (r.expires_at<=now() or r.status not in ('reserved','partially_settled') or
       (j.status='running' and (j.lease_expires_at is null or j.lease_expires_at<=now())) or
       (j.status='queued' and j.updated_at<now()-interval '5 minutes'))
    order by j.updated_at limit 25 for update of j skip locked
  loop
    select * into v_res from public.credit_reservations where id=v_job.reservation_id for update;
    select * into v_state from public.generation_edge_state where job_id=v_job.id for update;
    if v_res.expires_at<=now() or v_res.status not in ('reserved','partially_settled') then
      perform public.edge_abort_generation_job(v_job.id,'generation_deadline_expired');
    elsif coalesce(v_state.in_flight,false) then
      perform public.edge_abort_generation_job(v_job.id,'upstream_outcome_unknown');
    elsif v_job.attempt>=v_job.max_attempts and v_job.error_code is not null then
      perform public.edge_abort_generation_job(v_job.id,'generation_attempts_exhausted');
    else
      insert into public.generation_edge_state(job_id,phase) values(v_job.id,
        case when v_job.stage in ('text_completed_tts_pending','tts_retry_scheduled','tts_lease_expired') then 'audio'
          when v_job.job_type='opening' then 'plan' else 'write' end) on conflict do nothing;
      update public.generation_jobs set status='queued',lease_owner=null,lease_expires_at=null,updated_at=now() where id=v_job.id;
      perform public.edge_wake_generation_job(v_job.id);
    end if;
  end loop;
end $$;

-- Every helper is private, including helpers used only by security-definer RPCs.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('lookup_generation_dictionary','verify_generation_dictionary',
      'edge_fence','edge_wake_generation_job','edge_abort_generation_job','edge_claim_generation_job',
      'edge_begin_generation_stage','edge_checkpoint_generation_stage','edge_commit_generated_text',
      'edge_commit_generated_audio','edge_fail_generation_stage','edge_pending_generation_jobs',
      'edge_mark_generation_published','edge_recover_generation_jobs')
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    if f.signature::text not like 'edge_fence(%' and f.signature::text not like 'edge_wake_generation_job(%'
      and f.signature::text not like 'edge_abort_generation_job(%' then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end $$;
commit;
