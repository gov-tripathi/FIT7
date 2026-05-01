# FitFuel — Product Requirements Document
**Version:** 1.0 | **Status:** Draft | **Last Updated:** April 2026

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
12. [Out of Scope](#12-out-of-scope)

---

## 1. Executive Summary

FitFuel is a personal health optimization web app that connects Garmin fitness data with nutrition tracking, AI-powered supplement recommendations, and an integrated e-commerce ordering experience.

The product closes the loop between **how you move** and **how you fuel** — giving users a single dashboard to understand their body, optimize their intake, and take action.

**Four phases:**
- **Phase 1** — Garmin Sync & Activity Dashboard (Foundation)
- **Phase 2** — Calorie & Nutrition Intake Tracking
- **Phase 3** — AI Supplement & Diet Suggestions (Claude API)
- **Phase 4** — Weekly Meal Planner + E-Commerce Ordering (MCP)

The entire stack is free or near-free, leveraging Supabase, Vercel, Render, and open APIs.

---

## 2. Problem & Opportunity

### 2.1 Problem Statement

Fitness enthusiasts use multiple disconnected tools: Garmin Connect for activity data, MyFitnessPal for food logging, and scattered supplement advice from social media. There is no single platform that:

- Ingests real workout and health data from a wearable
- Correlates calories burned with calories consumed
- Provides personalized, data-driven supplement recommendations
- Lets users act on those recommendations by ordering directly

### 2.2 Opportunity

By combining fitness telemetry, nutrition tracking, AI reasoning, and e-commerce into one product, FitFuel creates a sticky, end-to-end health optimization loop. Affiliate and direct commerce revenue from supplement and food orders creates a natural monetization path without charging users upfront.

---

## 3. Goals & Success Metrics

### 3.1 Product Goals

- Give users a single source of truth for fitness + nutrition data
- Make supplement and diet decisions data-driven, not guesswork
- Enable frictionless ordering from within the app
- Keep infrastructure cost at $0 during personal/beta usage

### 3.2 Success Metrics

| Metric | Phase 1–2 Target | Phase 3–4 Target |
|--------|-----------------|-----------------|
| Garmin sync success rate | > 95% uptime | > 99% uptime |
| Food logs per active user/day | 2+ | 3+ |
| AI suggestion acceptance rate | N/A | > 40% |
| Order conversion from suggestion | N/A | > 15% |
| Weekly active users retained | > 60% | > 75% |

---

## 4. Product Phases Overview

| Phase | Name | Key Features | Timeline |
|-------|------|-------------|----------|
| Phase 1 | Garmin Foundation | Garmin sync, Supabase storage, activity dashboard, health metrics | Weeks 1–2 |
| Phase 2 | Nutrition Tracking | Food logging, calorie balance, macro breakdown, Open Food Facts API | Weeks 3–4 |
| Phase 3 | AI Intelligence | Claude API suggestions, supplement recommendations, sleep/HRV insights | Weeks 5–6 |
| Phase 4 | Commerce & Planning | Weekly meal planner, MCP e-commerce integration, supplement ordering | Weeks 7–8 |

---

## 5. Detailed Phase Requirements

### 5.1 Phase 1 — Garmin Sync & Dashboard

`FOUNDATION`

#### 5.1.1 Garmin Data Sync

The backend uses the `garminconnect` Python library (unofficial) to authenticate with Garmin Connect and pull data on a scheduled basis. Syncs run hourly via APScheduler.

**Data pulled per sync:**
- Activities: type, distance, duration, pace, calories burned, avg/max HR
- Health metrics: sleep hours, HRV, stress level, VO2 max, body battery
- GPS route data: stored as GPX/JSON for map rendering

#### 5.1.2 Dashboard Views

- Activity feed (last 30 days) with type icons and key stats
- Weekly summary: total distance, time, calories burned
- Heart rate zone breakdown (bar chart)
- Sleep quality trend (line chart, 7-day)
- Body battery & stress timeline
- VO2 max trend over time

#### 5.1.3 Auth & Multi-user

Supabase Auth handles user registration and login (email/password + Google OAuth). Row Level Security (RLS) policies ensure each user sees only their own data. Garmin credentials stored encrypted per user.

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
Net Balance = Calories Consumed − Calories Burned (Garmin) − BMR
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
- Last 7 days of activities (type, distance, intensity, HR)
- Average net calorie balance (surplus or deficit)
- Macro breakdown averages
- Sleep hours and HRV trend
- Stress level trend
- User-set goal (weight loss / muscle gain / performance / recovery)

#### 5.3.2 Suggestion Categories

- **Protein supplements** (whey, casein, plant-based) — based on protein deficit vs activity
- **Recovery supplements** (magnesium, creatine, BCAAs) — based on training load & sleep
- **Sleep & stress support** (ashwagandha, magnesium glycinate) — based on HRV & stress
- **Energy & endurance** (B12, iron, electrolytes) — based on activity type & intensity
- **Diet adjustments** — increase protein, reduce simple carbs, hydration tips

#### 5.3.3 Suggestion UX

- Daily AI insight card on dashboard with top 2–3 recommendations
- Each suggestion shows the data reason (e.g. "You averaged 5.2hrs sleep — consider magnesium")
- Accept / Dismiss / Learn More actions per suggestion
- Accepted suggestions feed directly into Phase 4 ordering
- Weekly AI summary report (PDF export)

---

### 5.4 Phase 4 — Weekly Planner & E-Commerce Ordering

`COMMERCE`

#### 5.4.1 Weekly Meal Planner

Claude AI generates a personalized 7-day meal plan based on calorie target, macro goals, food preferences, and accepted supplement suggestions.

- Meals auto-filled per day: Breakfast, Lunch, Dinner, Snacks
- Each meal shows: name, calories, macros, prep time
- Regenerate individual meals or full plan
- Shopping list auto-generated from weekly plan (grouped by category)
- Export plan as PDF or share link

#### 5.4.2 E-Commerce Integration via MCP

The final phase connects FitFuel to an e-commerce backend using a **Model Context Protocol (MCP) server**. Claude AI can browse products, check availability, and initiate orders.

**MCP tools exposed:**

| Tool | Description |
|------|-------------|
| `search_products(query, category)` | Find supplements/foods by name |
| `get_product_details(product_id)` | Price, description, nutritional info, reviews |
| `add_to_cart(product_id, quantity)` | Add item to user's cart |
| `get_cart()` | View current cart contents |
| `place_order(cart_id, address)` | Submit order |
| `get_order_status(order_id)` | Track delivery |

#### 5.4.3 Ordering Flow

1. AI suggestion card shows **Order Now** button
2. MCP searches for the product → returns top 3 options with prices
3. User selects option, quantity, and delivery address
4. One-click checkout via MCP — order placed without leaving FitFuel
5. Order confirmation stored in Supabase
6. Reorder shortcut for recurring supplements

#### 5.4.4 Cumulative Diet Plan

Users can generate a **4–12 week progressive plan** aligned to a fitness goal (e.g. "Lose 5kg", "Build muscle for summer"):

- Week-by-week calorie and macro targets that adjust progressively
- Supplement schedule: when to start/increase each supplement
- Milestone check-ins: adjust plan based on progress
- All items in the plan are orderable via MCP in one batch

---

## 6. Technical Architecture

### 6.1 Full Stack

| Layer | Technology | Purpose | Cost |
|-------|-----------|---------|------|
| Frontend | React + Tailwind CSS | UI, routing, state management | Free |
| Charts | Recharts | Activity and nutrition visualizations | Free |
| Maps | Leaflet.js + GPX | Route map rendering | Free |
| Backend | FastAPI (Python) | REST API, business logic, scheduler | Free |
| Database | Supabase (PostgreSQL) | Data storage, auth, RLS policies | Free |
| Garmin Sync | garminconnect library | Pull fitness & health data | Free |
| Food Data | Open Food Facts API | Nutrition search & barcode lookup | Free |
| AI Engine | Claude API (Sonnet) | Supplement & diet suggestions | ~$0.01/user/day |
| Scheduler | APScheduler | Hourly Garmin sync jobs | Free |
| Frontend Host | Vercel | CDN, deploy previews | Free |
| Backend Host | Render | Auto-deploy from GitHub | Free |
| E-Commerce | MCP Server | Product search & order placement | TBD |

### 6.2 Architecture Flow

```
[ React + Tailwind ]  ←→  [ FastAPI Backend ]
      ↑ Vercel                  ↑ Render
                      ↓
           [ Supabase PostgreSQL + Auth ]
                      ↓
[ Garmin API ]  [ Open Food Facts ]  [ Claude API ]  [ MCP Server ]
```

---

## 7. Database Schema

> **See [`supabase_setup.sql`](./supabase_setup.sql) for the full runnable script.**

### Tables

| Table | Description | Phase |
|-------|-------------|-------|
| `profiles` | User goals, settings, Garmin credentials | 1 |
| `activities` | Garmin activity data | 1 |
| `health_metrics` | Sleep, HRV, stress, VO2 max | 1 |
| `sync_logs` | Garmin sync history & errors | 1 |
| `food_logs` | Meal entries with macros | 2 |
| `daily_targets` | Per-user calorie & macro targets | 2 |
| `supplement_suggestions` | AI-generated supplement recommendations | 3 |
| `meal_plans` | Weekly AI meal plans | 4 |
| `orders` | MCP e-commerce orders | 4 |

---

## 8. API Design

### Endpoints

| Method | Endpoint | Description | Phase |
|--------|----------|-------------|-------|
| `POST` | `/auth/garmin` | Save Garmin credentials | 1 |
| `GET` | `/activities` | List user activities | 1 |
| `POST` | `/sync/garmin` | Trigger manual Garmin sync | 1 |
| `GET` | `/health/metrics` | Get health metrics history | 1 |
| `GET` | `/food/search?q=` | Search Open Food Facts | 2 |
| `POST` | `/food/log` | Log a food item | 2 |
| `GET` | `/food/logs` | Get user food logs | 2 |
| `GET` | `/nutrition/summary` | Daily calorie balance | 2 |
| `POST` | `/ai/suggest` | Generate AI suggestions | 3 |
| `GET` | `/ai/suggestions` | List suggestion history | 3 |
| `PATCH` | `/ai/suggestions/:id` | Accept or dismiss suggestion | 3 |
| `POST` | `/planner/generate` | Generate weekly meal plan | 4 |
| `GET` | `/planner/current` | Get current week plan | 4 |
| `POST` | `/orders/search` | MCP product search | 4 |
| `POST` | `/orders/place` | MCP place order | 4 |

---

## 9. Non-Functional Requirements

### 9.1 Performance
- Dashboard initial load: < 2 seconds on 4G
- Garmin sync job: completes within 30 seconds per user
- AI suggestion generation: < 5 seconds (streamed response preferred)
- Food search autocomplete: < 300ms response time

### 9.2 Security
- Garmin credentials encrypted at rest (Supabase vault / AES-256)
- All API routes protected with Supabase JWT verification
- Row Level Security on all tables
- HTTPS enforced on all endpoints
- Claude API key stored as environment variable only

### 9.3 Reliability
- Garmin sync failures retried up to 3x with exponential backoff
- Sync errors logged to `sync_logs` table
- Supabase free tier: 500MB storage, 2GB bandwidth/month
- Render free tier: add health check ping to prevent spin-down

---

## 10. Constraints & Risks

| Risk | Description | Mitigation |
|------|-------------|-----------|
| Garmin API breaks | Unofficial library may break on Garmin auth changes | Monitor GitHub issues; FIT file import as fallback |
| Garmin ToS | Automated access may violate ToS for commercial products | Fine for personal use; pursue official API for multi-user |
| Claude API cost | Heavy usage could add up at scale | Cache suggestions; regenerate only when data changes |
| MCP availability | E-commerce MCP partner not yet confirmed | Phase 4 design is MCP-agnostic; plug in any compliant server |
| Supabase limits | Free tier: 500MB storage, connection limits | Sufficient for beta; upgrade to Pro ($25/mo) at scale |

---

## 11. Delivery Roadmap

| Week | Milestone | Deliverables |
|------|-----------|-------------|
| Week 1 | Phase 1A | Garmin sync script, Supabase schema, FastAPI boilerplate, auth |
| Week 2 | Phase 1B | Activity dashboard, health metrics charts, Vercel + Render deploy |
| Week 3 | Phase 2A | Food search (Open Food Facts), food log UI, calorie balance engine |
| Week 4 | Phase 2B | Macro breakdown charts, nutrition dashboard, weekly report |
| Week 5 | Phase 3A | Claude API integration, suggestion prompt engineering, suggestion cards |
| Week 6 | Phase 3B | Suggestion history, accept/dismiss flow, weekly AI summary report |
| Week 7 | Phase 4A | Weekly meal planner UI, Claude meal plan generation, shopping list |
| Week 8 | Phase 4B | MCP e-commerce integration, product search, one-click ordering |

---

## 12. Out of Scope (v1)

- Native mobile app (iOS/Android) — web-first; PWA possible in v2
- Non-Garmin wearables (Apple Watch, Fitbit, Whoop)
- Social/community features (sharing, leaderboards, challenges)
- Blood biomarker integration (labs, CGM data)
- Telehealth or registered dietitian integration
- Payments processing (delegated to MCP e-commerce provider)

---

*FitFuel PRD v1.0 — Confidential — April 2026*
