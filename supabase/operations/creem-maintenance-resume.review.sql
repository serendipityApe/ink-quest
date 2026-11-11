-- MUTATING REVIEW DRAFT. Works only after independent outcome/invariant readback.
-- This restores the precise pre-window ACL and active=true observed 2026-11-11.
-- If baseline changed, re-review; never apply this as a general repair command.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
do $$ begin
 if current_setting('inkquest.maintenance_resume_verified',true) is distinct from 'operator-confirmed' then raise exception 'independent_readback_required'; end if;
 if current_user<>'postgres' then raise exception 'unexpected_management_role'; end if;
 if (select proacl::text from pg_proc where oid='public.grant_credits(uuid,bigint,text,text,text,jsonb)'::regprocedure) is distinct from '{postgres=X/postgres}' then raise exception 'paused_grant_acl_changed'; end if;
 if exists(select 1 from credit_accounts where reserved<0 or available<0) then raise exception 'funds_invariant_failed'; end if;
 perform 1 from generation_backend_status where worker_name='inkquest-generation-worker' and not active and consumer_verified
 and checked_at>now()-interval '3 minutes' and dictionary_version='assets-lex-244056cfff1d40670ec63f7b-6b262d70369a' for update;
 if not found then raise exception 'backend_not_ready_to_restore'; end if;
end $$;
grant execute on function public.grant_credits(uuid,bigint,text,text,text,jsonb) to service_role;
update generation_backend_status set active=true where worker_name='inkquest-generation-worker';
select active,consumer_verified,checked_at from generation_backend_status where worker_name='inkquest-generation-worker';
select has_function_privilege('service_role','public.grant_credits(uuid,bigint,text,text,text,jsonb)','EXECUTE') as legacy_grant_allowed;
commit;
