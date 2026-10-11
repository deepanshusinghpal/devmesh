# DevMesh

Distributed Job Orchestration & Execution Platform.

This is the initial development scaffold. It includes a React dashboard with custom CSS, an Express API, a PostgreSQL schema, Redis/BullMQ worker scaffolding, and Docker Compose.

## Prerequisites

- Node.js 20+
- npm
- Docker Desktop with Docker Compose

## Repository layout

- `apps/web` — React + TypeScript + Vite dashboard
- `apps/api` — Express + TypeScript API
- `apps/worker` — BullMQ worker process
- `packages/database` — Prisma schema and client
- `docker-compose.yml` — PostgreSQL and Redis for local development

## Start the infrastructure

From the project root:

```bash
docker compose up -d postgres redis
```

## Install dependencies

```bash
npm install
```

## Configure environment

Copy `.env.example` to `.env` and update values if needed.

```bash
cp .env.example .env
```

## Initialize the database

```bash
npm run db:generate
npm run db:migrate
```

## Run the applications

In separate terminals:

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
```

The dashboard runs on `http://localhost:5173` and the API on `http://localhost:4000`.

## Current milestone

The dashboard is an initial UI scaffold. The API currently exposes health and demo job endpoints; durable job creation, authentication, real queue processing, and deployment hardening will be implemented in subsequent milestones. Do not treat demo jobs as persisted production data yet.
