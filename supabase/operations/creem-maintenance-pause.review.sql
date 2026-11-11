-- MUTATING REVIEW DRAFT. No execution until separately approved and all CI gates pass.
-- Preserve / verify the original state independently before setting the attestation.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
do $$ begin
 if current_setting('inkquest.maintenance_authorized',true) is distinct from 'operator-confirmed' then raise exception 'maintenance_approval_required'; end if;
 if current_user<>'postgres' then raise exception 'unexpected_management_role'; end if;
 if to_regclass('public.credit_lots') is not null then raise exception 'migration_already_present_reassess_plan'; end if;
 if (select md5(pg_get_functiondef(oid)) from pg_proc where oid='public.grant_credits(uuid,bigint,text,text,text,jsonb)'::regprocedure) is distinct from '99aaca4017f704158e173a67ba343f38' then raise exception 'original_grant_definition_changed'; end if;
 if (select proacl::text from pg_proc where oid='public.grant_credits(uuid,bigint,text,text,text,jsonb)'::regprocedure) is distinct from '{postgres=X/postgres,service_role=X/postgres}' then raise exception 'original_grant_acl_changed'; end if;
 perform 1 from generation_backend_status where worker_name='inkquest-generation-worker' and active and consumer_verified
  and dictionary_version='assets-lex-244056cfff1d40670ec63f7b-6b262d70369a' for update;
 if not found then raise exception 'original_backend_state_changed'; end if;
end $$;
update generation_backend_status set active=false where worker_name='inkquest-generation-worker';
revoke execute on function public.grant_credits(uuid,bigint,text,text,text,jsonb) from service_role;
select active,consumer_verified,checked_at from generation_backend_status where worker_name='inkquest-generation-worker';
select has_function_privilege('service_role','public.grant_credits(uuid,bigint,text,text,text,jsonb)','EXECUTE') as legacy_grant_allowed;
commit;
