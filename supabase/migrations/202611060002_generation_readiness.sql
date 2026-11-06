-- Prepared only. No activation, triggers, schedules, credentials or job changes.
begin;
create table public.generation_backend_status (
  worker_name text primary key,
  active boolean not null default false,
  consumer_verified boolean not null default false,
  checked_at timestamptz,
  dictionary_version text,
  capabilities jsonb not null default '{}'::jsonb
);
insert into public.generation_backend_status(worker_name) values('inkquest-generation-worker');
alter table public.generation_backend_status enable row level security;
revoke all on public.generation_backend_status from public,anon,authenticated;
grant select,update on public.generation_backend_status to service_role;

create function public.edge_report_generation_readiness(p_dictionary_version text,p_capabilities jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if jsonb_typeof(p_capabilities)<>'object' then raise exception 'invalid_generation_capabilities'; end if;
  update public.generation_backend_status set checked_at=now(),dictionary_version=p_dictionary_version,
    capabilities=jsonb_build_object('text_zh',p_capabilities->'text_zh','text_en',p_capabilities->'text_en',
      'audio_zh',p_capabilities->'audio_zh','audio_en',p_capabilities->'audio_en')
    where worker_name='inkquest-generation-worker';
  -- Reporting cannot activate or verify the consumer.
end $$;

create function public.ensure_generation_backend_ready(p_language text,p_tts_mode text)
returns void language plpgsql security definer set search_path=public as $$
declare v_status public.generation_backend_status%rowtype;
begin
  -- The lock keeps deactivation and reservation creation in a consistent order.
  select * into v_status from public.generation_backend_status where worker_name='inkquest-generation-worker' for share;
  if not found or not v_status.active or not v_status.consumer_verified or v_status.checked_at is null
    or v_status.checked_at<=now()-interval '3 minutes'
    or p_language not in ('zh','en') or p_tts_mode not in ('off','every_scene')
    or (v_status.capabilities->>('text_'||p_language)) is distinct from 'true'
    or (p_tts_mode='every_scene' and (v_status.capabilities->>('audio_'||p_language)) is distinct from 'true') then
    raise exception 'generation_backend_unavailable';
  end if;
  perform 1 from public.generation_dictionary_versions where version=v_status.dictionary_version and ready for share;
  if not found then raise exception 'generation_backend_unavailable'; end if;
end $$;

create function public.create_ready_generated_story_job(
  p_user_id uuid,p_target_language text,p_learner_level text,p_premise text,p_tts_mode text,
  p_quoted_amount bigint,p_pricing_version text,p_idempotency_key text,p_items jsonb,p_input jsonb
)
returns table(story_id uuid,job_id uuid,reservation_id uuid,reused boolean)
language plpgsql security definer set search_path=public as $$
declare v_existing public.generation_jobs%rowtype;
begin
  if length(trim(p_idempotency_key))<8 then raise exception 'invalid_idempotency_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.generation_jobs where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.job_type<>'opening' then raise exception 'idempotency_conflict'; end if;
    return query select v_existing.story_id,v_existing.id,v_existing.reservation_id,true;
    return;
  end if;
  perform public.ensure_generation_backend_ready(p_target_language,p_tts_mode);
  return query select * from public.create_generated_story_job(p_user_id,p_target_language,p_learner_level,p_premise,p_tts_mode,
    p_quoted_amount,p_pricing_version,p_idempotency_key,p_items,p_input);
end $$;

create function public.create_ready_story_branch_job(
  p_user_id uuid,p_story_id uuid,p_choice_id uuid,p_quoted_amount bigint,p_pricing_version text,
  p_idempotency_key text,p_items jsonb,p_input jsonb default '{}'::jsonb
)
returns table(story_id uuid,job_id uuid,reservation_id uuid,reused boolean)
language plpgsql security definer set search_path=public as $$
declare v_language text;v_tts text;v_existing public.generation_jobs%rowtype;
begin
  if length(trim(p_idempotency_key))<8 then raise exception 'invalid_idempotency_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.generation_jobs where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.job_type<>'scene' or v_existing.story_id<>p_story_id
      or v_existing.input->'selectedChoice'->>'id' is distinct from p_choice_id::text then raise exception 'idempotency_conflict'; end if;
    return query select v_existing.story_id,v_existing.id,v_existing.reservation_id,true;
    return;
  end if;
  select target_language,tts_mode into v_language,v_tts from public.generated_stories
    where id=p_story_id and owner_id=p_user_id for update;
  if not found then raise exception 'generated_story_not_found'; end if;
  perform public.ensure_generation_backend_ready(v_language,v_tts);
  return query select * from public.create_story_branch_job(p_user_id,p_story_id,p_choice_id,p_quoted_amount,
    p_pricing_version,p_idempotency_key,p_items,p_input);
end $$;

revoke all on function public.edge_report_generation_readiness(text,jsonb) from public,anon,authenticated;
revoke all on function public.ensure_generation_backend_ready(text,text) from public,anon,authenticated;
revoke all on function public.create_ready_generated_story_job(uuid,text,text,text,text,bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.create_ready_story_branch_job(uuid,uuid,uuid,bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.edge_report_generation_readiness(text,jsonb) to service_role;
grant execute on function public.create_ready_generated_story_job(uuid,text,text,text,text,bigint,text,text,jsonb,jsonb) to service_role;
grant execute on function public.create_ready_story_branch_job(uuid,uuid,uuid,bigint,text,text,jsonb,jsonb) to service_role;
commit;
