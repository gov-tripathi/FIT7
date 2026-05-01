# FitFuel

Personal health optimization web app that connects Garmin fitness data with nutrition tracking, AI supplement recommendations, and e-commerce ordering.

Built from [`FitFuel_PRD_v1.md`](./FitFuel_PRD_v1.md). Database schema in [`supabase_setup.sql`](./supabase_setup.sql).

## Stack

| Layer    | Tech                                       |
| -------- | ------------------------------------------ |
| Frontend | React 18 + Vite + TypeScript + TailwindCSS |
| Charts   | Recharts                                   |
| Backend  | FastAPI (Python 3.11+)                     |
| DB/Auth  | Supabase (Postgres + RLS)                  |
| AI       | Anthropic Claude (Sonnet)                  |
| Garmin   | `garminconnect` library                    |
| Food DB  | Open Food Facts API                        |

## Monorepo layout

```
.
├── FitFuel_PRD_v1.md       # product spec
├── supabase_setup.sql      # run in Supabase SQL editor
├── backend/                # FastAPI service
└── frontend/               # React + Vite app
```

## Quickstart

### 1. Provision the database

1. Create a new project at [supabase.com](https://supabase.com) (free tier).
2. Open **SQL Editor → New query**, paste the contents of `supabase_setup.sql`, run it.
3. Copy the **Project URL**, **anon key**, and **service_role key** from *Settings → API*.

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in Supabase + Claude keys
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API is now at <http://localhost:8000> and docs at <http://localhost:8000/docs>.

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # fill in Supabase URL + anon key + API URL
npm install
npm run dev
```

App is now at <http://localhost:5173>.

## Phases

Everything scaffolded here covers all four PRD phases end-to-end with graceful fallbacks (mock data / stub services) when external API keys aren't configured, so the app is runnable locally on day one.

| Phase | Scope                                    | Status            |
| ----- | ---------------------------------------- | ----------------- |
| 1     | Garmin sync + activity & health dashboard | Working + mocked  |
| 2     | Food logging + calorie balance           | Working (OFF API) |
| 3     | Claude AI supplement suggestions         | Working + stubbed |
| 4     | Meal planner + MCP ordering              | Working + stubbed |

Fill in real API keys in the `.env` files to flip from stubs to live integrations — no code changes required.
