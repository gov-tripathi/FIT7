# FitFuel — Product Requirements Document
**Version:** 1.1 | **Status:** Active | **Last Updated:** May 2026

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Problem & Opportunity](#2-problem--opportunity)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [Product Phases Overview](#4-product-phases-overview)
5. [Detailed Phase Requirements](#5-detailed-phase-requirements)
6. [Technical Architecture](#6-technical-architecture)
7. [Database Schema](#7-database-schema)
8. [API Design](#8-api-design)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Constraints & Risks](#10-constraints--risks)
11. [Delivery Roadmap](#11-delivery-roadmap)
12. [Task Breakdown](#12-task-breakdown)
13. [Out of Scope](#13-out-of-scope)

---

## 1. Executive Summary

FitFuel is a personal health optimization web app that connects fitness data (Garmin + Strava) with nutrition tracking, AI-powered supplement recommendations, and integrated grocery ordering via Swiggy Instamart.

The product closes the loop between **how you move** and **how you fuel** — giving users a single dashboard to understand their body, optimize their intake, and take action.

**Five phases (v1.1):**
- **Phase 1** — Auth + Garmin Sync + Activity Dashboard (Foundation)
- **Phase 1B** — Strava API Integration (official, free OAuth2)
- **Phase 2** — Calorie & Nutrition Intake Tracking
- **Phase 3** — AI Supplement & Diet Suggestions (Claude API)
- **Phase 4** — Weekly Meal Planner + Swiggy MCP Grocery Ordering

The entire stack is free or near-free, leveraging Supabase, Vercel, Render, and open APIs.

---

## 2. Problem & Opportunity

### 2.1 Problem Statement

Fitness enthusiasts use multiple disconnected tools: Garmin Connect or Strava for activity data, MyFitnessPal for food logging, and scattered supplement advice from social media. There is no single platform that:

- Ingests real workout and health data from a wearable (Garmin or Strava)
- Correlates calories burned with calories consumed
- Provides personalized, data-driven supplement and grocery recommendations
- Lets users act on those recommendations by ordering groceries directly from Swiggy Instamart

### 2.2 Opportunity

By combining fitness telemetry, nutrition tracking, AI reasoning, and real commerce (Swiggy MCP) into one product, FitFuel creates a sticky, end-to-end health optimization loop. Affiliate and direct commerce revenue from grocery and supplement orders creates a natural monetization path without charging users upfront.

---

## 3. Goals & Success Metrics

### 3.1 Product Goals

- Give users a single source of truth for fitness + nutrition data
- Support both Garmin and Strava users out of the box
- Make supplement and grocery decisions data-driven, not guesswork
- Enable frictionless Swiggy Instamart ordering from within the app
- Keep infrastructure cost at $0 during personal/beta usage

### 3.2 Success Metrics

| Metric | Phase 1–2 Target | Phase 3–4 Target |
|--------|-----------------|-----------------|
| Wearable sync success rate (Garmin or Strava) | > 95% | > 99% |
| Food logs per active user/day | 2+ | 3+ |
| AI suggestion acceptance rate | N/A | > 40% |
| Swiggy order conversion from suggestion | N/A | > 15% |
| Weekly active users retained | > 60% | > 75% |

---

## 4. Product Phases Overview

| Phase | Name | Key Features | Status |
|-------|------|-------------|--------|
| Phase 1 | Auth + Garmin Foundation | Supabase login, Garmin sync, activity dashboard, health metrics | Scaffolded |
| Phase 1B | Strava Integration | Strava OAuth2, activity sync, replace unofficial Garmin lib risk | **New** |
| Phase 2 | Nutrition Tracking | Food logging, calorie balance, macro breakdown, Open Food Facts | Scaffolded |
| Phase 3 | AI Intelligence | Claude API suggestions, supplement recommendations, sleep/HRV insights | Scaffolded |
| Phase 4 | Swiggy Commerce | Nutrient gap engine, Swiggy Instamart MCP, grocery ordering, meal planner | **Updated** |

---

## 5. Detailed Phase Requirements

### 5.1 Phase 1 — Auth + Garmin Sync & Dashboard

`FOUNDATION`

#### 5.1.1 Supabase Authentication

Supabase Auth handles user registration and login. Already implemented.

**Login methods:**
- Email + password (sign up / sign in)
- Google OAuth (one-tap)
- Guest mode (local mock data, no account required)

**Setup required:**
1. Create a Supabase project at supabase.com
2. Run `supabase_setup.sql` in the SQL Editor
3. Fill `backend/.env` and `frontend/.env` with Supabase URL + keys
4. Enable Google OAuth provider in Supabase Dashboard → Auth → Providers

#### 5.1.2 Garmin Data Sync

The backend uses the `garminconnect` Python library (unofficial) to authenticate with Garmin Connect and pull data on a scheduled basis. Syncs run hourly via APScheduler.

> **Status check required** — The `garminconnect` library at v0.2.8 may have API compatibility changes vs the code written against v0.2.19. Full end-to-end test needed (see Task T3).

**Data pulled per sync:**
- Activities: type, distance, duration, pace, calories burned, avg/max HR
- Health metrics: sleep hours, HRV, stress level, VO2 max, body battery
- GPS route data: stored as GPX/JSON for map rendering

**Fallback:** If Garmin SSO triggers reCAPTCHA, `garmin_browser.py` opens a headed Chromium window (Playwright) for one-time manual login. Session cookies are saved and reused.

#### 5.1.3 Dashboard Views

- Activity feed (last 30 days) with type icons and key stats
- Weekly summary: total distance, time, calories burned
- Heart rate zone breakdown (bar chart)
- Sleep quality trend (line chart, 7-day)
- Body battery & stress timeline
- VO2 max trend over time

---

### 5.1B Phase 1B — Strava Integration

`NEW — OFFICIAL FREE API`

Strava provides an official OAuth2 API with no cost for personal use. It is the recommended wearable integration for users who do not have Garmin or who encounter Garmin auth issues.

#### 5.1B.1 Strava OAuth2 Flow

1. User clicks "Connect Strava" in Settings
2. Backend redirects to `https://www.strava.com/oauth/authorize` with `client_id`, `redirect_uri`, and scope `activity:read_all`
3. User grants permission in Strava; Strava redirects back to `/auth/strava/callback?code=...`
4. Backend exchanges code for `access_token` + `refresh_token` via `POST https://www.strava.com/oauth/token`
5. Tokens stored encrypted in `profiles.strava_token` (Fernet, same as Garmin)
6. Access token refreshed automatically before each sync (expires in 6 hours)

#### 5.1B.2 Strava Data Pulled

| Strava field | FitFuel field | Notes |
|---|---|---|
| `type` | `type` | Mapped: Run→running, Ride→cycling, etc. |
| `distance` | `distance_km` | Convert metres → km |
| `moving_time` | `duration_mins` | Convert seconds → mins |
| `calories` | `calories_burned` | From Strava estimate |
| `average_heartrate` | `avg_hr` | Optional field |
| `max_heartrate` | `max_hr` | Optional field |
| `total_elevation_gain` | `elevation_m` | metres |
| `map.polyline` | `gpx_data` | Decoded to lat/lng array |
| `start_date` | `started_at` | ISO timestamp |

Health metrics (sleep, HRV, body battery) are **Garmin-exclusive** — not available via Strava. When a user uses Strava only, health metric cards show "Connect Garmin for sleep & HRV data."

#### 5.1B.3 Strava Sync Schedule

- Hourly via APScheduler (same pattern as Garmin)
- Manual trigger via `POST /sync/strava`
- Webhook support planned for v1.2 (real-time push on new activity)

#### 5.1B.4 Activity Source Badge

Each activity row shows a source badge — **Garmin** or **Strava** — so users with both connected understand where data came from. Duplicate detection: if `strava_id` matches an activity already inserted via Garmin import, skip.

---

### 5.2 Phase 2 — Nutrition & Calorie Tracking

`NUTRITION`

#### 5.2.1 Food Logging

Users log meals via a search interface powered by the **Open Food Facts API** (free, no key required).

- Meal types: Breakfast, Lunch, Dinner, Snack, Pre-workout, Post-workout
- Fields stored: food name, calories, protein (g), carbs (g), fat (g), fiber (g)
- Quick add: recent foods, saved meals

#### 5.2.2 Calorie Balance Engine

```
Net Balance = Calories Consumed − Calories Burned (Garmin/Strava) − BMR
```

- Daily calorie target set by user (deficit / maintenance / surplus)
- Live progress bar showing remaining calories for the day
- Macro breakdown: protein / carbs / fat as % of daily intake
- Weekly trend chart: net balance per day

#### 5.2.3 Nutrition Dashboard

- Today at a glance: calories in vs out, macro rings
- Meal timeline showing logged foods with edit/delete
- Water intake tracker (manual)
- Weekly nutrition report: averages, best/worst days

---

### 5.3 Phase 3 — AI Supplement & Diet Suggestions

`AI POWERED`

#### 5.3.1 Claude AI Integration

The backend calls the **Anthropic Claude API** (`claude-sonnet-4-20250514`) with a structured prompt containing the user's recent fitness and nutrition data.

**Prompt context includes:**
- Last 7 days of activities (type, distance, intensity, HR) — from Garmin or Strava
- Average net calorie balance (surplus or deficit)
- Macro breakdown averages
- Sleep hours and HRV trend (Garmin only; omitted for Strava-only users)
- Stress level trend (Garmin only)
- User-set goal (weight loss / muscle gain / performance / recovery)

#### 5.3.2 Suggestion Categories

- **Protein supplements** (whey, casein, plant-based) — based on protein deficit vs activity
- **Recovery supplements** (magnesium, creatine, BCAAs) — based on training load & sleep
- **Sleep & stress support** (ashwagandha, magnesium glycinate) — based on HRV & stress
- **Energy & endurance** (B12, iron, electrolytes) — based on activity type & intensity
- **Grocery recommendations** — foods that fill the nutrient gap, orderable via Swiggy

#### 5.3.3 Suggestion UX

- Daily AI insight card on dashboard with top 2–3 recommendations
- Each suggestion shows the data reason (e.g. "You averaged 5.2hrs sleep — consider magnesium")
- Accept / Dismiss / Learn More actions per suggestion
- Accepted suggestions feed directly into Phase 4 Swiggy ordering
- Weekly AI summary report

---

### 5.4 Phase 4 — Swiggy MCP Grocery Ordering + Meal Planner

`COMMERCE — UPDATED`

#### 5.4.1 Weekly Meal Planner

Claude AI generates a personalized 7-day meal plan based on calorie target, macro goals, food preferences, and accepted supplement suggestions.

- Meals auto-filled per day: Breakfast, Lunch, Dinner, Snacks
- Each meal shows: name, calories, macros, prep time
- Regenerate individual meals or full plan
- Shopping list auto-generated from weekly plan (grouped by category)
- Shopping list items are directly searchable on Swiggy Instamart

#### 5.4.2 Swiggy MCP Integration

FitFuel integrates with **Swiggy Builders Club MCP** — three MCP servers exposing 35 tools for food delivery, groceries, and table reservations across India.

**MCP Servers used:**

| Server | Endpoint | Use in FitFuel |
|---|---|---|
| **Instamart** | `mcp.swiggy.com/im` | Grocery ordering for nutrient gap items |
| **Food** | `mcp.swiggy.com/food` | Post-workout meal delivery suggestions |
| **Dineout** | `mcp.swiggy.com/dineout` | Restaurant booking (v1.2, out of scope v1.1) |

**Authentication:** OAuth 2.1 with PKCE. User connects Swiggy account via "Connect Swiggy" in Settings. One OAuth flow authenticates all three servers. Access token valid 5 days; re-auth on expiry.

#### 5.4.3 Nutrient Gap Engine

After each Garmin/Strava sync, Claude computes the user's **nutrient gap** — what macros and micros are missing vs daily targets.

```
Nutrient Gap = Daily Target − (Logged Food Intake + Estimated Garmin/Strava Burned)
```

**Gaps tracked per day:**
- Macros: protein (g), carbs (g), fat (g), fiber (g)
- Micros: iron, magnesium, B12, electrolytes (sodium, potassium)
- Hydration: water (ml)

Claude maps each gap to Swiggy Instamart search queries and fetches live products.

#### 5.4.4 Swiggy Instamart Grocery Flow

1. After sync, nutrient gap is computed
2. Claude generates ranked grocery list (products from Swiggy Instamart that fill the gap)
3. User sees: product name, brand, price, macros per 100g, gap-fill %, delivery ETA
4. User taps **Add to Cart** — calls `update_cart` on Swiggy Instamart MCP
5. User reviews cart (`get_cart`), applies any coupon (`apply_food_coupon` n/a for Instamart)
6. User taps **Place Order** — calls `checkout` (COD, ₹1000 cart cap in v1)
7. Order confirmation stored in Supabase `swiggy_orders` table
8. Order tracking via `track_order` shown in Orders tab

**MCP Tools used (Instamart):**

| Tool | FitFuel usage |
|---|---|
| `get_addresses` | Resolve user's saved Swiggy delivery address |
| `search_products` | Find groceries matching nutrient gap |
| `your_go_to_items` | Show reorder shortcuts for recurring items |
| `update_cart` | Add items to cart |
| `get_cart` | Show cart before checkout |
| `clear_cart` | Reset cart if address changes |
| `checkout` | Place order (COD, ₹1000 cap) |
| `get_orders` | Order history in FitFuel Orders tab |
| `track_order` | Real-time delivery tracking |

**MCP Tools used (Food — post-workout meals):**

| Tool | FitFuel usage |
|---|---|
| `get_addresses` | Resolve delivery address |
| `search_restaurants` | Find restaurants matching post-workout meal type |
| `search_menu` | Find specific dishes |
| `update_food_cart` | Add meals to food cart |
| `get_food_cart` | Review cart |
| `place_food_order` | Place food delivery order (COD) |
| `track_food_order` | Track food delivery |

#### 5.4.5 Swiggy Orders UI

- **Grocery tab**: Nutrient gap suggestions → Instamart cart → Order
- **Food tab**: Post-workout meal suggestions → Food delivery cart → Order
- **Orders tab**: Past orders (Instamart + Food), tracking status, reorder button
- Cart confirmation modal always shown before `checkout` / `place_food_order`
- Cart cap warning: "Swiggy MCP beta cap is ₹1,000 — order via Swiggy app for larger carts"

#### 5.4.6 Swiggy Session Management

- Swiggy OAuth token stored encrypted per user in `profiles.swiggy_token`
- On 401, app prompts user to reconnect Swiggy (re-run OAuth)
- Token checked before every MCP call; re-auth flow is non-blocking (user can dismiss)
- Multi-address support: user picks delivery address from Swiggy saved addresses

---

## 6. Technical Architecture

### 6.1 Full Stack

| Layer | Technology | Purpose | Cost |
|-------|-----------|---------|------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS | UI, routing, state management | Free |
| Charts | Recharts | Activity and nutrition visualizations | Free |
| Backend | FastAPI (Python 3.9+) | REST API, business logic, scheduler | Free |
| Database | Supabase (PostgreSQL) | Data storage, auth, RLS policies | Free |
| Auth | Supabase Auth | Email/password + Google OAuth + guest mode | Free |
| Garmin Sync | garminconnect v0.2.8 | Pull fitness & health data (unofficial) | Free |
| Strava Sync | Strava API v3 (official OAuth2) | Pull activities + heart rate | Free |
| Food Data | Open Food Facts API | Nutrition search & barcode lookup | Free |
| AI Engine | Anthropic Claude API (Sonnet) | Supplement, grocery & diet suggestions | ~$0.01/user/day |
| Scheduler | APScheduler | Hourly Garmin + Strava sync jobs | Free |
| Swiggy Commerce | Swiggy Builders Club MCP | Grocery ordering via Instamart + food delivery | Free (beta) |
| Frontend Host | Vercel | CDN, deploy previews | Free |
| Backend Host | Render | Auto-deploy from GitHub | Free |

### 6.2 Architecture Flow

```
[ React + Tailwind ]  ←→  [ FastAPI Backend ]
      ↑ Vercel                  ↑ Render
                      ↓
           [ Supabase PostgreSQL + Auth ]
                      ↓
[ Garmin API ]  [ Strava API ]  [ Open Food Facts ]  [ Claude API ]
                      ↓
           [ Swiggy MCP — Food / Instamart ]
```

---

## 7. Database Schema

> **See [`supabase_setup.sql`](./supabase_setup.sql) for the full runnable script.**

### Tables

| Table | Description | Phase |
|-------|-------------|-------|
| `profiles` | User goals, settings, Garmin + Strava + Swiggy credentials | 1 |
| `activities` | Garmin / Strava activity data (source field: `garmin`/`strava`) | 1 |
| `health_metrics` | Sleep, HRV, stress, VO2 max (Garmin only) | 1 |
| `sync_logs` | Garmin + Strava sync history & errors | 1 |
| `food_logs` | Meal entries with macros | 2 |
| `daily_targets` | Per-user calorie & macro targets | 2 |
| `supplement_suggestions` | AI-generated supplement recommendations | 3 |
| `meal_plans` | Weekly AI meal plans | 4 |
| `swiggy_orders` | Swiggy Instamart + Food orders placed from FitFuel | 4 |

### Schema Changes (v1.1 additions to `profiles`)

```sql
-- Add to profiles table
strava_token        text,   -- encrypted Strava access_token
strava_refresh_token text,  -- encrypted Strava refresh_token
strava_token_expires_at timestamptz,
strava_athlete_id   bigint,
strava_enabled      boolean default false,
swiggy_token        text,   -- encrypted Swiggy Bearer token
swiggy_token_expires_at timestamptz,
swiggy_enabled      boolean default false,

-- Add to activities table
source              text default 'garmin' check (source in ('garmin','strava','manual')),
strava_id           bigint unique
```

### New Table: `swiggy_orders`

```sql
create table public.swiggy_orders (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  suggestion_id   uuid references public.supplement_suggestions(id),
  swiggy_order_id text,                    -- orderId from Swiggy MCP
  server          text not null check (server in ('food','instamart')),
  items           jsonb not null,          -- [{spinId/itemId, name, qty, price}]
  subtotal        float,
  total           float,
  delivery_address jsonb,
  status          text default 'pending',
  placed_at       timestamptz default now(),
  delivered_at    timestamptz,
  created_at      timestamptz default now()
);
```

---

## 8. API Design

### Endpoints

| Method | Endpoint | Description | Phase |
|--------|----------|-------------|-------|
| `POST` | `/auth/garmin` | Save Garmin credentials | 1 |
| `GET` | `/activities` | List user activities | 1 |
| `POST` | `/sync/garmin` | Trigger manual Garmin sync | 1 |
| `GET` | `/health/metrics` | Get health metrics history | 1 |
| `GET` | `/auth/strava` | Start Strava OAuth2 redirect | 1B |
| `GET` | `/auth/strava/callback` | Handle Strava OAuth2 callback + store tokens | 1B |
| `POST` | `/sync/strava` | Trigger manual Strava sync | 1B |
| `DELETE` | `/auth/strava` | Disconnect Strava account | 1B |
| `GET` | `/food/search?q=` | Search Open Food Facts | 2 |
| `POST` | `/food/log` | Log a food item | 2 |
| `GET` | `/food/logs` | Get user food logs | 2 |
| `GET` | `/nutrition/summary` | Daily calorie balance | 2 |
| `POST` | `/ai/suggest` | Generate AI suggestions | 3 |
| `GET` | `/ai/suggestions` | List suggestion history | 3 |
| `PATCH` | `/ai/suggestions/:id` | Accept or dismiss suggestion | 3 |
| `POST` | `/planner/generate` | Generate weekly meal plan | 4 |
| `GET` | `/planner/current` | Get current week plan | 4 |
| `GET` | `/auth/swiggy` | Start Swiggy OAuth2 PKCE redirect | 4 |
| `GET` | `/auth/swiggy/callback` | Handle Swiggy OAuth2 callback + store token | 4 |
| `DELETE` | `/auth/swiggy` | Disconnect Swiggy account | 4 |
| `GET` | `/swiggy/addresses` | Get user's Swiggy saved addresses | 4 |
| `GET` | `/swiggy/grocery-suggestions` | AI-ranked grocery list from nutrient gap | 4 |
| `POST` | `/swiggy/search` | Search Swiggy Instamart products | 4 |
| `POST` | `/swiggy/cart/add` | Add item to Swiggy cart | 4 |
| `GET` | `/swiggy/cart` | View current Swiggy cart | 4 |
| `POST` | `/swiggy/order` | Place Swiggy order (Instamart or Food) | 4 |
| `GET` | `/swiggy/orders` | Get past Swiggy orders | 4 |
| `GET` | `/swiggy/orders/:id/track` | Track a Swiggy order | 4 |

---

## 9. Non-Functional Requirements

### 9.1 Performance
- Dashboard initial load: < 2 seconds on 4G
- Garmin/Strava sync job: completes within 30 seconds per user
- AI suggestion generation: < 5 seconds (streamed response preferred)
- Food search autocomplete: < 300ms response time
- Swiggy MCP tool calls: < 600ms p95 (per Swiggy SLA)

### 9.2 Security
- Garmin/Strava/Swiggy credentials encrypted at rest (Fernet AES-128)
- All API routes protected with Supabase JWT verification
- Row Level Security on all tables
- HTTPS enforced on all endpoints
- Claude API key stored as environment variable only
- Swiggy OAuth tokens stored per-user, never logged

### 9.3 Reliability
- Garmin/Strava sync failures retried up to 3x with exponential backoff
- Sync errors logged to `sync_logs` table
- Swiggy MCP order placement: check-then-retry pattern (not blind retry) — `checkout` / `place_food_order` are non-idempotent
- Supabase free tier: 500MB storage, 2GB bandwidth/month

---

## 10. Constraints & Risks

| Risk | Description | Mitigation |
|------|-------------|-----------|
| Garmin API breaks | Unofficial library may break on Garmin auth changes | Strava as official fallback; FIT file import as secondary fallback |
| Garmin reCAPTCHA | Automated login blocked by reCAPTCHA | `garmin_browser.py` Playwright headless workaround; or use Strava |
| Garmin ToS | Automated access may violate ToS for commercial products | Fine for personal use; Strava for multi-user commercial |
| Strava rate limits | 100 req/15 min, 1000 req/day per app | Cache responses; only sync delta since last sync |
| Claude API cost | Heavy usage could add up at scale | Cache suggestions; regenerate only when data changes |
| Swiggy MCP beta | ₹1,000 cart cap; COD only in v1 | Show cap warning; deep link to Swiggy app for larger carts |
| Swiggy credentials | Access is invite-based for production | Build + demo locally first; apply with screen recording per Swiggy docs |
| Supabase limits | Free tier: 500MB storage, connection limits | Sufficient for beta; upgrade to Pro ($25/mo) at scale |

---

## 11. Delivery Roadmap

| Week | Milestone | Deliverables |
|------|-----------|-------------|
| Week 1 | Phase 1 — Auth | Supabase project setup, run SQL, fill .env, test login + Google OAuth |
| Week 2 | Phase 1 — Garmin debug | End-to-end Garmin sync test, fix v0.2.8 compat issues, verify dashboard data |
| Week 3 | Phase 1B — Strava | Strava OAuth2 flow, token storage, activity sync service, source badge UI |
| Week 4 | Phase 2 | Food logging, Open Food Facts, calorie balance engine, nutrition dashboard |
| Week 5 | Phase 3 | Claude AI suggestions, prompt engineering, suggestion cards, accept/dismiss |
| Week 6 | Phase 4A — Swiggy Auth | Swiggy OAuth PKCE flow, token storage, address fetcher, Settings UI |
| Week 7 | Phase 4B — Nutrient Gap | Nutrient gap engine, Instamart product search, grocery suggestion UI |
| Week 8 | Phase 4C — Orders | Cart management, checkout flow, order tracking, past orders tab |

---

## 12. Task Breakdown

### T1 — Supabase Login Setup

> Status: Code is scaffolded. Needs env vars + Supabase project.

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| T1.1 | Create Supabase project | supabase.com | Free tier |
| T1.2 | Run `supabase_setup.sql` in SQL Editor | `supabase_setup.sql` | SQL bug already fixed in v1.1 |
| T1.3 | Fill `backend/.env` with Supabase URL + keys | `backend/.env` | Copy from Supabase → Settings → API |
| T1.4 | Fill `frontend/.env` with Supabase URL + anon key | `frontend/.env` | Same project |
| T1.5 | Enable Google OAuth in Supabase Dashboard | Dashboard → Auth → Providers | Add Google client_id + secret |
| T1.6 | Test email sign-up / sign-in end-to-end | `frontend/src/pages/Login.tsx` | Already implemented |
| T1.7 | Test Google OAuth flow | `frontend/src/pages/Login.tsx` | Already implemented |
| T1.8 | Test guest mode (mock data) | `frontend/src/context/AuthContext.tsx` | Already implemented |

---

### T2 — Garmin Connect Debug & Verification

> Status: Code exists but written against garminconnect 0.2.19; running on 0.2.8.

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| T2.1 | Compare garminconnect 0.2.8 changelog vs 0.2.19 API | `backend/app/services/garmin.py` | Check if `Garmin()` constructor args changed |
| T2.2 | Test manual Garmin credential save via Settings UI | `backend/app/routers/profile.py` | `POST /profile/garmin` |
| T2.3 | Test `POST /sync/garmin` trigger | `backend/app/routers/sync.py` | Check logs for errors |
| T2.4 | Fix any API incompatibilities in garmin.py | `backend/app/services/garmin.py` | e.g. method renames |
| T2.5 | Test Playwright browser login if reCAPTCHA triggered | `backend/app/services/garmin_browser.py` | Requires `playwright install chromium` |
| T2.6 | Verify activities appear on dashboard after sync | `frontend/src/pages/Activities.tsx` | End-to-end check |
| T2.7 | Verify health metrics (sleep, HRV) appear | `frontend/src/pages/Dashboard.tsx` | End-to-end check |

---

### T3 — Strava API Integration

> Status: Not implemented. Full feature build.

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| T3.1 | Register FitFuel app on Strava developers portal | strava.com/settings/api | Get `client_id` + `client_secret` |
| T3.2 | Add `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` to `backend/.env` | `backend/.env` | |
| T3.3 | Add Strava fields to `profiles` table in SQL | `supabase_setup.sql` | See schema changes in §7 |
| T3.4 | Add `strava_id` + `source` columns to `activities` table | `supabase_setup.sql` | |
| T3.5 | Build `backend/app/services/strava.py` — OAuth2 exchange + token refresh | New file | Use `httpx`; refresh token if expired |
| T3.6 | Build `backend/app/services/strava.py` — activity sync | Same file | Pull last N days of activities |
| T3.7 | Add `GET /auth/strava` + `GET /auth/strava/callback` routes | `backend/app/routers/profile.py` or new router | PKCE not required for Strava (it uses standard OAuth2) |
| T3.8 | Add `POST /sync/strava` route | `backend/app/routers/sync.py` | Manual sync trigger |
| T3.9 | Add `DELETE /auth/strava` (disconnect) | `backend/app/routers/profile.py` | Clear token + strava_enabled=false |
| T3.10 | Map Strava activity types to FitFuel types | `backend/app/services/strava.py` | Run→running, Ride→cycling, Swim→swimming, etc. |
| T3.11 | Add Strava to APScheduler hourly sync | `backend/app/scheduler.py` | Skip if `strava_enabled=false` |
| T3.12 | Frontend: "Connect Strava" button in Settings | `frontend/src/pages/Settings.tsx` | Redirect to `/auth/strava` |
| T3.13 | Frontend: Source badge (Garmin/Strava) on activity cards | `frontend/src/pages/Activities.tsx` | Show orange S or green G badge |
| T3.14 | Frontend: Show Strava-synced activities on dashboard | `frontend/src/pages/Dashboard.tsx` | Same components, source-agnostic |

---

### T4 — Swiggy MCP Integration

> Status: Not implemented. `backend/app/services/mcp.py` is a generic stub — replace with Swiggy implementation.

#### T4a — Swiggy OAuth & Auth

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| T4a.1 | Apply for Swiggy Builders Club access at mcp.swiggy.com/builders | External | Record a demo video per their docs |
| T4a.2 | Add `SWIGGY_CLIENT_ID` to `backend/.env` | `backend/.env` | From Swiggy onboarding |
| T4a.3 | Add Swiggy fields to `profiles` table in SQL | `supabase_setup.sql` | See schema in §7 |
| T4a.4 | Build PKCE helper in backend (code_verifier + code_challenge S256) | `backend/app/services/swiggy.py` | New file |
| T4a.5 | Build `GET /auth/swiggy` — generate PKCE, redirect to Swiggy `/auth/authorize` | `backend/app/routers/swiggy.py` | New router |
| T4a.6 | Build `GET /auth/swiggy/callback` — exchange code + verifier for token, store encrypted | `backend/app/routers/swiggy.py` | |
| T4a.7 | Build `DELETE /auth/swiggy` — revoke + clear token | `backend/app/routers/swiggy.py` | Call `POST /auth/logout` on Swiggy |
| T4a.8 | Build token getter with auto-re-auth on 401 | `backend/app/services/swiggy.py` | Return 401+reason to frontend so it can prompt reconnect |
| T4a.9 | Frontend: "Connect Swiggy" button in Settings | `frontend/src/pages/Settings.tsx` | |
| T4a.10 | Frontend: Show Swiggy connection status (connected / expired) | `frontend/src/pages/Settings.tsx` | |

#### T4b — Swiggy MCP Client

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| T4b.1 | Build MCP JSON-RPC caller in `swiggy.py` — `call_tool(server, tool, args, token)` | `backend/app/services/swiggy.py` | `POST https://mcp.swiggy.com/{server}` with `Bearer` header |
| T4b.2 | Implement `get_addresses(token)` — fetch user's Swiggy saved addresses | Same | Instamart server |
| T4b.3 | Implement `search_products(addressId, query, token)` — Instamart product search | Same | |
| T4b.4 | Implement `update_cart(addressId, items, token)` — add to Instamart cart | Same | |
| T4b.5 | Implement `get_cart(token)` — view Instamart cart | Same | |
| T4b.6 | Implement `clear_cart(token)` — clear Instamart cart | Same | |
| T4b.7 | Implement `checkout(addressId, token)` — place Instamart order (COD) | Same | Non-idempotent; check-then-retry |
| T4b.8 | Implement `get_orders(token)` — Instamart order history | Same | |
| T4b.9 | Implement `track_order(orderId, lat, lng, token)` — real-time tracking | Same | |
| T4b.10 | Implement Food server tools: `search_restaurants`, `update_food_cart`, `get_food_cart`, `place_food_order`, `track_food_order` | Same | |
| T4b.11 | Retry logic: exponential backoff on 5xx; check-then-retry on order placement | Same | Per Swiggy ship-to-production docs |

#### T4c — Nutrient Gap Engine

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| T4c.1 | Build `compute_nutrient_gap(user_id, date)` — reads food_logs + activities, returns gaps | `backend/app/services/nutrient_gap.py` | New file |
| T4c.2 | Map nutrient gaps to Swiggy Instamart search queries via Claude | `backend/app/services/claude.py` | Extend existing Claude service |
| T4c.3 | Build `GET /swiggy/grocery-suggestions` endpoint | `backend/app/routers/swiggy.py` | Returns ranked list with gap-fill % + Swiggy product data |
| T4c.4 | Cache suggestions for 2 hours (don't re-query Claude + Swiggy on every page load) | Backend | Use in-memory cache or Supabase |

#### T4d — Swiggy UI

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| T4d.1 | Build grocery suggestions panel — ranked product cards with macro data + gap % | `frontend/src/pages/Orders.tsx` | |
| T4d.2 | Add to Cart button → calls `POST /swiggy/cart/add` | Same | Show loading state |
| T4d.3 | Cart sidebar / modal — shows items, total, ₹1000 cap warning | New component | |
| T4d.4 | Checkout confirmation modal — address, items, total, COD label | Same | "Never place without user confirmation" |
| T4d.5 | Place Order → calls `POST /swiggy/order` | Same | |
| T4d.6 | Orders history tab — past Instamart + Food orders, status, track button | `frontend/src/pages/Orders.tsx` | |
| T4d.7 | Order tracking view — ETA, delivery partner info | New component | Poll `GET /swiggy/orders/:id/track` every 30s |

#### T4e — New DB: `swiggy_orders` table + RLS

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| T4e.1 | Add `swiggy_orders` table to `supabase_setup.sql` | `supabase_setup.sql` | See schema in §7 |
| T4e.2 | Add RLS policy: users manage own swiggy_orders | `supabase_setup.sql` | |
| T4e.3 | Store order on placement success | `backend/app/routers/swiggy.py` | |

---

## 13. Out of Scope (v1.1)

- Native mobile app (iOS/Android) — web-first; PWA possible in v2
- Apple Watch, Fitbit, Whoop wearables
- Swiggy Dineout table reservations (v1.2)
- Swiggy Food delivery (v1.2 — Instamart groceries first)
- Social/community features (sharing, leaderboards, challenges)
- Blood biomarker integration (labs, CGM data)
- Telehealth or registered dietitian integration
- Online payment for Swiggy (COD only in MCP beta)
- Swiggy orders above ₹1,000 (MCP beta cap; deep-link to Swiggy app)

---

*FitFuel PRD v1.1 — May 2026*
