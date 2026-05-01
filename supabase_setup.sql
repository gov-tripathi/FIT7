-- ============================================================
-- FitFuel — Supabase Database Setup Script
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
-- Order: extensions → tables → indexes → RLS → policies → functions → triggers
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- ────────────────────────────────────────────────────────────
-- PHASE 1 — GARMIN FOUNDATION
-- ────────────────────────────────────────────────────────────

-- 1. profiles
-- Extended user data beyond Supabase auth.users
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  avatar_url      text,
  goal            text check (goal in ('weight_loss', 'muscle_gain', 'performance', 'recovery', 'maintenance')),
  height_cm       float,
  weight_kg       float,
  birth_year      int,
  sex             text check (sex in ('male', 'female', 'other')),
  -- Garmin credentials (encrypted via pgcrypto before insert)
  garmin_email    text,
  garmin_token    text,   -- store encrypted session token, NOT raw password
  garmin_enabled  boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
comment on table public.profiles is 'User profile and Garmin connection settings';


-- 2. activities
-- One row per Garmin activity
create table if not exists public.activities (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  garmin_id       bigint unique,                  -- Garmin's own activity ID (prevents duplicates)
  date            date not null,
  started_at      timestamptz,
  type            text not null,                  -- running, cycling, swimming, walking, etc.
  name            text,                           -- user-defined activity name
  distance_km     float,
  duration_mins   float,
  calories_burned int,
  avg_hr          int,
  max_hr          int,
  avg_pace_min_km float,                          -- minutes per km
  elevation_m     float,
  vo2_max         float,
  training_effect float,
  gpx_data        jsonb,                          -- [{lat, lng, ele, time}, ...]
  raw_data        jsonb,                          -- full Garmin response for future use
  created_at      timestamptz default now()
);
comment on table public.activities is 'Garmin activity records synced from Connect';


-- 3. health_metrics
-- Daily health snapshot (one row per user per day)
create table if not exists public.health_metrics (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  -- Sleep
  sleep_hours     float,
  sleep_score     int,                            -- Garmin sleep score 0–100
  deep_sleep_hrs  float,
  rem_sleep_hrs   float,
  -- Heart
  hrv             int,                            -- Heart Rate Variability (ms)
  resting_hr      int,                            -- Resting heart rate (bpm)
  -- Readiness
  stress_level    int,                            -- Garmin stress 0–100
  body_battery    int,                            -- Garmin body battery 0–100
  -- Fitness
  vo2_max         float,
  steps           int,
  active_mins     int,
  -- Constraint: one record per user per day
  unique (user_id, date),
  created_at      timestamptz default now()
);
comment on table public.health_metrics is 'Daily Garmin health metrics: sleep, HRV, stress, battery';


-- 4. sync_logs
-- Track every Garmin sync attempt for debugging
create table if not exists public.sync_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  synced_at       timestamptz default now(),
  status          text not null check (status in ('success', 'partial', 'failed')),
  activities_new  int default 0,                  -- new activities added
  metrics_new     int default 0,                  -- new metric days added
  error_message   text,                           -- null on success
  duration_ms     int                             -- how long the sync took
);
comment on table public.sync_logs is 'Garmin sync history and error logs';


-- ────────────────────────────────────────────────────────────
-- PHASE 2 — NUTRITION TRACKING
-- ────────────────────────────────────────────────────────────

-- 5. daily_targets
-- User's calorie and macro goals (can change over time)
create table if not exists public.daily_targets (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  effective_from  date not null default current_date,
  calories_target int not null,
  protein_g       float,
  carbs_g         float,
  fat_g           float,
  water_ml        int default 2500,
  notes           text,
  created_at      timestamptz default now(),
  -- Only one active target per user at a time
  unique (user_id, effective_from)
);
comment on table public.daily_targets is 'User daily calorie and macro targets, versioned by date';


-- 6. food_logs
-- Every food item logged by the user
create table if not exists public.food_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  logged_at       timestamptz not null default now(),
  date            date not null default current_date,
  meal_type       text not null check (meal_type in (
                    'breakfast', 'lunch', 'dinner', 'snack',
                    'pre_workout', 'post_workout'
                  )),
  -- Food details (from Open Food Facts or manual)
  food_name       text not null,
  brand           text,
  barcode         text,
  openfoodfacts_id text,
  -- Per-portion macros (calculated from portion_g)
  portion_g       float not null default 100,
  calories        int not null,
  protein_g       float,
  carbs_g         float,
  fat_g           float,
  fiber_g         float,
  sugar_g         float,
  sodium_mg       float,
  created_at      timestamptz default now()
);
comment on table public.food_logs is 'User food intake log with macros per meal';


-- ────────────────────────────────────────────────────────────
-- PHASE 3 — AI SUPPLEMENT SUGGESTIONS
-- ────────────────────────────────────────────────────────────

-- 7. supplement_suggestions
-- AI-generated supplement recommendations
create table if not exists public.supplement_suggestions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  generated_at    timestamptz default now(),
  -- Context used to generate this suggestion
  context_json    jsonb not null,                 -- snapshot of user data sent to Claude
  -- AI output
  suggestions     jsonb not null,                 -- array of {name, reason, dose, category, priority}
  -- User response
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'dismissed', 'ordered')),
  accepted_items  jsonb,                          -- which specific suggestions were accepted
  dismissed_at    timestamptz,
  accepted_at     timestamptz,
  -- Order linkage (Phase 4)
  order_id        uuid,                           -- references orders(id) once placed
  created_at      timestamptz default now()
);
comment on table public.supplement_suggestions is 'Claude AI supplement and diet recommendations';


-- ────────────────────────────────────────────────────────────
-- PHASE 4 — MEAL PLANNER & E-COMMERCE
-- ────────────────────────────────────────────────────────────

-- 8. meal_plans
-- AI-generated weekly meal plans
create table if not exists public.meal_plans (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  week_start      date not null,                  -- Monday of the plan week
  goal            text,                           -- user goal at time of generation
  calorie_target  int,
  -- Plan data
  plan_json       jsonb not null,
  -- Structure: { monday: { breakfast: {...}, lunch: {...}, dinner: {...}, snacks: [...] }, ... }
  shopping_list   jsonb,
  -- Structure: { produce: [...], protein: [...], supplements: [...], pantry: [...] }
  -- Plan state
  is_active       boolean default true,
  created_at      timestamptz default now(),
  -- One active plan per user per week
  unique (user_id, week_start)
);
comment on table public.meal_plans is 'Claude AI generated weekly meal plans';


-- 9. orders
-- MCP e-commerce orders placed from within FitFuel
create table if not exists public.orders (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Source
  suggestion_id   uuid references public.supplement_suggestions(id),
  meal_plan_id    uuid references public.meal_plans(id),
  -- MCP order reference
  mcp_order_id    text,                           -- external order ID from MCP provider
  mcp_provider    text,                           -- e.g. 'iherb', 'amazon', 'myprotein'
  -- Order contents
  items           jsonb not null,
  -- Structure: [{ product_id, name, quantity, unit_price, total_price, image_url }]
  -- Financials
  subtotal        float,
  shipping        float,
  total           float,
  currency        text default 'USD',
  -- Delivery
  delivery_name   text,
  delivery_address jsonb,
  -- Structure: { line1, line2, city, state, zip, country }
  -- Status
  status          text not null default 'pending'
                    check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  placed_at       timestamptz default now(),
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz default now()
);
comment on table public.orders is 'MCP e-commerce orders placed from supplement suggestions or meal plans';


-- ────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────

-- activities
create index if not exists idx_activities_user_date    on public.activities(user_id, date desc);
create index if not exists idx_activities_garmin_id    on public.activities(garmin_id);
create index if not exists idx_activities_type         on public.activities(user_id, type);

-- health_metrics
create index if not exists idx_health_user_date        on public.health_metrics(user_id, date desc);

-- sync_logs
create index if not exists idx_sync_logs_user          on public.sync_logs(user_id, synced_at desc);

-- food_logs
create index if not exists idx_food_logs_user_date     on public.food_logs(user_id, date desc);
create index if not exists idx_food_logs_meal_type     on public.food_logs(user_id, meal_type);

-- supplement_suggestions
create index if not exists idx_suggestions_user_status on public.supplement_suggestions(user_id, status);
create index if not exists idx_suggestions_generated   on public.supplement_suggestions(user_id, generated_at desc);

-- meal_plans
create index if not exists idx_meal_plans_user_week    on public.meal_plans(user_id, week_start desc);

-- orders
create index if not exists idx_orders_user             on public.orders(user_id, placed_at desc);
create index if not exists idx_orders_suggestion       on public.orders(suggestion_id);


-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────
-- Every table is locked down — users can only access their own rows.

alter table public.profiles               enable row level security;
alter table public.activities             enable row level security;
alter table public.health_metrics         enable row level security;
alter table public.sync_logs              enable row level security;
alter table public.daily_targets          enable row level security;
alter table public.food_logs              enable row level security;
alter table public.supplement_suggestions enable row level security;
alter table public.meal_plans             enable row level security;
alter table public.orders                 enable row level security;


-- ────────────────────────────────────────────────────────────
-- RLS POLICIES
-- ────────────────────────────────────────────────────────────

-- Helper: current user's ID
-- auth.uid() is provided by Supabase and returns the JWT user id

-- profiles
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);


-- activities
create policy "Users can view own activities"
  on public.activities for select using (auth.uid() = user_id);

create policy "Users can insert own activities"
  on public.activities for insert with check (auth.uid() = user_id);

create policy "Users can update own activities"
  on public.activities for update using (auth.uid() = user_id);

create policy "Users can delete own activities"
  on public.activities for delete using (auth.uid() = user_id);


-- health_metrics
create policy "Users can view own health metrics"
  on public.health_metrics for select using (auth.uid() = user_id);

create policy "Users can insert own health metrics"
  on public.health_metrics for insert with check (auth.uid() = user_id);

create policy "Users can update own health metrics"
  on public.health_metrics for update using (auth.uid() = user_id);


-- sync_logs
create policy "Users can view own sync logs"
  on public.sync_logs for select using (auth.uid() = user_id);

create policy "Users can insert own sync logs"
  on public.sync_logs for insert with check (auth.uid() = user_id);


-- daily_targets
create policy "Users can manage own targets"
  on public.daily_targets for all using (auth.uid() = user_id);


-- food_logs
create policy "Users can manage own food logs"
  on public.food_logs for all using (auth.uid() = user_id);


-- supplement_suggestions
create policy "Users can view own suggestions"
  on public.supplement_suggestions for select using (auth.uid() = user_id);

create policy "Users can insert own suggestions"
  on public.supplement_suggestions for insert with check (auth.uid() = user_id);

create policy "Users can update own suggestions"
  on public.supplement_suggestions for update using (auth.uid() = user_id);


-- meal_plans
create policy "Users can manage own meal plans"
  on public.meal_plans for all using (auth.uid() = user_id);


-- orders
create policy "Users can manage own orders"
  on public.orders for all using (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- FUNCTIONS & TRIGGERS
-- ────────────────────────────────────────────────────────────

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- Auto-update profiles.updated_at on row change
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();


-- Set food_logs.date from logged_at before insert/update
create or replace function public.set_food_log_date()
returns trigger
language plpgsql
as $$
begin
  new.date = (new.logged_at at time zone 'UTC')::date;
  return new;
end;
$$;

create or replace trigger food_logs_set_date
  before insert or update on public.food_logs
  for each row execute procedure public.set_food_log_date();


-- ────────────────────────────────────────────────────────────
-- HELPER VIEWS
-- ────────────────────────────────────────────────────────────

-- Daily calorie summary: burned vs consumed vs target
create or replace view public.daily_calorie_summary as
select
  fl.user_id,
  fl.date,
  coalesce(sum(fl.calories), 0)               as calories_consumed,
  coalesce(a.calories_burned_total, 0)         as calories_burned,
  coalesce(dt.calories_target, 0)              as calories_target,
  coalesce(sum(fl.protein_g), 0)              as protein_g,
  coalesce(sum(fl.carbs_g), 0)               as carbs_g,
  coalesce(sum(fl.fat_g), 0)                 as fat_g,
  -- net = consumed - burned (positive = surplus, negative = deficit)
  coalesce(sum(fl.calories), 0) - coalesce(a.calories_burned_total, 0) as net_calories
from public.food_logs fl
left join (
  select user_id, date, sum(calories_burned) as calories_burned_total
  from public.activities
  group by user_id, date
) a on fl.user_id = a.user_id and fl.date = a.date
left join lateral (
  select calories_target
  from public.daily_targets dt2
  where dt2.user_id = fl.user_id and dt2.effective_from <= fl.date
  order by dt2.effective_from desc
  limit 1
) dt on true
group by fl.user_id, fl.date, a.calories_burned_total, dt.calories_target;

comment on view public.daily_calorie_summary is
  'Daily rollup: calories consumed vs burned vs target, with macro totals';


-- Weekly activity summary
create or replace view public.weekly_activity_summary as
select
  user_id,
  date_trunc('week', date)::date              as week_start,
  count(*)                                    as activity_count,
  round(sum(distance_km)::numeric, 1)         as total_distance_km,
  round(sum(duration_mins)::numeric, 0)       as total_duration_mins,
  coalesce(sum(calories_burned), 0)           as total_calories_burned,
  round(avg(avg_hr)::numeric, 0)              as avg_heart_rate
from public.activities
group by user_id, date_trunc('week', date);

comment on view public.weekly_activity_summary is
  'Weekly rollup of Garmin activity stats per user';


-- ────────────────────────────────────────────────────────────
-- SEED DATA (optional — remove for production)
-- ────────────────────────────────────────────────────────────
-- Uncomment to insert test data for a specific user UUID

/*
-- Replace 'YOUR-USER-UUID' with a real user ID from auth.users
do $$
declare
  test_user uuid := 'YOUR-USER-UUID';
begin

  -- Profile
  update public.profiles set
    goal = 'performance',
    height_cm = 178,
    weight_kg = 75,
    birth_year = 1990,
    sex = 'male'
  where id = test_user;

  -- Daily target
  insert into public.daily_targets (user_id, calories_target, protein_g, carbs_g, fat_g)
  values (test_user, 2400, 180, 250, 70)
  on conflict (user_id, effective_from) do nothing;

  -- Sample activity
  insert into public.activities
    (user_id, garmin_id, date, type, name, distance_km, duration_mins, calories_burned, avg_hr)
  values
    (test_user, 1234567890, current_date - 1, 'running', 'Morning Run', 8.5, 45, 620, 158),
    (test_user, 1234567891, current_date - 3, 'cycling', 'Evening Ride', 25.0, 65, 480, 142)
  on conflict (garmin_id) do nothing;

  -- Sample health metric
  insert into public.health_metrics
    (user_id, date, sleep_hours, hrv, stress_level, body_battery, resting_hr, steps)
  values
    (test_user, current_date - 1, 7.2, 58, 32, 78, 52, 9200)
  on conflict (user_id, date) do nothing;

end $$;
*/


-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
-- Tables:    profiles, activities, health_metrics, sync_logs,
--            daily_targets, food_logs, supplement_suggestions,
--            meal_plans, orders
-- Indexes:   10 covering indexes for common query patterns
-- RLS:       Enabled on all tables with per-user policies
-- Triggers:  Auto-create profile, auto-update updated_at
-- Views:     daily_calorie_summary, weekly_activity_summary
-- ────────────────────────────────────────────────────────────
