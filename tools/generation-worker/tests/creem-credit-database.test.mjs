import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isolatedDatabase} from './database.mjs';
const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
const risk='a'.repeat(64);
const q=x=>`'${String(x).replaceAll("'","''")}'`;
async function db(){
 const db=await isolatedDatabase({includeAssets:true,serviceRoleFunctionDefaults:true});
 await db.exec(`alter table auth.users add column created_at timestamptz not null default now(); alter table auth.users add column email_confirmed_at timestamptz;`);
 await db.exec(await readFile(new URL('../../../supabase/migrations/202611110006_creem_credit_lots.sql',import.meta.url),'utf8'));
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${user}','one@example.test',now()),('${other}','two@example.test',now());`);
 return db;
}
async function one(db,sql){return (await db.query(sql)).rows[0];}
async function balance(db){return (await one(db,`select get_credit_balance('${user}') as b`)).b;}
async function intent(db,code='credits_500',id=request){await db.exec(`select create_creem_checkout_intent('${user}','${code}','${id}');`);}
async function pay(db,code='credits_500',order='ord1',id=request){
 const extra=code==='generation_monthly'?`,'sub1',now(),now()+interval '1 month','cus1'`:`,null,null,null,'cus1'`;
 return db.exec(`select fulfill_creem_payment('evt-${order}','${order}','${user}','${code}','${id}'${extra});`);
}
async function reserve(db,amount=20){
 const row=await one(db,`select * from create_generated_story_job('${user}','en','B1','test premise','off',${amount},'v1','test-reservation-${amount}','[]','{}')`);
 return row.reservation_id;
}
test('starter verified/once and untrusted roles denied',async()=>{
 const d=await db();try{
  await d.exec(`select claim_starter_credits('${user}','${risk}'); select claim_starter_credits('${user}','${risk}');`);
  assert.equal((await balance(d)).available,100);
  await d.exec(`update auth.users set email_confirmed_at=null where id='${other}';`);
  await assert.rejects(d.exec(`select claim_starter_credits('${other}','${risk}');`),/email_verification_required/);
  assert.equal((await one(d,`select has_function_privilege('authenticated','public.fulfill_creem_payment(text,text,uuid,text,uuid,text,timestamptz,timestamptz,text)','execute') as allowed`)).allowed,false);
  assert.equal((await one(d,`select has_table_privilege('authenticated','public.creem_checkout_intents','select') as allowed`)).allowed,false);
 }finally{await d.close();}
});
test('purchase order idempotent, ownership-bound, old signup excluded',async()=>{
 const d=await db();try{
  await intent(d);await pay(d);await pay(d);
  assert.equal((await balance(d)).available,500);
  await assert.rejects(d.exec(`select fulfill_creem_payment('bad','bad','${other}','credits_500','${request}');`),/checkout_intent_mismatch/);
  await d.exec(`update auth.users set created_at=now()-interval '1 year' where id='${other}';`);
  await assert.rejects(d.exec(`select claim_starter_credits('${other}','${risk}');`),/starter_ineligible/);
  assert.equal((await one(d,`select available from credit_accounts where user_id='${other}'`)).available,0);
 }finally{await d.close();}
});
test('monthly expiry preserves topup; expired reserved refunds do not become perpetual',async()=>{
 const d=await db();try{
  await intent(d,'generation_monthly');await pay(d,'generation_monthly');
  await intent(d,'credits_500','44444444-4444-4444-8444-444444444444');await pay(d,'credits_500','ord2','44444444-4444-4444-8444-444444444444');
  const r=await reserve(d,20);
  await d.exec(`update credit_lots set expires_at=now()-interval '1 second' where kind='monthly';`);
  assert.equal((await balance(d)).available,500);
  await d.exec(`select release_credit_reservation('${r}','test','release-test');`);
  assert.deepEqual({available:(await balance(d)).available,reserved:(await balance(d)).reserved},{available:500,reserved:0});
 }finally{await d.close();}
});
test('partial settlement/release allocation is conserved',async()=>{
 const d=await db();try{
  await intent(d);await pay(d);const r=await reserve(d,30);
  await d.exec(`select settle_credit_reservation_item('${r}',20,'text','settle-test','{}'); select release_credit_reservation('${r}','audio failed','release-test');`);
  assert.equal((await balance(d)).available,480);assert.equal((await balance(d)).reserved,0);
  assert.equal(Number((await one(d,`select sum(available) as n from credit_lots where user_id='${user}'`)).n),480);
 }finally{await d.close();}
});
test('partial refund is cumulative, idempotent, only affects purchased lot',async()=>{
 const d=await db();try{
  await d.exec(`select claim_starter_credits('${user}','${risk}');`);await intent(d);await pay(d);
  await d.exec(`select reverse_creem_payment('refund1','ord1',100,500,'refund'); select reverse_creem_payment('refund1','ord1',100,500,'refund');`);
  assert.equal((await balance(d)).available,500);assert.equal((await balance(d)).billingBlocked,false);
  await d.exec(`select reverse_creem_payment('refund2','ord1',500,500,'refund');`);
  assert.equal((await balance(d)).available,100);
 }finally{await d.close();}
});
test('refund before payment is applied; refunded reserve release stays removed',async()=>{
 const d=await db();try{
  await intent(d);await d.exec(`select reverse_creem_payment('refund-first','ord1',500,500,'refund');`);await pay(d);
  assert.equal((await balance(d)).available,0);
  await intent(d,'credits_500','44444444-4444-4444-8444-444444444444');await pay(d,'credits_500','ord2','44444444-4444-4444-8444-444444444444');const r=await reserve(d,20);
  await d.exec(`select reverse_creem_payment('refund-reserved','ord2',500,500,'refund'); select release_credit_reservation('${r}','test','release-test');`);
  assert.equal((await balance(d)).available,0);assert.equal((await balance(d)).reserved,0);assert.equal((await balance(d)).billingBlocked,true);
  await assert.rejects(reserve(d,12),/insufficient_credits|billing_account_blocked/);
 }finally{await d.close();}
});
test('checkout guard and subscription cancellation do not clear purchased credits',async()=>{
 const d=await db();try{
  await intent(d,'generation_monthly');
  const second=(await one(d,`select create_creem_checkout_intent('${user}','generation_monthly','44444444-4444-4444-8444-444444444444') as x`)).x;
  assert.equal(second.id,request);await pay(d,'generation_monthly');
  await d.exec(`select sync_creem_subscription('cancel',now(),'sub1','${user}','canceled');`);
  assert.equal((await balance(d)).available,1000);
  await assert.rejects(intent(d,'generation_monthly','55555555-5555-4555-8555-555555555555'),/subscription_already_exists/);
 }finally{await d.close();}
});
test('starter daily risk limit and unverified migration-era account do not receive free credits',async()=>{
 const d=await db();try{
  const users=[user,other,'55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
  for(const id of users.slice(2))await d.exec(`insert into auth.users(id,email,email_confirmed_at) values('${id}','${id}@example.test',now());`);
  for(const id of users.slice(0,3))await d.exec(`select claim_starter_credits('${id}','${risk}');`);
  await assert.rejects(d.exec(`select claim_starter_credits('${users[3]}','${risk}');`),/starter_daily_limit/);
  assert.equal(Number((await one(d,'select count(*) as n from credit_starter_claims')).n),3);
  await d.exec(`update credit_program_settings set starter_global_daily=3;`);
  await assert.rejects(d.exec(`select claim_starter_credits('${users[3]}','${'b'.repeat(64)}');`),/starter_daily_limit/);
 }finally{await d.close();}
});
test('helpers cannot be directly invoked by service_role and new tables have RLS',async()=>{
 const d=await db();try{
  for(const fn of ['expire_credit_lots(uuid)','settle_credit_lot_allocations(uuid,bigint)','release_credit_lot_allocations(uuid)','allocate_credit_reservation_lots()']){
   assert.equal((await one(d,`select has_function_privilege('service_role','public.${fn}','execute') as allowed`)).allowed,false,fn);
  }
  assert.equal((await one(d,`select bool_and(relrowsecurity) as enabled from pg_class where relname in ('credit_lots','credit_reservation_lots','creem_checkout_intents','creem_credit_payments','creem_payment_reversals','credit_starter_claims')`)).enabled,true);
 }finally{await d.close();}
});
test('legacy account balances and running reservations survive migration without new credits',async()=>{
 const d=await isolatedDatabase({includeAssets:true});try{
  await d.exec(`alter table auth.users add column created_at timestamptz not null default now(); alter table auth.users add column email_confirmed_at timestamptz;
   insert into auth.users(id,email,email_confirmed_at) values('${user}','legacy@example.test',now());
   select grant_credits('${user}',100,'legacy','test','legacy-grant','{}');`);
  const r=await reserve(d,30);await d.exec(`select settle_credit_reservation_item('${r}',20,'text','legacy-settle','{}');`);
  await d.exec(await readFile(new URL('../../../supabase/migrations/202611110006_creem_credit_lots.sql',import.meta.url),'utf8'));
  assert.equal((await balance(d)).available,70);assert.equal((await balance(d)).reserved,10);
  await d.exec(`select release_credit_reservation('${r}','test','legacy-release');`);
  assert.equal((await balance(d)).available,80);assert.equal((await balance(d)).reserved,0);
 }finally{await d.close();}
});
test('late old-period payment is immediately expired, no renewal duplicate or unauthorized owner',async()=>{
 const d=await db();try{
  await intent(d,'generation_monthly');
  await d.exec(`select fulfill_creem_payment('old','old','${user}','generation_monthly','${request}','sub1',now()-interval '2 months',now()-interval '1 month','cus1');`);
  assert.equal((await balance(d)).available,0);
  await pay(d,'generation_monthly','new');assert.equal((await balance(d)).available,1000);
  await assert.rejects(d.exec(`select sync_creem_subscription('bad',now(),'sub1','${other}','active');`),/subscription_owner_mismatch/);
 }finally{await d.close();}
});
test('full reversal after a partial settlement freezes new generation and removes releaseable credit',async()=>{
 const d=await db();try{
  await intent(d);await pay(d);const r=await reserve(d,30);
  await d.exec(`select settle_credit_reservation_item('${r}',20,'text','partial-before-refund','{}'); select reverse_creem_payment('ref','ord1',500,500,'dispute'); select release_credit_reservation('${r}','test','release-ref');`);
  assert.equal((await balance(d)).available,0);assert.equal((await balance(d)).reserved,0);assert.equal((await balance(d)).billingBlocked,true);
  await d.exec(`select grant_credits('${user}',200,'manual','test','new-unrelated');`);
  await assert.rejects(reserve(d,12),/billing_account_blocked/);
  assert.equal((await balance(d)).available,200);
 }finally{await d.close();}
});
test('refund of unused already-expired monthly credits does not freeze the account',async()=>{
 const d=await db();try{
  await intent(d,'generation_monthly');await pay(d,'generation_monthly');
  await d.exec(`update credit_lots set expires_at=now()-interval '1 second' where kind='monthly'; select get_credit_balance('${user}'); select reverse_creem_payment('refund-expired','ord1',600,600,'refund');`);
  assert.equal((await balance(d)).available,0);assert.equal((await balance(d)).billingBlocked,false);
 }finally{await d.close();}
});
test('one intent cannot bind multiple subscriptions; newer cancellation resists stale events',async()=>{
 const d=await db();try{
  await intent(d,'generation_monthly');await pay(d,'generation_monthly');
  await assert.rejects(d.exec(`select fulfill_creem_payment('second-sub','second-sub','${user}','generation_monthly','${request}','sub2',now(),now()+interval '1 month');`),/checkout_subscription_mismatch/);
  await d.exec(`select sync_creem_subscription('cancel-new',now(),'sub1','${user}','canceled'); select sync_creem_subscription('active-old',now()-interval '1 hour','sub1','${user}','active');`);
  assert.equal((await one(d,`select status from creem_subscriptions where provider_subscription_id='sub1'`)).status,'canceled');
  assert.equal((await balance(d)).available,1000);
 }finally{await d.close();}
});
test('pending remote checkout cannot expire locally and cause a second subscription',async()=>{
 const d=await db();try{
  await intent(d,'generation_monthly');
  await d.exec(`update creem_checkout_intents set expires_at=now()-interval '1 hour',provider_request_started_at=now() where id='${request}';`);
  const next=(await one(d,`select create_creem_checkout_intent('${user}','generation_monthly','44444444-4444-4444-8444-444444444444') as x`)).x;
  assert.equal(next.id,request);assert.equal(next.reused,true);
 }finally{await d.close();}
});
test('one-time pack pending checkout survives refresh but a completed order permits a new pack',async()=>{
 const d=await db();try{
  await intent(d);await d.exec(`update creem_checkout_intents set provider_request_started_at=now() where id='${request}';`);
  const next=(await one(d,`select create_creem_checkout_intent('${user}','credits_500','44444444-4444-4444-8444-444444444444') as x`)).x;
  assert.equal(next.id,request);await pay(d);
  const after=(await one(d,`select create_creem_checkout_intent('${user}','credits_500','44444444-4444-4444-8444-444444444444') as x`)).x;
  assert.equal(after.id,'44444444-4444-4444-8444-444444444444');assert.equal(after.reused,false);
 }finally{await d.close();}
});
