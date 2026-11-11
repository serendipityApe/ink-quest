-- Permit a fully validated single-call opening to enter bounded preparation.
-- Apply before enabling GENERATION_SINGLE_CALL_OPENING. Existing plan:write and
-- write:prepare jobs remain compatible. Roll back the feature flag/Worker, not
-- this additive transition; leases, reservation checks and billing are unchanged.
begin;
create or replace function public.edge_checkpoint_generation_stage(p_job_id uuid,p_owner text,p_epoch bigint,p_next text,p_output jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype; v_new jsonb; v_old jsonb; v_prefix jsonb; v_cursor integer; v_render integer;
begin
  v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
  if (v_state.phase||':'||p_next) not in ('plan:write','plan:prepare','write:enrich','write:prepare','prepare:prepare','prepare:commit','enrich:gloss','gloss:commit') then raise exception 'invalid_stage_transition'; end if;
  if jsonb_typeof(p_output) is distinct from 'object' or octet_length((v_state.outputs||p_output)::text)>1000000 then raise exception 'invalid_checkpoint_size'; end if;
  if v_state.phase='plan' and p_next='prepare' then
    -- Only complete paid openings may skip write. This does not commit text,
    -- select a choice, or settle credits; the ordinary commit fence still does.
    if not exists(select 1 from public.generation_jobs where id=p_job_id and job_type='opening')
      or not v_state.in_flight
      or p_output->>'openingMode' is distinct from 'single-call-v1'
      or p_output#>>'{fingerprint,segmentationVersion}' is distinct from 'segments-v1'
      or exists(select 1 from jsonb_object_keys(p_output) k where k not in ('plan','scene','fingerprint','openingMode','preparation'))
      or jsonb_typeof(p_output->'plan') is distinct from 'object'
      or jsonb_typeof(p_output#>'{plan,title}') is distinct from 'string'
      or length(trim(coalesce(p_output#>>'{plan,title}','')))=0
      or not (p_output->'plan' ? 'worldBible')
      or jsonb_typeof(p_output#>'{plan,characters}') is distinct from 'array'
      or jsonb_typeof(p_output#>'{plan,openingIntent}') is distinct from 'string'
      or length(trim(coalesce(p_output#>>'{plan,openingIntent}','')))=0
      or jsonb_typeof(p_output->'scene') is distinct from 'object'
      or jsonb_typeof(p_output#>'{scene,text}') is distinct from 'string'
      or length(trim(coalesce(p_output#>>'{scene,text}','')))<20
      or jsonb_typeof(p_output#>'{scene,summary}') is distinct from 'string'
      or jsonb_typeof(p_output#>'{scene,plotWords}') is distinct from 'array'
      or jsonb_typeof(p_output#>'{scene,choices}') is distinct from 'array'
      or p_output->'preparation' is distinct from '{"version":"segments-v1","cursor":0,"spans":[],"tokens":[],"renderCursor":0}'::jsonb then
      raise exception 'invalid_combined_opening';
    end if;
    if jsonb_array_length(p_output#>'{scene,choices}')<>3
      or exists(select 1 from jsonb_array_elements(p_output#>'{scene,choices}') c
        where jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'label') is distinct from 'string'
          or jsonb_typeof(c->'intent') is distinct from 'string') then raise exception 'invalid_combined_opening'; end if;
  end if;
  if v_state.phase='write' and p_next='prepare' and p_output ? 'preparation' then
    if p_output->'preparation' is distinct from '{"version":"segments-v1","cursor":0,"spans":[],"tokens":[],"renderCursor":0}'::jsonb then
      raise exception 'invalid_preparation_initial';
    end if;
  end if;
  if v_state.phase='prepare' then
    if v_state.in_flight then raise exception 'invalid_preparation_stage'; end if;
    -- Preparation cannot replace the paid scene, plan or pinned configuration.
    if exists(select 1 from jsonb_object_keys(p_output) k where k not in ('preparation','initialTokens'))
      or (p_next='prepare' and p_output ? 'initialTokens') then raise exception 'invalid_preparation_patch'; end if;
    if p_next='prepare' or p_output ? 'preparation' then
      v_new:=p_output->'preparation';v_old:=v_state.outputs->'preparation';
      if jsonb_typeof(v_new) is distinct from 'object' or v_new->>'version' is distinct from 'segments-v1'
        or jsonb_typeof(v_new->'spans') is distinct from 'array' or jsonb_typeof(v_new->'tokens') is distinct from 'array'
        or coalesce(v_new->>'cursor','') !~ '^[0-9]{1,5}$' or coalesce(v_new->>'renderCursor','') !~ '^[0-9]{1,4}$' then raise exception 'invalid_preparation'; end if;
      v_cursor:=(v_new->>'cursor')::integer;v_render:=(v_new->>'renderCursor')::integer;
      if v_cursor>public.enrichment_prepared_length(v_state.outputs#>>'{scene,text}') or v_cursor>12000 or jsonb_array_length(v_new->'spans')>2000
       or v_render<>jsonb_array_length(v_new->'tokens') or v_render>jsonb_array_length(v_new->'spans') then raise exception 'invalid_preparation'; end if;
      if v_old is null then
       if v_cursor<>0 or v_render<>0 or v_new->'spans'<>'[]'::jsonb then raise exception 'invalid_preparation_initial'; end if;
      else
       if v_cursor<(v_old->>'cursor')::integer or v_cursor>(v_old->>'cursor')::integer+384
        or v_render<(v_old->>'renderCursor')::integer or v_render>(v_old->>'renderCursor')::integer+64 then raise exception 'invalid_preparation_order'; end if;
       if v_cursor>(v_old->>'cursor')::integer then
        if v_render<>0 or (v_old->>'renderCursor')::integer<>0 or jsonb_array_length(v_new->'spans')>jsonb_array_length(v_old->'spans')+384 then raise exception 'invalid_preparation_order'; end if;
       elsif v_new->'spans' is distinct from v_old->'spans' then raise exception 'preparation_prefix_changed'; end if;
       if v_render>0 and v_cursor<>public.enrichment_prepared_length(v_state.outputs#>>'{scene,text}') then raise exception 'incomplete_preparation'; end if;
       select coalesce(jsonb_agg(value order by ord),'[]') into v_prefix from jsonb_array_elements(v_new->'spans') with ordinality t(value,ord) where ord<=jsonb_array_length(v_old->'spans');
       if v_prefix is distinct from v_old->'spans' then raise exception 'preparation_prefix_changed'; end if;
       select coalesce(jsonb_agg(value order by ord),'[]') into v_prefix from jsonb_array_elements(v_new->'tokens') with ordinality t(value,ord) where ord<=jsonb_array_length(v_old->'tokens');
       if v_prefix is distinct from v_old->'tokens' then raise exception 'preparation_prefix_changed'; end if;
      end if;

      -- Rendering must preserve the corresponding frozen span words as well
      -- as the already persisted token prefix.
      select coalesce(jsonb_agg(value order by ord),'[]') into v_prefix
        from jsonb_array_elements(v_new->'spans') with ordinality t(value,ord) where ord<=v_render;
      if public.enrichment_words(v_new->'tokens') is distinct from public.enrichment_words(v_prefix) then raise exception 'preparation_words_changed'; end if;
    else
      v_new:=v_state.outputs->'preparation';
    end if;
    if p_next='commit' then
      if jsonb_typeof(v_new) is distinct from 'object'
       or jsonb_typeof(p_output->'initialTokens') is distinct from 'array'
       or (p_output->'initialTokens') is distinct from (v_new->'tokens')
       or (v_new->>'cursor')::integer is distinct from public.enrichment_prepared_length(v_state.outputs#>>'{scene,text}')
       or (v_new->>'renderCursor')::integer is distinct from jsonb_array_length(v_new->'spans') then raise exception 'incomplete_preparation'; end if;
    end if;
  end if;
  update public.generation_edge_state set outputs=outputs||p_output,phase=p_next,in_flight=false where job_id=p_job_id;
  update public.generation_jobs set status='queued',stage='edge_'||p_next,lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_job_id;
  return public.edge_wake_generation_job(p_job_id);
end $$;


revoke all on function public.edge_checkpoint_generation_stage(uuid,text,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.edge_checkpoint_generation_stage(uuid,text,bigint,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
