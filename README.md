# DevMesh

**Distributed Job Orchestration & Execution Platform**

DevMesh is a JavaScript-first monorepo for submitting, processing, retrying, and inspecting background jobs. It uses React + Vite for the dashboard, Express for the API, PostgreSQL with Prisma for durable job state, and Redis + BullMQ for queue execution.

## Current capabilities

- Persist jobs, execution attempts, results, and event history in PostgreSQL.
- Submit jobs to BullMQ and process them with a separate worker process.
- Support `file.process`, `report.generate`, `catalog.sync`, and simulated `notification.send` handlers.
- Generate report field summaries with missing-value counts, distinct-value counts, and numeric min/max/average/sum statistics.
- Create jobs from the dashboard using a validated JSON payload with examples for each job type.
- Validate job inputs in the API before queueing, and edit the complete JSON payload of failed jobs before retrying.
- Run dependency-free unit tests for job payload validation and report summary calculations.
- Retry failed jobs manually while preserving attempt history and protecting newer retry generations from stale queue executions.
- Cancel queued/retrying jobs before execution and use optional idempotency keys to avoid duplicate job creation.
- Show job details, inputs, results, attempts, and the event timeline in the dashboard.
- Expose live job, queue, and worker-heartbeat metrics through the API.
- Run a workspace build in GitHub Actions for pull requests and pushes to `main`.

## Repository layout

- `apps/web` — React + Vite dashboard
- `apps/api` — Express API and BullMQ queue producer
- `apps/worker` — BullMQ worker and job handlers
- `packages/database` — Prisma schema and generated client
- `docker-compose.yml` — Local PostgreSQL and Redis services

## Prerequisites

- Node.js 22 (Node.js 20.19+ may also work with the current Vite release)
- npm
- Docker Desktop with Docker Compose

## Run locally

Run these commands from the repository root.

### 1. Start PostgreSQL and Redis

```bash
docker compose up -d postgres redis
```

### 2. Install dependencies and configure environment

```bash
npm ci
cp .env.example .env
```

The example database URL uses host port `5433`, matching `docker-compose.yml`. Set `DATABASE_URL`, `REDIS_URL`, `API_PORT`, `VITE_API_URL`, and `WEB_ORIGIN` in `.env` as needed. Keep secrets out of Git. The seed command creates a local demo owner and project so the dashboard can create jobs without a hard-coded database ID.

### 3. Generate Prisma Client and apply migrations

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 4. Run tests and build

```bash
npm test
npm run build
```

### 5. Start the services

Use separate terminals from the repository root:

```bash
npm run dev:api
```

```bash
npm run dev:worker
```

```bash
npm run dev:web
```

The dashboard is available at `http://localhost:5173`, the API at `http://localhost:4000`, and the API health check at `http://localhost:4000/health`.

## Run the complete stack with Docker Compose

This starts PostgreSQL, Redis, runs database migrations and local seed data, then starts the API, worker, and dashboard.

```bash
docker compose --profile app up --build -d
docker compose ps
```

Open the dashboard at `http://localhost:4173`. The API is available at `http://localhost:4000`.

Useful commands:

```bash
docker compose --profile app logs -f api worker
docker compose --profile app down
```

The named database and Redis volumes are preserved by `down`. Use `docker compose --profile app down -v` only when you intentionally want to delete local data. The default Compose credentials are for local development only; change them and add authentication before any shared or public deployment.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Check PostgreSQL and Redis connectivity |
| GET | `/api/v1/jobs` | List recent persisted jobs |
| GET | `/api/v1/jobs/:id` | Inspect a job, its attempts, and event history |
| POST | `/api/v1/jobs` | Validate, persist, and enqueue a job |
| PATCH | `/api/v1/jobs/:id/input` | Update input for a failed job before retry |
| POST | `/api/v1/jobs/:id/retry` | Queue a new manual retry generation |
| POST | `/api/v1/jobs/:id/cancel` | Cancel a queued or retrying job before execution |
| GET | `/api/v1/metrics` | Read job outcome, duration, queue, and worker metrics |

## Important notes

- `notification.send` is intentionally a local simulation. It does not send real emails or messages.
- Worker availability is based on short-lived Redis heartbeats; the dashboard reports workers that have checked in recently.
- The current API has no authentication or authorization layer. The project-list endpoint and job endpoints are for local development only. Do not expose the API publicly or use it with sensitive production data until access control, secret handling, rate limiting, and deployment hardening are implemented.
- The local seed creates a placeholder account with no login support. It is not a production user or password.
- The metrics endpoint reports lifetime job totals and the last 24 hours of completed/failed outcomes. Historical throughput charts and persistent time-series metrics are not implemented yet.
