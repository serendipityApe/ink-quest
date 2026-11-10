-- Bound initial tokenization as well as lookup and rendering. No lexical or credit data changes.
begin;
create or replace function public.edge_checkpoint_enrichment_step(p_job_id uuid,p_owner text,p_epoch bigint,p_progress jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype; v_old jsonb; v_n integer; v_old_n integer; v_entries integer; v_old_entries integer; v_prefix jsonb; v_cursor integer; v_old_cursor integer; v_prepare integer; v_old_prepare integer; v_spans integer; v_old_spans integer;
begin
 v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
 if v_state.phase<>'enrich' or v_state.in_flight then raise exception 'invalid_enrichment_step'; end if;
 if jsonb_typeof(p_progress) is distinct from 'object' or jsonb_typeof(p_progress->'spans') is distinct from 'array' or jsonb_typeof(p_progress->'resolved') is distinct from 'array' or jsonb_typeof(p_progress->'entries') is distinct from 'array'
  or jsonb_typeof(p_progress->'rendered') is distinct from 'array' or coalesce(p_progress->>'renderCursor','') !~ '^[0-9]{1,4}$' or coalesce(p_progress->>'prepareCursor','') !~ '^[0-9]{1,5}$' or jsonb_typeof(p_progress->'input') is distinct from 'string' or (p_progress->>'version') is distinct from (v_state.outputs#>>'{fingerprint,dictionaryVersion}') then raise exception 'invalid_enrichment_progress'; end if;
 v_prepare:=(p_progress->>'prepareCursor')::integer;v_spans:=jsonb_array_length(p_progress->'spans');
 if v_prepare>12000 then raise exception 'invalid_enrichment_preparation'; end if;
 v_cursor:=(p_progress->>'renderCursor')::integer;
 if v_cursor<>jsonb_array_length(p_progress->'rendered') or v_cursor>jsonb_array_length(p_progress->'spans') then raise exception 'invalid_enrichment_render_cursor'; end if;
 v_n:=jsonb_array_length(p_progress->'resolved');v_entries:=jsonb_array_length(p_progress->'entries');
 if v_n>2000 or v_entries>v_n or jsonb_array_length(p_progress->'spans')>2000 then raise exception 'invalid_enrichment_progress'; end if;
 v_old:=v_state.outputs->'enrichmentProgress';
 if v_old is null or v_old='null'::jsonb then
  if v_n<>0 or v_entries<>0 or v_cursor<>0 or v_spans<>0 or v_prepare<>0 then raise exception 'invalid_enrichment_initial_step'; end if;
 else
  v_old_prepare:=(v_old->>'prepareCursor')::integer;v_old_spans:=jsonb_array_length(v_old->'spans');
  if v_old_prepare is null then raise exception 'invalid_legacy_enrichment_progress'; end if;
  v_old_n:=jsonb_array_length(v_old->'resolved');v_old_entries:=jsonb_array_length(v_old->'entries');
  v_old_cursor:=(v_old->>'renderCursor')::integer;
  if v_n<v_old_n or v_n>v_old_n+16 or v_entries<v_old_entries or v_entries-v_old_entries>v_n-v_old_n
   or (p_progress->'input') is distinct from (v_old->'input') or v_prepare<v_old_prepare or v_prepare>v_old_prepare+384
   or (p_progress->'version') is distinct from (v_old->'version') then raise exception 'invalid_enrichment_step_order'; end if;
  if v_prepare>v_old_prepare then
   if v_old_n<>0 or v_n<>0 or v_entries<>0 or v_cursor<>0 or v_old_cursor<>0 or v_spans<v_old_spans or v_spans>v_old_spans+384 then raise exception 'invalid_enrichment_preparation'; end if;
   select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_prefix from jsonb_array_elements(p_progress->'spans') with ordinality as x(value,ord) where ord<=v_old_spans;
   if v_prefix is distinct from v_old->'spans' then raise exception 'enrichment_prefix_changed'; end if;
  elsif (p_progress->'spans') is distinct from (v_old->'spans') then raise exception 'invalid_enrichment_step_order';
  elsif v_n>v_old_n then
   if v_old_cursor<>0 or v_cursor<>0 or (p_progress->'rendered') is distinct from (v_old->'rendered') then raise exception 'invalid_enrichment_step_order'; end if;
  else
   if v_cursor<=v_old_cursor or v_cursor>v_old_cursor+64 or (p_progress->'entries') is distinct from (v_old->'entries') then raise exception 'invalid_enrichment_step_order'; end if;
   select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_prefix from jsonb_array_elements(p_progress->'rendered') with ordinality as x(value,ord) where ord<=v_old_cursor;
   if v_prefix is distinct from v_old->'rendered' then raise exception 'enrichment_prefix_changed'; end if;
  end if;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_prefix from jsonb_array_elements(p_progress->'resolved') with ordinality as x(value,ord) where ord<=v_old_n;
  if v_prefix is distinct from v_old->'resolved' then raise exception 'enrichment_prefix_changed'; end if;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_prefix from jsonb_array_elements(p_progress->'entries') with ordinality as x(value,ord) where ord<=v_old_entries;
  if v_prefix is distinct from v_old->'entries' then raise exception 'enrichment_prefix_changed'; end if;
 end if;
 if exists(select 1 from jsonb_array_elements(p_progress->'resolved') as t(value) where jsonb_typeof(value)<>'string')
  or (select count(distinct value) from jsonb_array_elements(p_progress->'resolved'))<>v_n then raise exception 'invalid_enrichment_keys'; end if;
 if octet_length((v_state.outputs||jsonb_build_object('enrichmentProgress',p_progress))::text)>1000000 then raise exception 'invalid_checkpoint_size'; end if;
 update public.generation_edge_state set outputs=outputs||jsonb_build_object('enrichmentProgress',p_progress),in_flight=false where job_id=p_job_id;
 update public.generation_jobs set status='queued',stage='edge_enrich',lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_job_id;
 return public.edge_wake_generation_job(p_job_id);
end $$;
notify pgrst,'reload schema';
commit;
