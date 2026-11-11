/** Real PostgreSQL sessions; run only against a fresh disposable inkquest_test DB. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

assert.ok(['127.0.0.1', '::1', 'localhost'].includes(process.env.PGHOST), 'PGHOST must explicitly name loopback');
assert.equal(process.env.PGDATABASE, 'inkquest_test', 'Only the disposable inkquest_test database is allowed');
assert.equal(process.env.PGUSER, 'postgres', 'Use the isolated service superuser');
assert.ok(process.env.PGPASSWORD, 'An explicit synthetic service password is required');
const sessions = new Set();
// Do not inherit connection services, production URLs, options, or password files.
const env = {PATH:process.env.PATH, PGHOST:process.env.PGHOST, PGPORT:process.env.PGPORT ?? '5432',
 PGDATABASE:'inkquest_test', PGUSER:'postgres', PGPASSWORD:process.env.PGPASSWORD,
 PGCONNECT_TIMEOUT:'5', PGOPTIONS:'-c statement_timeout=15000 -c idle_in_transaction_session_timeout=20000'};
const quote = x => `'${String(x).replaceAll("'", "''")}'`;
const value = x => x === null ? 'null' : typeof x === 'object' ? `${quote(JSON.stringify(x))}::jsonb` : typeof x === 'number' || typeof x === 'boolean' ? String(x) : quote(x);
const rpc = (name,args={}) => `select public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${value(v)}`).join(',')});`;
class Session {
 constructor(){
  this.name=`inkquest-test-${randomUUID()}`;this.out='';this.err='';this.dead=false;
  this.child=spawn('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:{...env,PGAPPNAME:this.name},stdio:['pipe','pipe','pipe']});
  sessions.add(this);this.child.stdout.on('data',d=>this.out+=d);this.child.stderr.on('data',d=>this.err+=d);
  this.child.stdin.on('error',e=>{this.err+=e.message;this.dead=true;});
  this.child.on('error',e=>{this.err+=e.message;this.dead=true;});this.child.on('close',()=>{this.dead=true;sessions.delete(this);});
 }
 async sql(sql){
  const marker=`DONE_${randomUUID()}`, start=this.out.length;
  this.child.stdin.write(`${sql}\n\\echo ${marker}\n`);
  const deadline=Date.now()+20000;
  while(!this.out.slice(start).includes(marker)){
   if(this.dead)throw new Error(this.err || 'psql exited');
   if(Date.now()>deadline)throw new Error(`psql command timed out: ${this.name}`);
   await delay(10);
  }
  return this.out.slice(start,this.out.indexOf(marker,start)).trim();
 }
 close(){this.child.stdin.end();this.child.kill();sessions.delete(this);}
}
async function sql(query){const s=new Session();try{return await s.sql(query);}finally{s.close();}}
async function json(query){return JSON.parse(await sql(query));}
const call=(name,args)=>json(rpc(name,args));
async function blockedBy(waiter,holder){
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){
  const blocked=await json(`select to_jsonb(exists(select 1 from pg_stat_activity w join pg_stat_activity h on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name=${quote(waiter.name)} and h.application_name=${quote(holder.name)} and w.wait_event_type='Lock'));`);
  if(blocked)return;
  if(waiter.dead)throw new Error(`Contender exited before lock barrier: ${waiter.err}`);
  await delay(20);
 }
 throw new Error('Expected PostgreSQL lock barrier was not observed');
}
// Execute first change but withhold COMMIT. Prove the second connection is waiting
// on the first transaction before release. No sleep-based ordering assumptions.
async function overlap(firstSQL,secondSQL){
 const a=new Session(),b=new Session();
 try{
  const first=await a.sql(`begin; ${firstSQL}`);
  const pending=b.sql(secondSQL).then(result=>({ok:true,result}),error=>({ok:false,error}));
  await blockedBy(b,a);await a.sql('commit;');
  return {first,second:await pending};
 }finally{a.close();b.close();}
}
const passed=[];
async function check(name,fn){await fn();passed.push(name);console.log(JSON.stringify({test:name,status:'passed'}));}

// Runs after postgres-concurrency.mjs in the same disposable service database.
// There is deliberately no connection URL / credential fallback.
async function fixture(product='credits_500'){
 const user=randomUUID(),request=randomUUID(),order=randomUUID(),subscription=randomUUID();
 await sql(`insert into auth.users(id,email,email_confirmed_at) values(${quote(user)},'synthetic@example.test',now());`);
 const intent=rpc('create_creem_checkout_intent',{p_user_id:user,p_product_code:product,p_request_id:request});
 await sql(intent);
 const payment={p_event_id:randomUUID(),p_order_id:order,p_user_id:user,p_product_code:product,p_request_id:request,
  ...(product==='generation_monthly'?{p_subscription_id:subscription,p_period_start:'2026-11-11T00:00:00Z',p_period_end:'2026-12-11T00:00:00Z'}:{})};
 // Use live test server date rather than a fixed development date.
 if(product==='generation_monthly'){
  const times=await json(`select jsonb_build_object('start',now(),'end',now()+interval '1 month');`);
  payment.p_period_start=times.start;payment.p_period_end=times.end;
 }
 const reserve=(key=randomUUID(),amount=20)=>`select row_to_json(x) from public.create_generated_story_job(${quote(user)},'en','B1','Synthetic concurrency story','off',${amount},'test',${quote(key)},'[]','{}') x;`;
 const balance=()=>call('get_credit_balance',{p_user_id:user});
 return {user,request,order,subscription,payment,pay:rpc('fulfill_creem_payment',payment),intent,reserve,balance,
 reverse:rpc('reverse_creem_payment',{p_event_id:randomUUID(),p_order_id:order,p_refunded_amount:product==='generation_monthly'?600:500,p_paid_amount:product==='generation_monthly'?600:500})};
}
async function invariants(user){
 assert.equal(await json(`select to_jsonb(a.available=coalesce((select sum(available) from credit_lots where user_id=a.user_id),0) and a.reserved=coalesce((select sum(reserved) from credit_lots where user_id=a.user_id),0)) from credit_accounts a where user_id=${quote(user)};`),true);
 assert.equal(await json(`select to_jsonb(not exists(select 1 from credit_lots l where user_id=${quote(user)} and l.reserved<>coalesce((select sum(amount-settled-released) from credit_reservation_lots where lot_id=l.id),0)));`),true);
}
try{
 assert.equal(await json(`select to_jsonb(current_database()='inkquest_test' and session_user='postgres');`),true);
 assert.equal(await json(`select to_jsonb(to_regclass('public.generation_enrichment_jobs') is not null and to_regclass('public.credit_lots') is null);`),true,'Run after old isolated concurrency suite, before this migration');
 await sql(`alter table auth.users add column created_at timestamptz not null default now(); alter table auth.users add column email_confirmed_at timestamptz;`);
 await sql(await readFile(new URL('../../../supabase/migrations/202611110006_creem_credit_lots.sql',import.meta.url),'utf8'));
 await check('Creem simultaneous same-order fulfillment grants once',async()=>{
  const f=await fixture();const {second}=await overlap(f.pay,f.pay);assert.equal(second.ok,true,second.error?.message);
  assert.equal((await f.balance()).available,500);await invariants(f.user);
 });
 await check('Creem same-period different-event replay grants once',async()=>{
  const f=await fixture('generation_monthly');const secondPay=rpc('fulfill_creem_payment',{...f.payment,p_event_id:randomUUID()});
  const {second}=await overlap(f.pay,secondPay);assert.equal(second.ok,true,second.error?.message);
  assert.equal((await f.balance()).available,1000);await invariants(f.user);
 });
 await check('Starter parallel requests grant once',async()=>{
  const f=await fixture();const claim=rpc('claim_starter_credits',{p_user_id:f.user,p_risk_key:'a'.repeat(64)});
  const {second}=await overlap(claim,claim);assert.equal(second.ok,true,second.error?.message);
  assert.equal((await f.balance()).available,100);await invariants(f.user);
 });
 await check('Parallel monthly checkout requests return one intent',async()=>{
  const f=await fixture('generation_monthly');
  const a=rpc('create_creem_checkout_intent',{p_user_id:f.user,p_product_code:'generation_monthly',p_request_id:randomUUID()});
  const b=rpc('create_creem_checkout_intent',{p_user_id:f.user,p_product_code:'generation_monthly',p_request_id:randomUUID()});
  const result=await overlap(a,b);assert.equal(result.second.ok,true,result.second.error?.message);
  assert.equal(JSON.parse(result.first).id,f.request);assert.equal(JSON.parse(result.second.result).id,f.request);
 });
 for(const refundFirst of [true,false])await check(`Refund vs payment ${refundFirst?'refund first':'payment first'} is atomic`,async()=>{
  const f=await fixture();const {second}=await overlap(refundFirst?f.reverse:f.pay,refundFirst?f.pay:f.reverse);
  assert.equal(second.ok,true,second.error?.message);assert.equal((await f.balance()).available,0);await invariants(f.user);
 });
 for(const refundFirst of [true,false])await check(`Refund vs settlement ${refundFirst?'refund first':'settlement first'} preserves reservations`,async()=>{
  const f=await fixture();await sql(f.pay);const reservation=(await json(f.reserve())).reservation_id;
  const settle=rpc('settle_credit_reservation_item',{p_reservation_id:reservation,p_amount:20,p_line_item:'text',p_idempotency_key:randomUUID()});
  const {second}=await overlap(refundFirst?f.reverse:settle,refundFirst?settle:f.reverse);
  assert.equal(second.ok,true,second.error?.message);const b=await f.balance();assert.equal(b.available,0);assert.equal(b.reserved,0);assert.equal(b.billingBlocked,true);await invariants(f.user);
 });
 await check('Expiry vs release cannot resurrect monthly credits',async()=>{
  const f=await fixture('generation_monthly');await sql(f.pay);const reservation=(await json(f.reserve())).reservation_id;
  const expiry=`update credit_lots set expires_at=now()-interval '1 second' where user_id=${quote(f.user)}; ${rpc('get_credit_balance',{p_user_id:f.user})}`;
  const release=rpc('release_credit_reservation',{p_reservation_id:reservation,p_reason:'test',p_idempotency_key:randomUUID()});
  const {second}=await overlap(expiry,release);assert.equal(second.ok,true,second.error?.message);
  assert.equal((await f.balance()).available,0);assert.equal((await f.balance()).reserved,0);await invariants(f.user);
 });
 console.log(JSON.stringify({suite:'creem-postgres-concurrency',status:'passed',tests:passed.length}));
}catch(error){console.error(JSON.stringify({suite:'creem-postgres-concurrency',status:'failed',completed:passed,error:error.message}));process.exitCode=1;}
finally{for(const s of sessions)s.close();}
