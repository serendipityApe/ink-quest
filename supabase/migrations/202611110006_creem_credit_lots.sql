begin;

-- Existing balances are retained. New monthly grants expire independently of
-- purchased packs; money never moves through these functions.
create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null unique,
  kind text not null check (kind in ('legacy','starter','monthly','topup','grant')),
  original_amount bigint not null check(original_amount > 0),
  available bigint not null check(available >= 0),
  reserved bigint not null default 0 check(reserved >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_pending bigint not null default 0 check(revoked_pending>=0),
  expired_credits bigint not null default 0 check(expired_credits>=0),
  reversed_expired bigint not null default 0 check(reversed_expired>=0),
  created_at timestamptz not null default now(),
  check (available + reserved <= original_amount),
  check (revoked_pending <= reserved)
);
create index credit_lots_user_expiry_idx on public.credit_lots(user_id, expires_at);
create table public.credit_reservation_lots (
  reservation_id uuid not null references public.credit_reservations(id) on delete cascade,
  lot_id uuid not null references public.credit_lots(id),
  amount bigint not null check(amount > 0),
  settled bigint not null default 0 check(settled >= 0),
  released bigint not null default 0 check(released >= 0),
  primary key(reservation_id,lot_id),
  check(settled + released <= amount)
);
alter table public.credit_accounts add column billing_blocked boolean not null default false;

-- One synthetic non-expiring lot per old account, including already reserved
-- amounts. This does not change credit_accounts or any existing ledger balance.
insert into public.credit_lots(user_id,source_key,kind,original_amount,available,reserved)
select user_id,'legacy:'||user_id,'legacy',available+reserved,available,reserved
from public.credit_accounts where available+reserved>0;
insert into public.credit_reservation_lots(reservation_id,lot_id,amount)
select r.id,l.id,r.quoted_amount-r.settled_amount from public.credit_reservations r
join public.credit_lots l on l.source_key='legacy:'||r.user_id
where r.status in ('reserved','partially_settled') and r.quoted_amount>r.settled_amount;

do $$ begin
 if exists(select 1 from public.credit_accounts a where a.reserved <> coalesce((select sum(l.reserved) from public.credit_lots l where l.user_id=a.user_id),0))
 or exists(select 1 from public.credit_lots l where l.reserved <> coalesce((select sum(r.amount-r.settled-r.released) from public.credit_reservation_lots r where r.lot_id=l.id),0))
 then raise exception 'legacy_credit_invariant_failed'; end if;
end $$;

create table public.credit_program_settings (
  singleton boolean primary key default true check(singleton),
  starter_eligible_from timestamptz not null default now(),
  starter_per_risk_daily integer not null default 3 check(starter_per_risk_daily>0),
  starter_global_daily integer not null default 100 check(starter_global_daily>0)
);
insert into public.credit_program_settings default values;
create table public.credit_starter_claims (
 user_id uuid primary key references auth.users(id) on delete cascade,
 risk_key text not null,
 claimed_at timestamptz not null default now()
);
create table public.creem_checkout_intents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 product_code text not null check(product_code in ('generation_monthly','credits_500')),
 provider_checkout_id text unique,
 bound_subscription_id text unique,
 provider_checkout_url text,
 provider_request_started_at timestamptz,
 expires_at timestamptz not null default (now()+interval '30 minutes'),
 status text not null default 'pending' check(status in ('pending','completed','expired')),
 created_at timestamptz not null default now()
);
create table public.creem_subscriptions (
 provider_subscription_id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 product_code text not null check(product_code='generation_monthly'),
 status text not null,
 current_period_start timestamptz,
 current_period_end timestamptz,
 provider_event_at timestamptz not null,
 provider_customer_id text,
 updated_at timestamptz not null default now()
);
create table public.creem_credit_payments (
 provider_order_id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 product_code text not null check(product_code in ('generation_monthly','credits_500')),
 provider_subscription_id text,
 period_start timestamptz,
 period_end timestamptz,
 lot_id uuid references public.credit_lots(id),
 status text not null default 'paid' check(status in ('paid','reversed','partially_reversed')),
 reversed_credits bigint not null default 0 check(reversed_credits>=0),
 created_at timestamptz not null default now(),
 unique(provider_subscription_id,period_start)
);
create table public.creem_payment_reversals (
 provider_order_id text primary key,
 refunded_amount bigint not null check(refunded_amount>0),
 paid_amount bigint not null check(paid_amount>0),
 reason text not null,
 event_id text not null,
 updated_at timestamptz not null default now(),
 check(refunded_amount<=paid_amount)
);
create table public.creem_processed_events (
 event_id text primary key,
 event_type text not null,
 processed_at timestamptz not null default now()
);

create or replace function public.expire_credit_lots(p_user_id uuid)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lot record; v_balance bigint;
begin
 insert into credit_accounts(user_id) values(p_user_id) on conflict do nothing;
 perform 1 from credit_accounts where user_id=p_user_id for update;
 for v_lot in select * from credit_lots where user_id=p_user_id and available>0
   and (expires_at<=now() or revoked_at is not null) order by id for update loop
  update credit_lots set available=0,expired_credits=expired_credits+available where id=v_lot.id;
  update credit_accounts set available=available-v_lot.available,version=version+1,updated_at=now()
    where user_id=p_user_id returning available into v_balance;
  insert into credit_ledger(user_id,entry_type,amount,balance_after,source_type,source_id,idempotency_key)
    values(p_user_id,'expire',-v_lot.available,v_balance,'credit_lot',v_lot.id::text,'lot-expire:'||v_lot.id);
 end loop;
 select available into v_balance from credit_accounts where user_id=p_user_id;
 return v_balance;
end $$;

create or replace function public.get_credit_balance(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_balance bigint; v_reserved bigint; v_blocked boolean;
begin
 v_balance:=expire_credit_lots(p_user_id);
 select reserved,billing_blocked into v_reserved,v_blocked from credit_accounts where user_id=p_user_id;
 return jsonb_build_object('available',v_balance,'reserved',v_reserved,'billingBlocked',v_blocked,
 'monthly',coalesce((select sum(available) from credit_lots where user_id=p_user_id and kind='monthly'),0),
 'purchased',coalesce((select sum(available) from credit_lots where user_id=p_user_id and kind='topup'),0),
 'permanent',coalesce((select sum(available) from credit_lots where user_id=p_user_id and kind<>'monthly'),0),
 'nextExpiry',(select min(expires_at) from credit_lots where user_id=p_user_id and available>0),
 'starterClaimed',exists(select 1 from credit_starter_claims where user_id=p_user_id),
 'starterEligible',exists(select 1 from auth.users u cross join credit_program_settings p where u.id=p_user_id and u.created_at>=p.starter_eligible_from and u.email_confirmed_at is not null and not exists(select 1 from credit_starter_claims c where c.user_id=p_user_id)));
end $$;

create or replace function public.grant_credits(
 p_user_id uuid,p_amount bigint,p_source_type text,p_source_id text,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_balance bigint; v_kind text; v_expiry timestamptz; v_existing record;
begin
 if p_amount<=0 then raise exception 'credit_amount_must_be_positive'; end if;
 insert into credit_accounts(user_id) values(p_user_id) on conflict do nothing;
 perform 1 from credit_accounts where user_id=p_user_id for update;
 select * into v_existing from credit_ledger where idempotency_key=p_idempotency_key;
 if found then
   if v_existing.user_id<>p_user_id or v_existing.amount<>p_amount then raise exception 'grant_idempotency_mismatch'; end if;
   select available into v_balance from credit_accounts where user_id=p_user_id;
   return v_balance;
 end if;
 v_kind:=case when p_source_type='creem_monthly' then 'monthly' when p_source_type='creem_topup' then 'topup' when p_source_type='starter' then 'starter' else 'grant' end;
 if v_kind='monthly' then
   v_expiry:=(p_metadata->>'expires_at')::timestamptz;
   if v_expiry is null then raise exception 'monthly_expiry_required'; end if;
 end if;
 insert into credit_lots(user_id,source_key,kind,original_amount,available,expires_at)
 values(p_user_id,p_idempotency_key,v_kind,p_amount,p_amount,v_expiry);
 update credit_accounts set available=available+p_amount,version=version+1,updated_at=now()
 where user_id=p_user_id returning available into v_balance;
 insert into credit_ledger(user_id,entry_type,amount,balance_after,source_type,source_id,idempotency_key,metadata)
 values(p_user_id,'grant',p_amount,v_balance,p_source_type,p_source_id,p_idempotency_key,p_metadata);
 return expire_credit_lots(p_user_id);
end $$;

create or replace function public.claim_starter_credits(p_user_id uuid,p_risk_key text)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_created timestamptz; v_confirmed timestamptz; v_claimed uuid; v_settings credit_program_settings%rowtype;
begin
 select created_at,email_confirmed_at into v_created,v_confirmed from auth.users where id=p_user_id;
 if not found then raise exception 'user_not_found'; end if;
 if v_confirmed is null then raise exception 'email_verification_required'; end if;
 if v_created<(select starter_eligible_from from credit_program_settings where singleton) then
   raise exception 'starter_ineligible';
 end if;
 insert into credit_accounts(user_id) values(p_user_id) on conflict do nothing;
 perform 1 from credit_accounts where user_id=p_user_id for update;
 if exists(select 1 from credit_starter_claims where user_id=p_user_id) then return expire_credit_lots(p_user_id); end if;
 if p_risk_key is null or p_risk_key !~ '^[0-9a-f]{64}$' then raise exception 'starter_risk_key_required'; end if;
 select * into v_settings from credit_program_settings where singleton for update;
 if (select count(*) from credit_starter_claims where claimed_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=v_settings.starter_global_daily
 or (select count(*) from credit_starter_claims where risk_key=p_risk_key and claimed_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=v_settings.starter_per_risk_daily then raise exception 'starter_daily_limit'; end if;
 insert into credit_starter_claims(user_id,risk_key) values(p_user_id,p_risk_key) on conflict do nothing returning user_id into v_claimed;
 if v_claimed is not null then
   return grant_credits(p_user_id,100,'starter',p_user_id::text,'starter:'||p_user_id);
 end if;
 return expire_credit_lots(p_user_id);
end $$;

-- Runs inside all existing generation reservation RPCs. It also rejects stale
-- balances observed before expiry, so callers cannot spend expired monthly lots.
create or replace function public.allocate_credit_reservation_lots()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_balance bigint; v_left bigint; v_take bigint; v_lot record;
begin
 v_balance:=expire_credit_lots(new.user_id);
 if (select billing_blocked from credit_accounts where user_id=new.user_id) then raise exception 'billing_account_blocked'; end if;
 if v_balance<new.quoted_amount then raise exception 'insufficient_credits'; end if;
 v_left:=new.quoted_amount;
 for v_lot in select * from credit_lots where user_id=new.user_id and available>0 and revoked_at is null
   and (expires_at is null or expires_at>now()) order by expires_at nulls last,created_at,id for update loop
  v_take:=least(v_left,v_lot.available);
  update credit_lots set available=available-v_take,reserved=reserved+v_take where id=v_lot.id;
  insert into credit_reservation_lots(reservation_id,lot_id,amount) values(new.id,v_lot.id,v_take);
  v_left:=v_left-v_take;
  exit when v_left=0;
 end loop;
 if v_left<>0 then raise exception 'credit_lot_invariant_failed'; end if;
 return new;
end $$;
create trigger allocate_credit_reservation_lots after insert on public.credit_reservations
for each row execute function public.allocate_credit_reservation_lots();

create or replace function public.settle_credit_lot_allocations(p_reservation_id uuid,p_amount bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_allocation record; v_left bigint:=p_amount; v_take bigint;
begin
 for v_allocation in select a.* from credit_reservation_lots a join credit_lots l on l.id=a.lot_id
 where a.reservation_id=p_reservation_id and a.amount>a.settled+a.released
 order by l.expires_at nulls last,l.created_at,l.id for update of a loop
  v_take:=least(v_left,v_allocation.amount-v_allocation.settled-v_allocation.released);
  update credit_reservation_lots set settled=settled+v_take where reservation_id=p_reservation_id and lot_id=v_allocation.lot_id;
  update credit_lots set reserved=reserved-v_take,revoked_pending=greatest(0,revoked_pending-v_take) where id=v_allocation.lot_id;
  v_left:=v_left-v_take;
  exit when v_left=0;
 end loop;
 if v_left<>0 then raise exception 'credit_lot_settlement_invariant_failed'; end if;
end $$;

create or replace function public.release_credit_lot_allocations(p_reservation_id uuid)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_allocation record; v_amount bigint; v_return bigint:=0; v_restore bigint; v_withheld bigint;
begin
 for v_allocation in select a.*,l.expires_at,l.revoked_at,l.revoked_pending from credit_reservation_lots a join credit_lots l on l.id=a.lot_id
 where a.reservation_id=p_reservation_id and a.amount>a.settled+a.released order by l.id for update of a,l loop
  v_amount:=v_allocation.amount-v_allocation.settled-v_allocation.released;
  v_withheld:=least(v_amount,v_allocation.revoked_pending);
  v_restore:=case when v_allocation.revoked_at is null and (v_allocation.expires_at is null or v_allocation.expires_at>now()) then v_amount-v_withheld else 0 end;
  update credit_reservation_lots set released=released+v_amount where reservation_id=p_reservation_id and lot_id=v_allocation.lot_id;
  update credit_lots set reserved=reserved-v_amount,revoked_pending=revoked_pending-v_withheld,available=available+v_restore,
    expired_credits=expired_credits+v_amount-v_withheld-v_restore where id=v_allocation.lot_id;
  v_return:=v_return+v_restore;
 end loop;
 return v_return;
end $$;

create or replace function public.release_credit_reservation(
  p_reservation_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.credit_reservations%rowtype;
  v_release bigint;
  v_restored bigint;
  v_balance bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_reservation_id::text, 0));
  select * into v_reservation from public.credit_reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_reservation.status in ('released', 'expired', 'settled') then
    select available into v_balance from public.credit_accounts where user_id = v_reservation.user_id;
    return v_balance;
  end if;

  v_release := v_reservation.quoted_amount - v_reservation.settled_amount;
  if v_release <= 0 then raise exception 'reservation_has_no_releasable_credits'; end if;

  if not exists (
    select 1 from public.credit_accounts
    where user_id = v_reservation.user_id and reserved >= v_release
    for update
  ) then
    raise exception 'credit_account_reservation_invariant_failed';
  end if;

  v_restored := public.release_credit_lot_allocations(p_reservation_id);

  update public.credit_accounts
  set available = available + v_restored,
      reserved = reserved - v_release,
      version = version + 1,
      updated_at = now()
  where user_id = v_reservation.user_id
  returning available into v_balance;

  update public.credit_reservations
  set status = 'released', updated_at = now()
  where id = p_reservation_id;

  insert into public.credit_ledger (
    user_id, reservation_id, entry_type, amount, balance_after, source_type, source_id, idempotency_key, metadata
  ) values (
    v_reservation.user_id, p_reservation_id, 'release', v_restored, v_balance,
    'generation', p_reservation_id::text, p_idempotency_key, jsonb_build_object('reason', p_reason, 'expired_or_revoked', v_release-v_restored)
  ) on conflict (idempotency_key) do nothing;

  return v_balance;
end;
$$;

create or replace function public.settle_credit_reservation_item(
  p_reservation_id uuid,
  p_amount bigint,
  p_line_item text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.credit_reservations%rowtype;
  v_balance bigint;
  v_new_settled bigint;
begin
  if p_amount <= 0 then raise exception 'settlement_amount_must_be_positive'; end if;
  if length(trim(p_line_item)) = 0 then raise exception 'settlement_line_item_required'; end if;
  if length(trim(p_idempotency_key)) < 8 then raise exception 'invalid_idempotency_key'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_reservation_id::text, 0));

  select balance_after into v_balance
  from public.credit_ledger
  where idempotency_key = p_idempotency_key;
  if found then return v_balance; end if;

  select * into v_reservation
  from public.credit_reservations
  where id = p_reservation_id
  for update;

  if not found then raise exception 'reservation_not_found'; end if;
  if v_reservation.status in ('released', 'expired', 'settled') then
    raise exception 'reservation_not_settleable';
  end if;
  if v_reservation.settled_amount + p_amount > v_reservation.quoted_amount then
    raise exception 'settlement_exceeds_quote';
  end if;

  if not exists (
    select 1 from public.credit_accounts
    where user_id = v_reservation.user_id and reserved >= p_amount
    for update
  ) then
    raise exception 'credit_account_reservation_invariant_failed';
  end if;

  perform public.settle_credit_lot_allocations(p_reservation_id, p_amount);

  update public.credit_accounts
  set reserved = reserved - p_amount,
      version = version + 1,
      updated_at = now()
  where user_id = v_reservation.user_id
  returning available into v_balance;

  v_new_settled := v_reservation.settled_amount + p_amount;
  update public.credit_reservations
  set settled_amount = v_new_settled,
      status = case when v_new_settled = quoted_amount then 'settled' else 'partially_settled' end,
      updated_at = now()
  where id = p_reservation_id;

  insert into public.credit_ledger (
    user_id, reservation_id, entry_type, amount, balance_after, source_type, source_id, idempotency_key, metadata
  ) values (
    v_reservation.user_id, p_reservation_id, 'settle', -p_amount, v_balance,
    'generation', p_reservation_id::text, p_idempotency_key,
    p_metadata || jsonb_build_object('line_item', p_line_item)
  );

  return v_balance;
end;
$$;


create or replace function public.fulfill_creem_payment(
 p_event_id text,p_order_id text,p_user_id uuid,p_product_code text,
 p_request_id uuid default null,p_subscription_id text default null,
 p_period_start timestamptz default null,p_period_end timestamptz default null,
 p_customer_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_intent creem_checkout_intents%rowtype; v_subscription creem_subscriptions%rowtype;
 v_payment creem_credit_payments%rowtype; v_amount bigint; v_key text; v_lot uuid;
begin
 if coalesce(length(p_event_id),0)=0 or coalesce(length(p_order_id),0)=0 then raise exception 'payment_identity_required'; end if;
 if p_product_code not in ('generation_monthly','credits_500') then raise exception 'unknown_product'; end if;
 perform pg_advisory_xact_lock(hashtextextended('creem-order:'||p_order_id,0));
 if p_subscription_id is not null then perform pg_advisory_xact_lock(hashtextextended('creem-sub:'||p_subscription_id,0)); end if;
 insert into credit_accounts(user_id) values(p_user_id) on conflict do nothing;
 perform 1 from credit_accounts where user_id=p_user_id for update;
 if p_request_id is not null then
  select * into v_intent from creem_checkout_intents where id=p_request_id for update;
  if not found or v_intent.user_id<>p_user_id or v_intent.product_code<>p_product_code then raise exception 'checkout_intent_mismatch'; end if;
  if p_product_code='generation_monthly' then
   if p_subscription_id is null or (v_intent.bound_subscription_id is not null and v_intent.bound_subscription_id<>p_subscription_id) then raise exception 'checkout_subscription_mismatch'; end if;
   update creem_checkout_intents set bound_subscription_id=p_subscription_id where id=p_request_id;
  end if;
 elsif p_product_code='generation_monthly' then
  select * into v_subscription from creem_subscriptions where provider_subscription_id=p_subscription_id for update;
  if not found or v_subscription.user_id<>p_user_id or v_subscription.product_code<>p_product_code then raise exception 'subscription_binding_missing'; end if;
 else raise exception 'checkout_intent_required'; end if;
 select * into v_payment from creem_credit_payments where provider_order_id=p_order_id;
 if found then
  if v_payment.user_id<>p_user_id or v_payment.product_code<>p_product_code then raise exception 'payment_binding_mismatch'; end if;
  insert into creem_processed_events(event_id,event_type) values(p_event_id,'payment') on conflict do nothing;
  return jsonb_build_object('reused',true,'balance',get_credit_balance(p_user_id));
 end if;
 if p_product_code='generation_monthly' then
  if p_subscription_id is null or p_period_start is null or p_period_end is null or p_period_end<=p_period_start
    or p_period_end-p_period_start>interval '40 days' or p_period_start>now()+interval '1 day'
  then raise exception 'invalid_subscription_period'; end if;
  select * into v_subscription from creem_subscriptions where provider_subscription_id=p_subscription_id;
  if found and v_subscription.user_id<>p_user_id then raise exception 'subscription_owner_mismatch'; end if;
  insert into creem_subscriptions(provider_subscription_id,user_id,product_code,status,current_period_start,current_period_end,provider_event_at,provider_customer_id)
  values(p_subscription_id,p_user_id,p_product_code,'active',p_period_start,p_period_end,p_period_start,p_customer_id)
  on conflict(provider_subscription_id) do update set
   current_period_start=greatest(creem_subscriptions.current_period_start,excluded.current_period_start),
   current_period_end=greatest(creem_subscriptions.current_period_end,excluded.current_period_end),
   provider_customer_id=coalesce(creem_subscriptions.provider_customer_id,excluded.provider_customer_id),updated_at=now();
  select * into v_payment from creem_credit_payments where provider_subscription_id=p_subscription_id and period_start=p_period_start;
  if found then
   if v_payment.user_id<>p_user_id then raise exception 'subscription_payment_mismatch'; end if;
   raise exception 'duplicate_period_different_order';
  end if;
  v_amount:=1000; v_key:='creem-monthly:'||p_subscription_id||':'||extract(epoch from p_period_start)::text;
 else
  if p_subscription_id is not null then raise exception 'topup_has_subscription'; end if;
  if v_intent.status='completed' then raise exception 'checkout_already_consumed'; end if;
  v_amount:=500; v_key:='creem-order:'||p_order_id;
 end if;
 perform grant_credits(p_user_id,v_amount,case when p_product_code='generation_monthly' then 'creem_monthly' else 'creem_topup' end,
  p_order_id,v_key,jsonb_build_object('expires_at',case when p_product_code='generation_monthly' then p_period_end else null end));
 select id into v_lot from credit_lots where source_key=v_key;
 insert into creem_credit_payments(provider_order_id,user_id,product_code,provider_subscription_id,period_start,period_end,lot_id)
 values(p_order_id,p_user_id,p_product_code,p_subscription_id,p_period_start,p_period_end,v_lot);
 if p_request_id is not null then update creem_checkout_intents set status='completed' where id=p_request_id; end if;
 perform reverse_creem_payment(r.event_id,r.provider_order_id,r.refunded_amount,r.paid_amount,r.reason) from creem_payment_reversals r where r.provider_order_id=p_order_id;
 insert into creem_processed_events(event_id,event_type) values(p_event_id,'payment') on conflict do nothing;
 return jsonb_build_object('reused',false,'balance',get_credit_balance(p_user_id));
end $$;

create or replace function public.sync_creem_subscription(
 p_event_id text,p_event_at timestamptz,p_subscription_id text,p_user_id uuid,p_status text,
 p_request_id uuid default null,p_period_start timestamptz default null,p_period_end timestamptz default null,p_customer_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing creem_subscriptions%rowtype; v_intent creem_checkout_intents%rowtype;
begin
 if p_event_at is null or p_subscription_id is null or p_event_id is null then raise exception 'subscription_event_identity_required'; end if;
 if p_status not in ('active','trialing','canceled','unpaid','paused','expired','past_due','scheduled_cancel') then raise exception 'invalid_subscription_status'; end if;
 perform pg_advisory_xact_lock(hashtextextended('creem-sub:'||p_subscription_id,0));
 select * into v_existing from creem_subscriptions where provider_subscription_id=p_subscription_id for update;
 if found then
  if v_existing.user_id<>p_user_id then raise exception 'subscription_owner_mismatch'; end if;
  if v_existing.provider_event_at>p_event_at or (v_existing.provider_event_at=p_event_at and v_existing.status in ('canceled','expired','scheduled_cancel') and p_status in ('active','trialing')) then return jsonb_build_object('stale',true); end if;
 else
  select * into v_intent from creem_checkout_intents where id=p_request_id for update;
  if not found or v_intent.user_id<>p_user_id or v_intent.product_code<>'generation_monthly' then raise exception 'subscription_binding_missing'; end if;
  if v_intent.bound_subscription_id is not null and v_intent.bound_subscription_id<>p_subscription_id then raise exception 'checkout_subscription_mismatch'; end if;
  update creem_checkout_intents set bound_subscription_id=p_subscription_id where id=p_request_id;
 end if;
 insert into creem_subscriptions(provider_subscription_id,user_id,product_code,status,current_period_start,current_period_end,provider_event_at,provider_customer_id)
 values(p_subscription_id,p_user_id,'generation_monthly',p_status,p_period_start,p_period_end,p_event_at,p_customer_id)
 on conflict(provider_subscription_id) do update set status=excluded.status,
  current_period_start=coalesce(excluded.current_period_start,creem_subscriptions.current_period_start),
  current_period_end=coalesce(excluded.current_period_end,creem_subscriptions.current_period_end),
  provider_event_at=excluded.provider_event_at,provider_customer_id=coalesce(excluded.provider_customer_id,creem_subscriptions.provider_customer_id),updated_at=now();
 insert into creem_processed_events(event_id,event_type) values(p_event_id,'subscription') on conflict do nothing;
 return jsonb_build_object('stale',false);
end $$;

-- Called after a provider-confirmed refund/dispute, never to initiate a refund.
-- Unspent grant is removed; spent or in-flight credit freezes new generation
-- until reviewed, without altering completed stories or other purchased lots.
create or replace function public.reverse_creem_payment(
 p_event_id text,p_order_id text,p_refunded_amount bigint,p_paid_amount bigint,p_reason text default 'refund'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_payment creem_credit_payments%rowtype; v_lot credit_lots%rowtype; v_target bigint; v_delta bigint;
 v_remove bigint; v_pending bigint; v_expired bigint; v_unfunded bigint; v_balance bigint; v_reversal creem_payment_reversals%rowtype;
begin
 if p_event_id is null or p_order_id is null or p_refunded_amount is null or p_paid_amount is null
 or p_refunded_amount<=0 or p_paid_amount<=0 or p_refunded_amount>p_paid_amount then raise exception 'invalid_reversal_amount'; end if;
 perform pg_advisory_xact_lock(hashtextextended('creem-order:'||p_order_id,0));
 select * into v_reversal from creem_payment_reversals where provider_order_id=p_order_id for update;
 if found and v_reversal.paid_amount<>p_paid_amount then raise exception 'reversal_paid_amount_mismatch'; end if;
 insert into creem_payment_reversals(provider_order_id,refunded_amount,paid_amount,reason,event_id)
 values(p_order_id,p_refunded_amount,p_paid_amount,p_reason,p_event_id)
 on conflict(provider_order_id) do update set refunded_amount=greatest(creem_payment_reversals.refunded_amount,excluded.refunded_amount),
 reason=excluded.reason,event_id=excluded.event_id,updated_at=now() returning * into v_reversal;
 select * into v_payment from creem_credit_payments where provider_order_id=p_order_id for update;
 if not found then
  insert into creem_processed_events(event_id,event_type) values(p_event_id,'reversal') on conflict do nothing;
  return jsonb_build_object('deferred',true);
 end if;
 perform 1 from credit_accounts where user_id=v_payment.user_id for update;
 select * into v_lot from credit_lots where id=v_payment.lot_id for update;
 v_target:=ceil(v_lot.original_amount::numeric*v_reversal.refunded_amount/v_reversal.paid_amount)::bigint;
 v_delta:=v_target-v_payment.reversed_credits;
 if v_delta<=0 then return jsonb_build_object('reused',true); end if;
 v_remove:=least(v_delta,v_lot.available);
 v_expired:=least(v_delta-v_remove,v_lot.expired_credits-v_lot.reversed_expired);
 v_unfunded:=v_delta-v_remove-v_expired;
 v_pending:=least(v_unfunded,v_lot.reserved-v_lot.revoked_pending);
 update credit_lots set available=available-v_remove,revoked_pending=revoked_pending+v_pending,reversed_expired=reversed_expired+v_expired,
 revoked_at=case when v_target=original_amount then coalesce(revoked_at,now()) else revoked_at end where id=v_lot.id;
 update credit_accounts set available=available-v_remove,version=version+1,updated_at=now(),
 billing_blocked=billing_blocked or v_unfunded>0 where user_id=v_payment.user_id returning available into v_balance;
 insert into credit_ledger(user_id,entry_type,amount,balance_after,source_type,source_id,idempotency_key,metadata)
 values(v_payment.user_id,'adjustment',-v_remove,v_balance,'creem_reversal',p_order_id,
 'creem-reversal:'||p_order_id||':'||v_target,jsonb_build_object('reversedCredits',v_delta,'pendingCredits',v_pending,'reviewRequired',v_unfunded>0));
 update creem_credit_payments set status=case when v_target=v_lot.original_amount then 'reversed' else 'partially_reversed' end,
 reversed_credits=v_target where provider_order_id=p_order_id;
 insert into creem_processed_events(event_id,event_type) values(p_event_id,'reversal') on conflict do nothing;
 return jsonb_build_object('reused',false,'reviewRequired',v_unfunded>0);
end $$;

create or replace function public.create_creem_checkout_intent(p_user_id uuid,p_product_code text,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_intent creem_checkout_intents%rowtype;
begin
 if p_product_code not in ('generation_monthly','credits_500') then raise exception 'unknown_product'; end if;
 insert into credit_accounts(user_id) values(p_user_id) on conflict do nothing;
 perform 1 from credit_accounts where user_id=p_user_id for update;
 if (select billing_blocked from credit_accounts where user_id=p_user_id) then raise exception 'billing_account_blocked'; end if;
 if p_request_id is not null then
  select * into v_intent from creem_checkout_intents where id=p_request_id;
  if found then
   if v_intent.user_id<>p_user_id or v_intent.product_code<>p_product_code then raise exception 'checkout_intent_mismatch'; end if;
   return to_jsonb(v_intent)||jsonb_build_object('reused',true);
  end if;
 end if;
 if (select count(*) from creem_checkout_intents where user_id=p_user_id and created_at>now()-interval '1 hour')>=10 then raise exception 'checkout_rate_limited'; end if;
 update creem_checkout_intents set status='expired' where user_id=p_user_id and status='pending' and expires_at<=now() and provider_checkout_id is null and provider_request_started_at is null;
 if p_product_code='generation_monthly' then
   if exists(select 1 from creem_subscriptions where user_id=p_user_id and (status in ('active','trialing','paused','unpaid','past_due','scheduled_cancel') or current_period_end>now())) then raise exception 'subscription_already_exists'; end if;
 end if;
 -- An uncertain external result must not create a second payable checkout,
 -- including one-time packs after a page refresh/new client request ID.
 select * into v_intent from creem_checkout_intents where user_id=p_user_id and product_code=p_product_code and status='pending' order by created_at desc limit 1;
 if found then return to_jsonb(v_intent)||jsonb_build_object('reused',true); end if;
 insert into creem_checkout_intents(id,user_id,product_code) values(coalesce(p_request_id,gen_random_uuid()),p_user_id,p_product_code) returning * into v_intent;
 return to_jsonb(v_intent)||jsonb_build_object('reused',false);
end $$;

-- All writes and RPCs are server-only, even with Supabase creator defaults.
alter table public.credit_lots enable row level security;
alter table public.credit_reservation_lots enable row level security;
alter table public.credit_program_settings enable row level security;
alter table public.credit_starter_claims enable row level security;
alter table public.creem_checkout_intents enable row level security;
alter table public.creem_subscriptions enable row level security;
alter table public.creem_credit_payments enable row level security;
alter table public.creem_processed_events enable row level security;
alter table public.creem_payment_reversals enable row level security;
revoke all on public.credit_lots,public.credit_reservation_lots,public.credit_program_settings,public.credit_starter_claims,
 public.creem_checkout_intents,public.creem_subscriptions,public.creem_credit_payments,public.creem_processed_events,public.creem_payment_reversals from public,anon,authenticated;
grant all on public.credit_lots,public.credit_reservation_lots,public.credit_program_settings,public.credit_starter_claims,
 public.creem_checkout_intents,public.creem_subscriptions,public.creem_credit_payments,public.creem_processed_events,public.creem_payment_reversals to service_role;

revoke all on function public.create_creem_checkout_intent(uuid,text,uuid),public.expire_credit_lots(uuid),public.get_credit_balance(uuid),public.claim_starter_credits(uuid,text),
 public.allocate_credit_reservation_lots(),public.settle_credit_lot_allocations(uuid,bigint),public.release_credit_lot_allocations(uuid),
 public.fulfill_creem_payment(text,text,uuid,text,uuid,text,timestamptz,timestamptz,text),
 public.sync_creem_subscription(text,timestamptz,text,uuid,text,uuid,timestamptz,timestamptz,text),public.reverse_creem_payment(text,text,bigint,bigint,text)
 from public,anon,authenticated,service_role;
grant execute on function public.create_creem_checkout_intent(uuid,text,uuid),public.get_credit_balance(uuid),public.claim_starter_credits(uuid,text),
 public.fulfill_creem_payment(text,text,uuid,text,uuid,text,timestamptz,timestamptz,text),
 public.sync_creem_subscription(text,timestamptz,text,uuid,text,uuid,timestamptz,timestamptz,text),public.reverse_creem_payment(text,text,bigint,bigint,text)
 to service_role;
commit;
