import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isolatedDatabase} from './database.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
async function fixture(){
 const db=await isolatedDatabase({includeAssets:true,serviceRoleFunctionDefaults:true});
 await db.exec(`alter table auth.users add column created_at timestamptz not null default now(); alter table auth.users add column email_confirmed_at timestamptz;
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
 create or replace function extensions.digest(text,text) returns bytea language sql as 'select sha256(convert_to($1,''UTF8''))';
 insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','synthetic@example.test');
 select grant_credits('11111111-1111-4111-8111-111111111111',100,'fixture','test','fixture','{}');
 revoke execute on function public.grant_credits(uuid,bigint,text,text,text,jsonb) from service_role;
 set inkquest.migration_writes_quiesced='operator-confirmed';`);
 for(const name of ['202611110004_combine_preparation_checkpoints','202611110005_single_call_opening']){
  const source=await readFile(new URL(`../../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
  await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,array[$3])',[name.split('_')[0],name,source]);
 }
 return db;
}
test('offline generated rollback plan leaves schema, credit balances and migration history unchanged',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'inkquest-creem-plan-test-'));const db=await fixture();
 try{
  const result=JSON.parse(execFileSync(process.execPath,[join(root,'scripts/prepare-creem-migration.mjs'),dir],{encoding:'utf8'}));
  assert.equal(result.executed,false);assert.equal(result.commitPlanEmitted,false);
  await db.exec(await readFile(join(dir,'dry-run.sql'),'utf8'));
  assert.equal((await db.query("select to_regclass('public.credit_lots') as t")).rows[0].t,null);
  assert.equal((await db.query("select count(*)::integer as n from supabase_migrations.schema_migrations where version='202611110006'")).rows[0].n,0);
  assert.equal((await db.query('select available::integer as n from credit_accounts')).rows[0].n,100);
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
test('offline generated commit plan preserves balances and records exact source only in isolated database',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'inkquest-creem-plan-test-'));const db=await fixture();
 try{
  execFileSync(process.execPath,[join(root,'scripts/prepare-creem-migration.mjs'),dir,'--emit-commit-plan']);
  await db.exec(await readFile(join(dir,'reviewed-commit.sql'),'utf8'));
  assert.equal((await db.query("select count(*)::integer as n from supabase_migrations.schema_migrations where version='202611110006'")).rows[0].n,1);
  assert.equal((await db.query('select available::integer as n from credit_accounts')).rows[0].n,100);
  assert.equal((await db.query('select available::integer as n from credit_lots')).rows[0].n,100);
  assert.equal((await db.query("select has_function_privilege('service_role','grant_credits(uuid,bigint,text,text,text,jsonb)','execute') as allowed")).rows[0].allowed,false);
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
test('maintenance drafts pause and restore only intended gates in an isolated fixture',async()=>{
 const db=await fixture();try{
  await db.exec(`grant execute on function public.grant_credits(uuid,bigint,text,text,text,jsonb) to service_role;
   update generation_backend_status set active=true,consumer_verified=true,checked_at=now(),dictionary_version='assets-lex-244056cfff1d40670ec63f7b-6b262d70369a';
   set inkquest.maintenance_authorized='operator-confirmed';set inkquest.maintenance_resume_verified='operator-confirmed';`);
  const fixtureHash=(await db.query("select md5(pg_get_functiondef('public.grant_credits(uuid,bigint,text,text,text,jsonb)'::regprocedure)) as h")).rows[0].h;
  // Production hash stays pinned in the actual draft. Adapt only this isolated fixture.
  const pause=(await readFile(new URL('../../../supabase/operations/creem-maintenance-pause.review.sql',import.meta.url),'utf8')).replace('99aaca4017f704158e173a67ba343f38',fixtureHash);
  await db.exec(pause);
  assert.equal((await db.query('select active from generation_backend_status')).rows[0].active,false);
  assert.equal((await db.query("select has_function_privilege('service_role','grant_credits(uuid,bigint,text,text,text,jsonb)','execute') as allowed")).rows[0].allowed,false);
  await db.exec(await readFile(new URL('../../../supabase/operations/creem-maintenance-resume.review.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select active from generation_backend_status')).rows[0].active,true);
  assert.equal((await db.query("select has_function_privilege('service_role','grant_credits(uuid,bigint,text,text,text,jsonb)','execute') as allowed")).rows[0].allowed,true);
  assert.equal((await db.query('select available::integer as n from credit_accounts')).rows[0].n,100);
 }finally{await db.close();}
});
