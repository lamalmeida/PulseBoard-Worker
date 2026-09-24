# PulseBoard Worker

Backend worker and API service for PulseBoard.

It runs scheduled endpoint checks, stores check results in Supabase, sends notifications, performs cleanup, and exposes authenticated HTTP routes used by the PulseBoard frontend.

## Runtime

The service is written in TypeScript and runs on Bun.

## Setup

```bash
bun install
cp .env.example .env
bun run dev
```

Configure the values in `.env` before starting the service.

## Production

```bash
bun run start
```

The repository also includes a `systemd` service definition and a deployment script with rollback support.

## Main components

- `src/monitoring/` — scheduling, dispatching, and endpoint checks
- `src/routes/` — REST API routes
- `src/auth/` — JWT authentication
- `src/notification/` — notification delivery
- `src/db/` — Supabase access
- `src/cleanup.ts` — historical check cleanup
- `src/server.ts` — Bun HTTP server
