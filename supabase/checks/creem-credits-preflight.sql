-- Read-only. Run with psql -X -v ON_ERROR_STOP=1 using the approved connection.
-- This is an observation, NOT proof that all concurrent write entrypoints stopped.
begin transaction isolation level repeatable read read only;
select current_database() as database_name, current_user as role_name, now() as observed_at,
  to_regclass('public.credit_lots') is null as migration_not_applied;
select
 (select count(*) from public.generated_stories) as stories,
 (select count(*) from public.story_nodes) as nodes,
 (select count(*) from public.credit_accounts) as accounts,
 (select coalesce(sum(available),0) from public.credit_accounts) as available_total,
 (select coalesce(sum(reserved),0) from public.credit_accounts) as reserved_total,
 (select count(*) from public.credit_ledger) as ledger_entries,
 (select count(*) from public.generation_jobs where status in ('queued','running')) as active_jobs,
 (select count(*) from public.credit_reservations where status in ('reserved','partially_settled')) as open_reservations,
 (select count(*) from public.job_outbox where status='pending') as unpublished_jobs,
 (select count(*) from public.generation_enrichment_jobs where status in ('queued','running')) as active_enrichment_jobs;
-- Aggregated digests do not expose story bodies, emails, credit-account IDs or keys.
select md5(coalesce(string_agg(user_id::text||':'||available||':'||reserved||':'||version||':'||updated_at::text,'|' order by user_id),'')) as account_digest
from public.credit_accounts;
select count(*) as account_reservation_mismatches from public.credit_accounts a
where a.reserved<>coalesce((select sum(r.quoted_amount-r.settled_amount) from public.credit_reservations r
 where r.user_id=a.user_id and r.status in ('reserved','partially_settled')),0);
-- Stop if another transaction might still be executing an old ledger function.
-- Query bodies are intentionally not printed because they can contain private data.
select application_name, state, wait_event_type, count(*) as sessions,
 min(xact_start) as oldest_transaction
from pg_stat_activity
where datname=current_database() and pid<>pg_backend_pid() and xact_start is not null
group by application_name,state,wait_event_type order by oldest_transaction;
select p.oid::regprocedure::text as function_signature,md5(pg_get_functiondef(p.oid)) as definition_hash,
 p.proowner::regrole::text as owner,p.proacl::text as acl,p.prosecdef as security_definer,p.proconfig as function_config
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('grant_credits','release_credit_reservation','settle_credit_reservation_item',
 'create_generated_story_job','create_story_branch_job','commit_generated_story_text','edge_checkpoint_generation_stage')
order by 1;
select version,name,encode(extensions.digest(statements[1],'sha256'),'hex') as source_sha256 from supabase_migrations.schema_migrations where version in ('202611110004','202611110005','202611110006') order by version;
commit;
