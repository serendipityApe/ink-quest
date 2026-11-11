/** Offline plan generator. Never connects to a database or reads credentials. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
if(args.length>2 || (args[1]!==undefined && args[1]!=='--emit-commit-plan'))throw new Error('Usage: node scripts/prepare-creem-migration.mjs OUTPUT_DIRECTORY [--emit-commit-plan]');
const directory=resolve(args[0]??'tmp/creem-migration-plan');
const source=await readFile(new URL('../supabase/migrations/202611110006_creem_credit_lots.sql',import.meta.url),'utf8');
if(!/^begin;\s/i.test(source)||!/commit;\s*$/i.test(source))throw new Error('Unexpected migration transaction shape');
const hash=createHash('sha256').update(source).digest('hex');
const prerequisites=[];
for (const version of ['202611110004_combine_preparation_checkpoints','202611110005_single_call_opening']) {
 const previous=await readFile(new URL(`../supabase/migrations/${version}.sql`,import.meta.url),'utf8');
 prerequisites.push({version:version.split('_')[0],hash:createHash('sha256').update(previous).digest('hex')});
}
const prerequisiteGuards=prerequisites.map(p=>`if (select encode(extensions.digest(statements[1],'sha256'),'hex') from supabase_migrations.schema_migrations where version='${p.version}') is distinct from '${p.hash}' then raise exception 'prerequisite_${p.version}_changed'; end if;`).join('\n');
const body=source.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
const checks=String.raw`
do $$ begin
 if exists(select 1 from credit_accounts a where a.available<>coalesce((select sum(available) from credit_lots where user_id=a.user_id),0)
 or a.reserved<>coalesce((select sum(reserved) from credit_lots where user_id=a.user_id),0)) then raise exception 'postflight_account_lot_mismatch'; end if;
 if exists(select 1 from credit_lots l where l.reserved<>coalesce((select sum(amount-settled-released) from credit_reservation_lots where lot_id=l.id),0)) then raise exception 'postflight_lot_allocation_mismatch'; end if;
 if (select account_hash from pg_temp.creem_migration_baseline)<>(select md5(coalesce(string_agg(user_id::text||':'||available||':'||reserved||':'||version||':'||updated_at::text,'|' order by user_id),'')) from credit_accounts)
 or (select stories from pg_temp.creem_migration_baseline)<>(select count(*) from generated_stories)
 or (select nodes from pg_temp.creem_migration_baseline)<>(select count(*) from story_nodes)
 or (select ledger_count from pg_temp.creem_migration_baseline)<>(select count(*) from credit_ledger)
 or (select reservation_hash from pg_temp.creem_migration_baseline)<>(select md5(coalesce(string_agg(id::text||':'||status||':'||quoted_amount||':'||settled_amount,'|' order by id),'')) from credit_reservations)
 then raise exception 'migration_changed_existing_funds_or_stories'; end if;
 if exists(select 1 from pg_temp.creem_function_baseline b join pg_proc p on p.oid=b.oid
 where p.proowner<>b.owner_id or p.proacl::text is distinct from b.acl or p.proargnames is distinct from b.argnames
 or (b.proname not in ('grant_credits','release_credit_reservation','settle_credit_reservation_item') and md5(pg_get_functiondef(p.oid))<>b.definition_hash)) then raise exception 'unexpected_existing_function_change'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fulfill_creem_payment','reverse_creem_payment','sync_creem_subscription','claim_starter_credits','get_credit_balance','create_creem_checkout_intent') and (p.proowner<>'postgres'::regrole or not p.prosecdef or p.proconfig is distinct from array['search_path=public, pg_temp']::text[])) then raise exception 'unsafe_rpc_definition_attributes'; end if;
 if exists(select 1 from credit_starter_claims) or exists(select 1 from creem_credit_payments) then raise exception 'unexpected_migration_grant'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
 p.proname in ('fulfill_creem_payment','reverse_creem_payment','sync_creem_subscription','claim_starter_credits','get_credit_balance','create_creem_checkout_intent')
 and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'unsafe_rpc_grants'; end if;
end $$;
select 'creem_credit_migration_assertions_passed' as result;
`;
const before=String.raw`
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
set local idle_in_transaction_session_timeout='30s';
-- Operator attestation is intentionally not set by this script. It is NOT a
-- substitute for actually draining write endpoints/transactions first.
do $$ begin
 if current_setting('inkquest.migration_writes_quiesced',true) is distinct from 'operator-confirmed' then raise exception 'writes_must_be_quiesced_and_verified'; end if;
 if to_regclass('public.credit_lots') is not null or exists(select 1 from supabase_migrations.schema_migrations where version='202611110006') then raise exception 'migration_already_applied_do_not_repeat'; end if;
 ${prerequisiteGuards}
 if exists(select 1 from generation_backend_status where worker_name='inkquest-generation-worker' and active) then raise exception 'generation_intake_not_paused'; end if;
 if has_function_privilege('service_role','public.grant_credits(uuid,bigint,text,text,text,jsonb)','EXECUTE') then raise exception 'legacy_grant_intake_not_paused'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('inkquest:creem-ledger-migration',0)) then raise exception 'another_migration_running'; end if;
end $$;
-- Acquire short exclusive locks before backfill. Timeout/deadlock aborts the
-- whole transaction; never terminate sessions or automatically retry a commit.
lock table public.credit_accounts,public.credit_reservations,public.credit_ledger,
 public.generated_stories,public.story_nodes,public.generation_jobs,public.job_outbox
 in access exclusive mode;
do $$ begin
 if exists(select 1 from generation_jobs where status in ('queued','running'))
 or exists(select 1 from credit_reservations where status in ('reserved','partially_settled'))
 or exists(select 1 from job_outbox where status='pending')
 or exists(select 1 from generation_enrichment_jobs where status in ('queued','running'))
 then raise exception 'generation_must_be_drained'; end if;
 if exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and xact_start is not null)
 then raise exception 'other_database_transactions_still_active'; end if;
end $$;
create temporary table creem_migration_baseline on commit drop as select
 (select md5(coalesce(string_agg(user_id::text||':'||available||':'||reserved||':'||version||':'||updated_at::text,'|' order by user_id),'')) from credit_accounts) as account_hash,
 (select md5(coalesce(string_agg(id::text||':'||status||':'||quoted_amount||':'||settled_amount,'|' order by id),'')) from credit_reservations) as reservation_hash,
 (select count(*) from generated_stories) as stories,(select count(*) from story_nodes) as nodes,(select count(*) from credit_ledger) as ledger_count;
create temporary table creem_function_baseline on commit drop as select p.oid,p.proname,p.proowner as owner_id,p.proacl::text as acl,p.proargnames as argnames,md5(pg_get_functiondef(p.oid)) as definition_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
`;
if(source.includes('$creem006_source$'))throw new Error('Unexpected source delimiter');
const record=`insert into supabase_migrations.schema_migrations(version,name,statements) values('202611110006','creem_credit_lots',array[$creem006_source$${source}$creem006_source$]);\nselect encode(extensions.digest(statements[1],'sha256'),'hex')='${hash}' as migration_source_matches from supabase_migrations.schema_migrations where version='202611110006';`;
await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,'dry-run.sql'),`-- Migration SHA256 ${hash}\n-- DEFAULT DRY RUN: all database changes roll back. Requires maintenance window.\n${before}\n${body}\n${checks}\n${record}\nrollback;\n`);
if(args[1]==='--emit-commit-plan')await writeFile(resolve(directory,'reviewed-commit.sql'),`-- Migration SHA256 ${hash}\n-- MUTATING PLAN: separate approval and verified quiescence required; do not run casually.\n${before}\n${body}\n${checks}\n${record}\ncommit;\n`);
console.log(JSON.stringify({directory,migrationSha256:hash,default:'rollback',commitPlanEmitted:args[1]==='--emit-commit-plan',executed:false}));
