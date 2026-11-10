-- Asset metadata and fenced pure-enrichment steps. Existing lexical rows remain unchanged.
begin;
create table public.generation_asset_dictionaries (
 asset_version text primary key,
 source_version text not null check(source_version='lex-244056cfff1d40670ec63f7b'),
 manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 source_csv_sha256 text not null check(source_csv_sha256 ~ '^[a-f0-9]{64}$'),
 expected_rows bigint not null check(expected_rows=892057),
 zh_rows bigint not null check(zh_rows=121446),
 en_rows bigint not null check(en_rows=770611),
 reader_worker text not null check(reader_worker='inkquest-dictionary-assets'),
 reader_version uuid,
 verified_at timestamptz,
 check((verified_at is null)=(reader_version is null))
);
alter table public.generation_asset_dictionaries enable row level security;
revoke all on public.generation_asset_dictionaries from public,anon,authenticated,service_role;
grant select on public.generation_asset_dictionaries to service_role;
insert into public.generation_asset_dictionaries(asset_version,source_version,manifest_sha256,source_csv_sha256,expected_rows,zh_rows,en_rows,reader_worker)
values('assets-lex-244056cfff1d40670ec63f7b-6b262d70369a','lex-244056cfff1d40670ec63f7b','6b262d70369aa45ced4c7150cf9bbf4759103884586ca14794422f9b59d54eeb','f92175fafb68d1dca3c9c7c1b3f9015ae97768786ec4b4af3c6d9781fb65bb1d',892057,121446,770611,'inkquest-dictionary-assets');
create or replace function public.ensure_generation_backend_ready(p_language text,p_tts_mode text)
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
  if not found then
    perform 1 from public.generation_asset_dictionaries where asset_version=v_status.dictionary_version and verified_at is not null and reader_version is not null for share;
    if not found then raise exception 'generation_backend_unavailable'; end if;
  end if;
end $$;

create function public.edge_checkpoint_enrichment_step(p_job_id uuid,p_owner text,p_epoch bigint,p_progress jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype; v_old jsonb; v_n integer; v_old_n integer; v_entries integer; v_old_entries integer; v_prefix jsonb; v_cursor integer; v_old_cursor integer;
begin
 v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
 if v_state.phase<>'enrich' or v_state.in_flight then raise exception 'invalid_enrichment_step'; end if;
 if jsonb_typeof(p_progress) is distinct from 'object' or jsonb_typeof(p_progress->'spans') is distinct from 'array' or jsonb_typeof(p_progress->'resolved') is distinct from 'array' or jsonb_typeof(p_progress->'entries') is distinct from 'array'
  or jsonb_typeof(p_progress->'rendered') is distinct from 'array' or coalesce(p_progress->>'renderCursor','') !~ '^[0-9]{1,4}$' or jsonb_typeof(p_progress->'input') is distinct from 'string' or (p_progress->>'version') is distinct from (v_state.outputs#>>'{fingerprint,dictionaryVersion}') then raise exception 'invalid_enrichment_progress'; end if;
 v_cursor:=(p_progress->>'renderCursor')::integer;
 if v_cursor<>jsonb_array_length(p_progress->'rendered') or v_cursor>jsonb_array_length(p_progress->'spans') then raise exception 'invalid_enrichment_render_cursor'; end if;
 v_n:=jsonb_array_length(p_progress->'resolved');v_entries:=jsonb_array_length(p_progress->'entries');
 if v_n>2000 or v_entries>v_n or jsonb_array_length(p_progress->'spans')>2000 then raise exception 'invalid_enrichment_progress'; end if;
 v_old:=v_state.outputs->'enrichmentProgress';
 if v_old is null or v_old='null'::jsonb then
  if v_n<>0 or v_entries<>0 or v_cursor<>0 then raise exception 'invalid_enrichment_initial_step'; end if;
 else
  v_old_n:=jsonb_array_length(v_old->'resolved');v_old_entries:=jsonb_array_length(v_old->'entries');
  v_old_cursor:=(v_old->>'renderCursor')::integer;
  if v_n<v_old_n or v_n>v_old_n+16 or v_entries<v_old_entries or v_entries-v_old_entries>v_n-v_old_n
   or (p_progress->'input') is distinct from (v_old->'input') or (p_progress->'spans') is distinct from (v_old->'spans')
   or (p_progress->'version') is distinct from (v_old->'version') then raise exception 'invalid_enrichment_step_order'; end if;
  if v_n>v_old_n then
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
revoke all on function public.edge_checkpoint_enrichment_step(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.edge_checkpoint_enrichment_step(uuid,text,bigint,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
