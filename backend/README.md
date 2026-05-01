# FitFuel Backend (FastAPI)

## Setup

```bash
cp .env.example .env
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Interactive docs: <http://localhost:8000/docs>

## Environment variables

| Var                         | Required | Notes                                                          |
| --------------------------- | -------- | -------------------------------------------------------------- |
| `SUPABASE_URL`              | yes      | Project URL (Settings → API)                                   |
| `SUPABASE_ANON_KEY`         | yes      | anon key                                                       |
| `SUPABASE_SERVICE_ROLE_KEY` | yes\*    | service role key, used by the scheduler                        |
| `SUPABASE_JWT_SECRET`       | yes\*    | `Project Settings → API → JWT Secret`; enables JWT verification |
| `ANTHROPIC_API_KEY`         | no       | Empty ⇒ stubbed AI output                                      |
| `CLAUDE_MODEL`              | no       | default `claude-sonnet-4-20250514`                             |
| `FERNET_KEY`                | prod     | generated via `Fernet.generate_key()` for Garmin tokens        |
| `MCP_SERVER_URL`            | no       | Empty ⇒ stubbed catalog / fake order IDs                       |
| `ENABLE_SCHEDULER`          | no       | `true` to run hourly Garmin sync                               |

\* without these, the API runs in dev-only mode (JWT signature skipped).

## Endpoints overview

| Phase | Group                  | Routes                                                            |
| ----- | ---------------------- | ----------------------------------------------------------------- |
| 1     | `/profile`             | `GET`, `PATCH`, `POST /garmin`                                    |
| 1     | `/activities`          | `GET`, `GET /weekly-summary`                                      |
| 1     | `/health/metrics`      | `GET`                                                             |
| 1     | `/sync/garmin`         | `POST`, `GET /logs`                                               |
| 2     | `/food`                | `GET /search`, `GET /barcode/:b`, `POST /log`, `GET /logs`, `DELETE /logs/:id` |
| 2     | `/nutrition`           | `GET /summary`, `GET /weekly`, `GET /targets`, `POST /targets`    |
| 3     | `/ai`                  | `POST /suggest`, `GET /suggestions`, `PATCH /suggestions/:id`     |
| 4     | `/planner`             | `POST /generate`, `GET /current`                                  |
| 4     | `/orders`              | `GET /search`, `POST /place`, `GET`                               |

All routes require `Authorization: Bearer <supabase-jwt>` except `/healthz` and `/orders/search`.
