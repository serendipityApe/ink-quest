-- Read-only. Never "repair" a failed invariant with direct balance updates.
begin transaction isolation level repeatable read read only;
select current_database() as database_name,current_user as role_name,now() as observed_at;
select count(*) as account_lot_mismatches from public.credit_accounts a
where a.available<>coalesce((select sum(l.available) from public.credit_lots l where l.user_id=a.user_id),0)
 or a.reserved<>coalesce((select sum(l.reserved) from public.credit_lots l where l.user_id=a.user_id),0);
select count(*) as lot_allocation_mismatches from public.credit_lots l
where l.reserved<>coalesce((select sum(a.amount-a.settled-a.released) from public.credit_reservation_lots a where a.lot_id=l.id),0);
select
 (select count(*) from public.generated_stories) as stories,
 (select count(*) from public.story_nodes) as nodes,
 (select count(*) from public.credit_accounts) as accounts,
 (select coalesce(sum(available),0) from public.credit_accounts) as available_total,
 (select coalesce(sum(reserved),0) from public.credit_accounts) as reserved_total,
 (select count(*) from public.credit_ledger) as ledger_entries,
 (select count(*) from public.credit_starter_claims) as starter_claims,
 (select count(*) from public.creem_credit_payments) as credit_payments;
select md5(coalesce(string_agg(user_id::text||':'||available||':'||reserved||':'||version||':'||updated_at::text,'|' order by user_id),'')) as account_digest
from public.credit_accounts;
select singleton,starter_eligible_from,starter_per_risk_daily,starter_global_daily from public.credit_program_settings;
select c.relname,c.relrowsecurity,
 has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_insert,
 has_table_privilege('authenticated',c.oid,'UPDATE') as authenticated_update,
 has_table_privilege('anon',c.oid,'SELECT') as anonymous_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('credit_lots','credit_reservation_lots','credit_program_settings','credit_starter_claims',
 'creem_checkout_intents','creem_subscriptions','creem_credit_payments','creem_processed_events','creem_payment_reversals') order by c.relname;
select p.oid::regprocedure::text as function_signature,md5(pg_get_functiondef(p.oid)) as definition_hash,
 p.proowner::regrole::text as owner,p.proacl::text as acl,p.prosecdef as security_definer,p.proconfig as function_config,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('grant_credits','release_credit_reservation','settle_credit_reservation_item',
 'create_generated_story_job','create_story_branch_job','commit_generated_story_text','edge_checkpoint_generation_stage',
 'fulfill_creem_payment','reverse_creem_payment','sync_creem_subscription','claim_starter_credits','get_credit_balance','create_creem_checkout_intent') order by 1;
select version,name,encode(extensions.digest(statements[1],'sha256'),'hex') as source_sha256 from supabase_migrations.schema_migrations where version in ('202611110004','202611110005','202611110006') order by version;
commit;
