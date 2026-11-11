-- Prepared only: asynchronous lexical enrichment never owns a billing reservation or branch lock.
begin;
alter table public.story_nodes add column model_metadata jsonb not null default '{}';
alter table public.generation_edge_state drop constraint generation_edge_state_phase_check;
alter table public.generation_edge_state add constraint generation_edge_state_phase_check check(phase in ('plan','write','prepare','enrich','gloss','commit','audio','done'));
create table public.generation_enrichment_jobs (
 job_id uuid primary key references public.generation_jobs(id) on delete cascade,
 node_id uuid not null references public.story_nodes(id) on delete cascade,
 node_version integer not null, text_hash text not null, segmentation_hash text not null,
 job jsonb not null, outputs jsonb not null,
 phase text not null default 'enrich' check(phase in ('enrich','gloss','commit','done')),
 status text not null default 'queued' check(status in ('queued','running','completed','failed','stale')),
 owner text, lease_expires_at timestamptz, epoch bigint not null default 0,
 in_flight boolean not null default false, failures integer not null default 0,
 revision bigint not null default 1, published_revision bigint not null default 0,
 next_attempt_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 updated_at timestamptz not null default now(), error_code text
);
alter table public.generation_enrichment_jobs enable row level security;
revoke all on public.generation_enrichment_jobs from public,anon,authenticated,service_role;
grant select on public.generation_enrichment_jobs to service_role;
-- JS preparation cursors use UTF-16 code units after ECMAScript String.trim(),
-- not PostgreSQL code-point length or its space-only default trim.
create function public.enrichment_prepared_length(p_text text) returns integer
language sql immutable strict set search_path=public as $$
 select coalesce(sum(case when ascii(ch)>65535 then 2 else length(ch) end),0)::integer
 from regexp_split_to_table(btrim(p_text,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'') t(ch);
$$;
create function public.enrichment_words(p_tokens jsonb) returns text language sql immutable set search_path=public as $$
 select encode(extensions.digest(coalesce(jsonb_agg(value->'word' order by ord),'[]')::text,'sha256'),'hex') from jsonb_array_elements(p_tokens) with ordinality t(value,ord);
$$;
-- All background writers lock the original job before the enrichment row/node.
-- story_nodes.created_by_job_id is a deferred FK: without this early KEY SHARE,
-- an audio writer can hold the parent FOR UPDATE while waiting on our node,
-- and our deferred FK check then waits on that same parent at COMMIT.
-- This is only a transaction-scoped lock, never a generation reservation/lease.
create function public.enrichment_lock_parent(p_job_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.generation_jobs where id=p_job_id for key share;
end $$;
-- Status is visible through the existing owner-scoped story_nodes read policy.
-- Callers already hold parent KEY SHARE (or primary generation FOR UPDATE)
-- before touching the enrichment row. Do not acquire it here after child locks.
create function public.enrichment_node_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.story_nodes set model_metadata=model_metadata||jsonb_build_object('enrichmentStatus',case when new.status='queued' then 'pending' else new.status end)
 where id=new.node_id and node_version=new.node_version and encode(extensions.digest(text,'sha256'),'hex')=new.text_hash and public.enrichment_words(text_segments)=new.segmentation_hash;
 return new;
end $$;
create trigger enrichment_node_status after insert or update of status on public.generation_enrichment_jobs for each row execute function public.enrichment_node_status();
create function public.enrichment_wake(p_job_id uuid,p_delay integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_revision bigint;
begin
 perform public.enrichment_lock_parent(p_job_id);
 update public.generation_enrichment_jobs set revision=revision+1,status='queued',owner=null,lease_expires_at=null,next_attempt_at=now()+make_interval(secs=>p_delay),updated_at=now() where job_id=p_job_id returning revision into v_revision;
 return jsonb_build_object('jobId',p_job_id,'revision',v_revision,'kind','enrichment');
end $$;
create function public.enrichment_fence(p_job_id uuid,p_owner text,p_epoch bigint) returns public.generation_enrichment_jobs language plpgsql security definer set search_path=public as $$
declare v public.generation_enrichment_jobs%rowtype;
begin
 perform public.enrichment_lock_parent(p_job_id);
 select * into v from public.generation_enrichment_jobs where job_id=p_job_id for update;
 if v.status is distinct from 'running' or v.owner is distinct from p_owner or v.epoch is distinct from p_epoch or v.lease_expires_at is null or v.lease_expires_at<=now() or v.expires_at<=now() then raise exception 'enrichment_lease_fenced'; end if;
 return v;
end $$;
create function public.enrichment_claim_job(p_job_id uuid,p_owner text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.generation_enrichment_jobs%rowtype; n public.story_nodes%rowtype;
begin
 perform public.enrichment_lock_parent(p_job_id);
 if length(trim(p_owner))<8 then raise exception 'invalid_lease_owner'; end if;
 select * into v from public.generation_enrichment_jobs where job_id=p_job_id for update;
 if not found then return jsonb_build_object('kind','missing'); end if;
 if v.status in ('completed','failed','stale') then return jsonb_build_object('kind','terminal'); end if;
 if v.status='running' and v.lease_expires_at>now() then return jsonb_build_object('kind','busy','retryAfterSeconds',ceil(extract(epoch from v.lease_expires_at-now()))); end if;
 select * into n from public.story_nodes where id=v.node_id;
 if n.id is null or n.node_version<>v.node_version or encode(extensions.digest(n.text,'sha256'),'hex')<>v.text_hash or public.enrichment_words(n.text_segments)<>v.segmentation_hash then
  update public.generation_enrichment_jobs set status='stale',outputs='{}',job='{}',phase='done',owner=null,in_flight=false,error_code='enrichment_node_changed' where job_id=p_job_id;
  return jsonb_build_object('kind','terminal');
 end if;
 if v.expires_at<=now() or v.failures>=3 or v.in_flight then
  update public.generation_enrichment_jobs set status='failed',outputs='{}',job='{}',phase='done',owner=null,in_flight=false,error_code=case when v.in_flight then 'upstream_outcome_unknown' else 'enrichment_attempts_exhausted' end where job_id=p_job_id;
  return jsonb_build_object('kind','terminal');
 end if;
 if v.next_attempt_at>now() then return jsonb_build_object('kind','busy','retryAfterSeconds',ceil(extract(epoch from v.next_attempt_at-now()))); end if;
 update public.generation_enrichment_jobs set status='running',owner=p_owner,epoch=epoch+1,lease_expires_at=now()+interval '150 seconds',updated_at=now() where job_id=p_job_id returning * into v;
 return jsonb_build_object('kind','claimed','lease',jsonb_build_object('enrichment',true,'owner',p_owner,'epoch',v.epoch,'phase',v.phase,'outputs',v.outputs,'ambiguous',false,'job',v.job||jsonb_build_object('nodeId',n.id,'nodeVersion',n.node_version,'nodeText',n.text,'textSegments',n.text_segments)));
end $$;
create function public.enrichment_begin_stage(p_job_id uuid,p_owner text,p_epoch bigint) returns void language plpgsql security definer set search_path=public as $$
declare v public.generation_enrichment_jobs%rowtype;
begin
 v:=public.enrichment_fence(p_job_id,p_owner,p_epoch);
 if v.in_flight or v.phase<>'gloss' then raise exception 'upstream_attempt_already_started'; end if;
 update public.generation_enrichment_jobs set in_flight=true where job_id=p_job_id;
end $$;
create function public.enrichment_checkpoint_stage(p_job_id uuid,p_owner text,p_epoch bigint,p_next text,p_output jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.generation_enrichment_jobs%rowtype;
begin
 v:=public.enrichment_fence(p_job_id,p_owner,p_epoch);
 if (v.phase||':'||p_next) not in ('enrich:gloss','gloss:commit') then raise exception 'invalid_stage_transition'; end if;
 if jsonb_typeof(p_output) is distinct from 'object' or octet_length((v.outputs||p_output)::text)>1000000 then raise exception 'invalid_checkpoint_size'; end if;
 update public.generation_enrichment_jobs set outputs=outputs||p_output,phase=p_next,in_flight=false where job_id=p_job_id;
 return public.enrichment_wake(p_job_id);
end $$;
create function public.enrichment_fail_stage(p_job_id uuid,p_owner text,p_epoch bigint,p_code text,p_retryable boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.generation_enrichment_jobs%rowtype;
begin
 v:=public.enrichment_fence(p_job_id,p_owner,p_epoch);
 update public.generation_enrichment_jobs set failures=failures+1,in_flight=false,error_code=p_code,updated_at=now() where job_id=p_job_id;
 -- Caller may retry paid gloss only following a definite upstream rejection, never an unknown outcome.
 if p_retryable and v.failures<2 then return public.enrichment_wake(p_job_id,30); end if;
 update public.generation_enrichment_jobs set status='failed',outputs='{}',job='{}',phase='done',owner=null,lease_expires_at=null where job_id=p_job_id;
 return null;
end $$;
create function public.enrichment_commit(p_job_id uuid,p_owner text,p_epoch bigint,p_tokens jsonb) returns void language plpgsql security definer set search_path=public as $$
declare v public.generation_enrichment_jobs%rowtype; n public.story_nodes%rowtype; v_tokens jsonb;
begin
 v:=public.enrichment_fence(p_job_id,p_owner,p_epoch);
 if v.phase<>'commit' or v.in_flight then raise exception 'invalid_enrichment_phase'; end if;
 if jsonb_typeof(p_tokens) is distinct from 'array' then raise exception 'invalid_enrichment_tokens'; end if;
 if jsonb_array_length(p_tokens)>2000 or jsonb_array_length(p_tokens)=0 or exists(select 1 from jsonb_array_elements(p_tokens) t(value)
  where jsonb_typeof(value->'word') is distinct from 'string' or length(value->>'word')=0
  or coalesce(value->>'tier','') not in ('base','normal','key')
  or (value->>'tier'<>'base' and (jsonb_typeof(value->'meaning') is distinct from 'string' or length(trim(value->>'meaning'))=0))) then raise exception 'invalid_enrichment_tokens'; end if;
 if public.enrichment_words(p_tokens)<>v.segmentation_hash then raise exception 'enrichment_segmentation_changed'; end if;
 select * into n from public.story_nodes where id=v.node_id for update;
 if n.id is null or n.node_version<>v.node_version or encode(extensions.digest(n.text,'sha256'),'hex')<>v.text_hash or public.enrichment_words(n.text_segments)<>v.segmentation_hash then
  update public.generation_enrichment_jobs set status='stale',outputs='{}',job='{}',phase='done',owner=null,error_code='enrichment_node_changed' where job_id=p_job_id;
  return;
 end if;
 select jsonb_agg(a.value || (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(b.value) where key in ('reading','level','tier','meaning','isPlotKeyword')) order by a.ord) into v_tokens
 from jsonb_array_elements(n.text_segments) with ordinality a(value,ord) join jsonb_array_elements(p_tokens) with ordinality b(value,ord) using(ord);
 update public.story_nodes set text_segments=v_tokens where id=n.id;
 update public.generation_enrichment_jobs set status='completed',outputs='{}',job='{}',phase='done',owner=null,lease_expires_at=null,in_flight=false,updated_at=now() where job_id=p_job_id;
end $$;
create function public.enrichment_pending_jobs() returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('jobId',job_id,'revision',revision,'kind','enrichment')),'[]') from (select job_id,revision from public.generation_enrichment_jobs where status='queued' and revision>published_revision and next_attempt_at<=now() order by next_attempt_at limit 5) q;
$$;
create function public.enrichment_mark_published(p_job_id uuid,p_revision bigint) returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.enrichment_lock_parent(p_job_id);
 update public.generation_enrichment_jobs set published_revision=p_revision where job_id=p_job_id and revision=p_revision;
end $$;
create function public.enrichment_recover_jobs() returns void language plpgsql security definer set search_path=public as $$
declare v public.generation_enrichment_jobs%rowtype; v_job_id uuid;
begin
 -- Scan only identities first, without child locks. Never wait for a parent
 -- while holding its enrichment row. Recheck eligibility after both locks.
 for v_job_id in select job_id from public.generation_enrichment_jobs where status in ('queued','running') and (expires_at<=now() or (status='running' and lease_expires_at<=now()) or (status='queued' and updated_at<now()-interval '5 minutes')) order by job_id limit 25 loop
  perform 1 from public.generation_jobs where id=v_job_id for key share skip locked;
  if not found then continue; end if;
  select * into v from public.generation_enrichment_jobs where job_id=v_job_id and status in ('queued','running')
   and (expires_at<=now() or (status='running' and lease_expires_at<=now()) or (status='queued' and updated_at<now()-interval '5 minutes')) for update skip locked;
  if not found then continue; end if;
  if v.in_flight or v.expires_at<=now() or v.failures>=3 then
   update public.generation_enrichment_jobs set status='failed',outputs='{}',job='{}',phase='done',owner=null,in_flight=false,error_code=case when v.in_flight then 'upstream_outcome_unknown' else 'enrichment_deadline_expired' end where job_id=v.job_id;
  else perform public.enrichment_wake(v.job_id); end if;
 end loop;
end $$;

create or replace function public.enrichment_checkpoint_step(p_job_id uuid,p_owner text,p_epoch bigint,p_progress jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_enrichment_jobs%rowtype; v_old jsonb; v_n integer; v_old_n integer; v_entries integer; v_old_entries integer; v_prefix jsonb; v_cursor integer; v_old_cursor integer; v_prepare integer; v_old_prepare integer; v_spans integer; v_old_spans integer;
begin
 v_state:=public.enrichment_fence(p_job_id,p_owner,p_epoch);
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
 update public.generation_enrichment_jobs set outputs=outputs||jsonb_build_object('enrichmentProgress',p_progress),in_flight=false where job_id=p_job_id;
 return public.enrichment_wake(p_job_id);
end $$;

create or replace function public.edge_checkpoint_generation_stage(p_job_id uuid,p_owner text,p_epoch bigint,p_next text,p_output jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype; v_new jsonb; v_old jsonb; v_prefix jsonb; v_cursor integer; v_render integer;
begin
  v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
  if (v_state.phase||':'||p_next) not in ('plan:write','write:enrich','write:prepare','prepare:prepare','prepare:commit','enrich:gloss','gloss:commit') then raise exception 'invalid_stage_transition'; end if;
  if jsonb_typeof(p_output)<>'object' or octet_length((v_state.outputs||p_output)::text)>1000000 then raise exception 'invalid_checkpoint_size'; end if;
  if v_state.phase='prepare' then
    if v_state.in_flight then raise exception 'invalid_preparation_stage'; end if;
    if p_next='commit' then
      if jsonb_typeof(p_output->'initialTokens') is distinct from 'array' or (p_output->'initialTokens') is distinct from (v_state.outputs#>'{preparation,tokens}')
       or (v_state.outputs#>>'{preparation,cursor}')::integer<>public.enrichment_prepared_length(v_state.outputs#>>'{scene,text}')
       or (v_state.outputs#>>'{preparation,renderCursor}')::integer<>jsonb_array_length(v_state.outputs#>'{preparation,spans}') then raise exception 'incomplete_preparation'; end if;
    else
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
    end if;
  end if;
  update public.generation_edge_state set outputs=outputs||p_output,phase=p_next,in_flight=false where job_id=p_job_id;
  update public.generation_jobs set status='queued',stage='edge_'||p_next,lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_job_id;
  return public.edge_wake_generation_job(p_job_id);
end $$;


create or replace function public.edge_commit_generated_text(p_job_id uuid,p_owner text,p_epoch bigint,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.generation_edge_state%rowtype; v_result jsonb; v_tts boolean; v_job public.generation_jobs%rowtype; v_story public.generated_stories%rowtype; v_node public.story_nodes%rowtype;
begin
  v_state:=public.edge_fence(p_job_id,p_owner,p_epoch);
  if v_state.phase<>'commit' then raise exception 'invalid_generation_phase'; end if;
  v_tts:=(p_input->>'ttsDeferred')::boolean;
  v_result:=public.commit_generated_story_text(p_job_id,p_owner,p_input->>'title',p_input->>'text',p_input->'textSegments',
    p_input->'choices',p_input->>'summary',p_input->'stateSnapshot',p_input->>'promptVersion',p_input->'modelMetadata',v_tts);
  if p_input->>'enrichmentDeferred'='true' then
    if jsonb_typeof(p_input->'enrichment') is distinct from 'object'
     or p_input#>>'{enrichment,scene,text}' is distinct from p_input->>'text'
     or p_input#>>'{enrichment,fingerprint,segmentationVersion}' is distinct from 'segments-v1'
     or length(trim(coalesce(p_input#>>'{enrichment,fingerprint,dictionaryVersion}','')))=0
     or p_input#>>'{enrichment,enrichmentProgress,version}' is distinct from p_input#>>'{enrichment,fingerprint,dictionaryVersion}'
     or jsonb_typeof(p_input#>'{enrichment,enrichmentProgress,spans}') is distinct from 'array'
     or jsonb_typeof(p_input#>'{enrichment,enrichmentProgress,input}') is distinct from 'string'
     or p_input#>'{enrichment,enrichmentProgress,resolved}' is distinct from '[]'::jsonb
     or p_input#>'{enrichment,enrichmentProgress,entries}' is distinct from '[]'::jsonb
     or p_input#>'{enrichment,enrichmentProgress,rendered}' is distinct from '[]'::jsonb
     or p_input#>>'{enrichment,enrichmentProgress,renderCursor}' is distinct from '0'
     or p_input#>>'{enrichment,enrichmentProgress,prepareCursor}' is distinct from public.enrichment_prepared_length(p_input->>'text')::text then raise exception 'invalid_enrichment_payload'; end if;
    if jsonb_array_length(p_input->'textSegments') not between 1 and 2000
     or exists(select 1 from jsonb_array_elements(p_input->'textSegments') t(value) where jsonb_typeof(value->'word') is distinct from 'string' or length(value->>'word')=0)
     or public.enrichment_words(p_input#>'{enrichment,enrichmentProgress,spans}') is distinct from public.enrichment_words(p_input->'textSegments') then raise exception 'invalid_enrichment_segmentation'; end if;
    select * into v_job from public.generation_jobs where id=p_job_id;
    select * into v_story from public.generated_stories where id=v_job.story_id;
    select * into v_node from public.story_nodes where id=v_job.node_id;
    insert into public.generation_enrichment_jobs(job_id,node_id,node_version,text_hash,segmentation_hash,outputs,job)
    values(p_job_id,v_node.id,v_node.node_version,encode(extensions.digest(v_node.text,'sha256'),'hex'),public.enrichment_words(v_node.text_segments),p_input->'enrichment',
      jsonb_build_object('jobId',v_job.id,'userId',v_job.user_id,'storyId',v_job.story_id,'nodeId',v_node.id,
      'reservationId',v_job.reservation_id,'jobType',v_job.job_type,'stage','enrichment','attempt',1,'input',v_job.input,
      'targetLanguage',v_story.target_language,'learnerLevel',v_story.learner_level,'premise',v_story.premise,'storyTitle',v_story.title,
      'ttsMode',v_story.tts_mode,'ttsVoiceId',v_story.tts_voice_id,'storyVersion',v_story.story_version,
      'nodeVersion',v_node.node_version,'nodeText',v_node.text,'textSegments',v_node.text_segments,'stateSnapshot',p_input->'stateSnapshot'));
  end if;
  update public.generation_edge_state set phase=case when v_tts then 'audio' else 'done' end,in_flight=false,outputs='{}' where job_id=p_job_id;
  if v_tts then
    update public.generation_jobs set status='queued',stage='tts_retry_scheduled',lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_job_id;
    v_result:=public.edge_wake_generation_job(p_job_id);
    if p_input->>'enrichmentDeferred'='true' then
      v_result:=v_result||jsonb_build_object('followups',jsonb_build_array(jsonb_build_object('jobId',p_job_id,'revision',1,'kind','enrichment')));
    end if;
    return v_result;
  end if;
  update public.job_outbox set status='published',published_at=now() where job_id=p_job_id;
  if p_input->>'enrichmentDeferred'='true' then return jsonb_build_object('jobId',p_job_id,'revision',1,'kind','enrichment'); end if;
  return null;
end $$;


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
  if v_status.capabilities->>'async_dictionary'='true' then return; end if;
  perform 1 from public.generation_dictionary_versions where version=v_status.dictionary_version and ready for share;
  if not found then
    perform 1 from public.generation_asset_dictionaries where asset_version=v_status.dictionary_version and verified_at is not null and reader_version is not null for share;
    if not found then raise exception 'generation_backend_unavailable'; end if;
  end if;
end $$;


create or replace function public.edge_report_generation_readiness(p_dictionary_version text,p_capabilities jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if jsonb_typeof(p_capabilities)<>'object' then raise exception 'invalid_generation_capabilities'; end if;
  update public.generation_backend_status set checked_at=now(),dictionary_version=p_dictionary_version,
    capabilities=jsonb_build_object('text_zh',p_capabilities->'text_zh','text_en',p_capabilities->'text_en',
      'async_dictionary',p_capabilities->'async_dictionary','audio_zh',p_capabilities->'audio_zh','audio_en',p_capabilities->'audio_en')
    where worker_name='inkquest-generation-worker';
  -- Reporting cannot activate or verify the consumer.
end $$;


do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'enrichment_%' loop
 -- Supabase may grant service_role EXECUTE through default privileges.
 -- Reset explicit/default grants before exposing only the intended RPCs.
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname not in ('enrichment_fence','enrichment_wake','enrichment_words','enrichment_node_status','enrichment_prepared_length','enrichment_lock_parent') then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
