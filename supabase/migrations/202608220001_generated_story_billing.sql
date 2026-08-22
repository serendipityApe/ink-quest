begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_premium boolean not null default false,
  ls_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_premium boolean not null default false;
alter table public.profiles add column if not exists ls_subscription_id text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available bigint not null default 0 check (available >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('reserved', 'partially_settled', 'settled', 'released', 'expired')),
  quoted_amount bigint not null check (quoted_amount > 0),
  settled_amount bigint not null default 0 check (settled_amount >= 0),
  pricing_version text not null,
  items jsonb not null default '[]'::jsonb,
  idempotency_key text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (settled_amount <= quoted_amount)
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reservation_id uuid references public.credit_reservations(id) on delete set null,
  entry_type text not null check (entry_type in ('grant', 'reserve', 'settle', 'release', 'refund', 'expire', 'adjustment')),
  amount bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  source_type text not null,
  source_id text not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_language text not null check (target_language in ('zh', 'en')),
  learner_level text not null,
  title text,
  premise text not null,
  status text not null default 'draft' check (status in ('draft', 'generating', 'active', 'paused', 'archived', 'failed')),
  current_node_id uuid,
  tts_mode text not null default 'off' check (tts_mode in ('off', 'every_scene')),
  tts_voice_id text,
  story_version bigint not null default 1,
  prompt_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_nodes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.generated_stories(id) on delete cascade,
  parent_node_id uuid references public.story_nodes(id) on delete set null,
  node_version integer not null default 1,
  text text,
  text_segments jsonb,
  summary text,
  state_delta jsonb not null default '{}'::jsonb,
  status text not null default 'generating' check (status in ('generating', 'text_ready', 'ready', 'failed')),
  created_by_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_choices (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.story_nodes(id) on delete cascade,
  label text not null,
  intent text,
  risk_hint text,
  branch_seed jsonb not null default '{}'::jsonb,
  selected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.story_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.generated_stories(id) on delete cascade,
  node_id uuid references public.story_nodes(id) on delete cascade,
  world_bible jsonb not null default '[]'::jsonb,
  characters jsonb not null default '[]'::jsonb,
  relationships jsonb not null default '[]'::jsonb,
  timeline_summary jsonb not null default '[]'::jsonb,
  unresolved_threads jsonb not null default '[]'::jsonb,
  state_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.director_directives (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.generated_stories(id) on delete cascade,
  scope text not null check (scope in ('next_scene', 'persistent')),
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'archived')),
  applied_node_id uuid references public.story_nodes(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.generated_stories(id) on delete cascade,
  node_id uuid references public.story_nodes(id) on delete set null,
  job_type text not null check (job_type in ('opening', 'scene', 'reroll', 'rewrite', 'tts_scene')),
  status text not null default 'queued' check (status in ('queued', 'running', 'partial_success', 'completed', 'failed', 'canceled')),
  stage text not null default 'queued',
  reservation_id uuid not null references public.credit_reservations(id),
  idempotency_key text not null,
  attempt integer not null default 0,
  max_attempts integer not null default 3,
  input jsonb not null default '{}'::jsonb,
  error_code text,
  error_message_safe text,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.story_nodes
  drop constraint if exists story_nodes_created_by_job_id_fkey;
alter table public.story_nodes
  add constraint story_nodes_created_by_job_id_fkey
  foreign key (created_by_job_id) references public.generation_jobs(id) on delete set null
  deferrable initially deferred;

alter table public.generated_stories
  drop constraint if exists generated_stories_current_node_id_fkey;
alter table public.generated_stories
  add constraint generated_stories_current_node_id_fkey
  foreign key (current_node_id) references public.story_nodes(id) on delete set null
  deferrable initially deferred;

create table if not exists public.generation_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.generated_stories(id) on delete cascade,
  node_id uuid not null references public.story_nodes(id) on delete cascade,
  node_version integer not null,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  provider text,
  voice_id text,
  object_key text,
  content_hash text not null,
  duration_ms integer,
  timestamps jsonb,
  created_by_job_id uuid references public.generation_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (node_id, node_version, content_hash)
);

create table if not exists public.job_outbox (
  id bigint generated always as identity primary key,
  job_id uuid not null unique references public.generation_jobs(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'published')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'lemonsqueezy',
  provider_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_subscription_id text not null unique,
  variant_id text not null,
  status text not null,
  renews_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_order_id text not null unique,
  product_code text not null,
  product_type text not null check (product_type in ('subscription', 'credit_pack')),
  variant_id text not null,
  status text not null,
  currency text,
  total_minor bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  provider_event_id text primary key,
  event_name text not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  attempts integer not null default 0,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists generated_stories_owner_updated_idx on public.generated_stories(owner_id, updated_at desc);
create index if not exists story_nodes_story_created_idx on public.story_nodes(story_id, created_at);
create index if not exists generation_jobs_user_created_idx on public.generation_jobs(user_id, created_at desc);
create index if not exists generation_jobs_status_lease_idx on public.generation_jobs(status, lease_expires_at);
create index if not exists generation_job_events_job_id_idx on public.generation_job_events(job_id, id);
create index if not exists credit_ledger_user_created_idx on public.credit_ledger(user_id, created_at desc);
create index if not exists billing_events_status_received_idx on public.billing_events(status, received_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do update set email = excluded.email, updated_at = now();

  insert into public.credit_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email, updated_at = now();

insert into public.credit_accounts (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount bigint,
  p_source_type text,
  p_source_id text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  if p_amount <= 0 then raise exception 'credit_amount_must_be_positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));

  select balance_after into v_balance
  from public.credit_ledger
  where idempotency_key = p_idempotency_key;
  if found then return v_balance; end if;

  insert into public.credit_accounts (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  update public.credit_accounts
  set available = available + p_amount, version = version + 1, updated_at = now()
  where user_id = p_user_id
  returning available into v_balance;

  insert into public.credit_ledger (
    user_id, entry_type, amount, balance_after, source_type, source_id, idempotency_key, metadata
  ) values (
    p_user_id, 'grant', p_amount, v_balance, p_source_type, p_source_id, p_idempotency_key, p_metadata
  );

  return v_balance;
end;
$$;

create or replace function public.create_generated_story_job(
  p_user_id uuid,
  p_target_language text,
  p_learner_level text,
  p_premise text,
  p_tts_mode text,
  p_quoted_amount bigint,
  p_pricing_version text,
  p_idempotency_key text,
  p_items jsonb,
  p_input jsonb
)
returns table (story_id uuid, job_id uuid, reservation_id uuid, reused boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available bigint;
  v_story_id uuid;
  v_job_id uuid;
  v_reservation_id uuid;
begin
  if p_target_language not in ('zh', 'en') then raise exception 'invalid_target_language'; end if;
  if p_tts_mode not in ('off', 'every_scene') then raise exception 'invalid_tts_mode'; end if;
  if p_quoted_amount <= 0 then raise exception 'invalid_quote'; end if;
  if length(trim(p_idempotency_key)) < 8 then raise exception 'invalid_idempotency_key'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));

  select j.story_id, j.id, j.reservation_id
  into v_story_id, v_job_id, v_reservation_id
  from public.generation_jobs j
  where j.user_id = p_user_id and j.idempotency_key = p_idempotency_key;

  if found then
    return query select v_story_id, v_job_id, v_reservation_id, true;
    return;
  end if;

  insert into public.credit_accounts (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select available into v_available
  from public.credit_accounts
  where user_id = p_user_id
  for update;

  if v_available < p_quoted_amount then raise exception 'insufficient_credits'; end if;

  insert into public.credit_reservations (
    user_id, status, quoted_amount, pricing_version, items, idempotency_key, expires_at
  ) values (
    p_user_id, 'reserved', p_quoted_amount, p_pricing_version, p_items, p_idempotency_key, now() + interval '30 minutes'
  ) returning id into v_reservation_id;

  update public.credit_accounts
  set available = available - p_quoted_amount,
      reserved = reserved + p_quoted_amount,
      version = version + 1,
      updated_at = now()
  where user_id = p_user_id
  returning available into v_available;

  insert into public.credit_ledger (
    user_id, reservation_id, entry_type, amount, balance_after, source_type, source_id, idempotency_key, metadata
  ) values (
    p_user_id, v_reservation_id, 'reserve', -p_quoted_amount, v_available,
    'generation', v_reservation_id::text, 'reserve:' || v_reservation_id::text,
    jsonb_build_object('pricing_version', p_pricing_version, 'items', p_items)
  );

  insert into public.generated_stories (
    owner_id, target_language, learner_level, premise, status, tts_mode
  ) values (
    p_user_id, p_target_language, p_learner_level, p_premise, 'generating', p_tts_mode
  ) returning id into v_story_id;

  insert into public.generation_jobs (
    user_id, story_id, job_type, status, stage, reservation_id, idempotency_key, input
  ) values (
    p_user_id, v_story_id, 'opening', 'queued', 'queued', v_reservation_id, p_idempotency_key, p_input
  ) returning id into v_job_id;

  insert into public.job_outbox (job_id) values (v_job_id);
  insert into public.generation_job_events (job_id, event_type) values (v_job_id, 'generation.reserved');

  return query select v_story_id, v_job_id, v_reservation_id, false;
end;
$$;

create or replace function public.release_credit_reservation(
  p_reservation_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.credit_reservations%rowtype;
  v_release bigint;
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

  update public.credit_accounts
  set available = available + v_release,
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
    v_reservation.user_id, p_reservation_id, 'release', v_release, v_balance,
    'generation', p_reservation_id::text, p_idempotency_key, jsonb_build_object('reason', p_reason)
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
set search_path = public
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

revoke all on function public.grant_credits(uuid, bigint, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_generated_story_job(uuid, text, text, text, text, bigint, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.release_credit_reservation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.settle_credit_reservation_item(uuid, bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, bigint, text, text, text, jsonb) to service_role;
grant execute on function public.create_generated_story_job(uuid, text, text, text, text, bigint, text, text, jsonb, jsonb) to service_role;
grant execute on function public.release_credit_reservation(uuid, text, text) to service_role;
grant execute on function public.settle_credit_reservation_item(uuid, bigint, text, text, jsonb) to service_role;

alter table public.profiles enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.generated_stories enable row level security;
alter table public.story_nodes enable row level security;
alter table public.story_choices enable row level security;
alter table public.story_state_snapshots enable row level security;
alter table public.director_directives enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_job_events enable row level security;
alter table public.audio_assets enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_events enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select * from (values
      ('profiles_select_own', 'profiles', 'id = auth.uid()'),
      ('credit_accounts_select_own', 'credit_accounts', 'user_id = auth.uid()'),
      ('credit_reservations_select_own', 'credit_reservations', 'user_id = auth.uid()'),
      ('credit_ledger_select_own', 'credit_ledger', 'user_id = auth.uid()'),
      ('generated_stories_select_own', 'generated_stories', 'owner_id = auth.uid()'),
      ('generation_jobs_select_own', 'generation_jobs', 'user_id = auth.uid()'),
      ('billing_customers_select_own', 'billing_customers', 'user_id = auth.uid()'),
      ('billing_subscriptions_select_own', 'billing_subscriptions', 'user_id = auth.uid()'),
      ('billing_orders_select_own', 'billing_orders', 'user_id = auth.uid()')
    ) as policies(policy_name, table_name, using_expression)
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = policy_record.table_name and policyname = policy_record.policy_name
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (%s)',
        policy_record.policy_name, policy_record.table_name, policy_record.using_expression
      );
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'story_nodes' and policyname = 'story_nodes_select_own') then
    create policy story_nodes_select_own on public.story_nodes for select to authenticated
      using (exists (select 1 from public.generated_stories s where s.id = story_id and s.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'story_choices' and policyname = 'story_choices_select_own') then
    create policy story_choices_select_own on public.story_choices for select to authenticated
      using (exists (
        select 1 from public.story_nodes n join public.generated_stories s on s.id = n.story_id
        where n.id = node_id and s.owner_id = auth.uid()
      ));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'story_state_snapshots' and policyname = 'story_state_snapshots_select_own') then
    create policy story_state_snapshots_select_own on public.story_state_snapshots for select to authenticated
      using (exists (select 1 from public.generated_stories s where s.id = story_id and s.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'director_directives' and policyname = 'director_directives_select_own') then
    create policy director_directives_select_own on public.director_directives for select to authenticated
      using (exists (select 1 from public.generated_stories s where s.id = story_id and s.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'generation_job_events' and policyname = 'generation_job_events_select_own') then
    create policy generation_job_events_select_own on public.generation_job_events for select to authenticated
      using (exists (select 1 from public.generation_jobs j where j.id = job_id and j.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audio_assets' and policyname = 'audio_assets_select_own') then
    create policy audio_assets_select_own on public.audio_assets for select to authenticated
      using (exists (select 1 from public.generated_stories s where s.id = story_id and s.owner_id = auth.uid()));
  end if;
end;
$$;

commit;
