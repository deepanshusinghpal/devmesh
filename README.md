# DevMesh

**Distributed Job Orchestration & Execution Platform**

DevMesh is a JavaScript-first monorepo for submitting, processing, retrying, and inspecting background jobs. It uses React + Vite for the dashboard, Express for the API, PostgreSQL with Prisma for durable job state, and Redis + BullMQ for queue execution.

## Current capabilities

- Persist jobs, execution attempts, results, and event history in PostgreSQL.
- Submit jobs to BullMQ and process them with a separate worker process.
- Support `file.process`, `report.generate`, `catalog.sync`, and simulated `notification.send` handlers.
- Retry failed jobs manually while preserving attempt history and protecting newer retry generations from stale queue executions.
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

Set `DATABASE_URL` and `REDIS_URL` in `.env` to match your local services. Keep secrets out of Git.

### 3. Generate Prisma Client and apply migrations

```bash
npm run db:generate
npm run db:migrate
```

### 4. Start the services

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

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Check PostgreSQL and Redis connectivity |
| GET | `/api/v1/jobs` | List recent persisted jobs |
| GET | `/api/v1/jobs/:id` | Inspect a job, its attempts, and event history |
| POST | `/api/v1/jobs` | Validate, persist, and enqueue a job |
| PATCH | `/api/v1/jobs/:id/input` | Update input for a failed job before retry |
| POST | `/api/v1/jobs/:id/retry` | Queue a new manual retry generation |
| GET | `/api/v1/metrics` | Read job outcome, duration, queue, and worker metrics |

## Important notes

- `notification.send` is intentionally a local simulation. It does not send real emails or messages.
- Worker availability is based on short-lived Redis heartbeats; the dashboard reports workers that have checked in recently.
- The current API has no authentication or authorization layer. Do not expose it publicly or use it with sensitive production data until access control, secret handling, rate limiting, and deployment hardening are implemented.
- The metrics endpoint reports lifetime job totals and the last 24 hours of completed/failed outcomes. Historical throughput charts and persistent time-series metrics are not implemented yet.
