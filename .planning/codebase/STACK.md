# Stack

## Languages & Runtime

- **TypeScript 5.5** — strict mode enabled (`strict: true` in tsconfig.json)
- **Node.js 20+** — required in `package.json` engines field
- **JSX/TSX** — React frontends use TSX

## Backend Framework

- **Fastify 4.28** — HTTP framework (`src/server.ts` entry point)
  - `@fastify/cors` — CORS handling
  - `@fastify/static` — static file serving
  - `fastify-plugin` — plugin pattern for DB/Redis/pg-boss

## Database

- **PostgreSQL 16** — primary data store
  - Driver: `pg ^8.12.0`
  - Connection: pool via `src/plugins/db.ts`
  - 7 schema files in `src/db/` (17 tables total)
  - Migrations via Docker entrypoint init scripts (ordered 001-007)

## Cache & Rate Limiting

- **Redis 7** — via `ioredis ^5.4.1`
  - Sliding window rate limiting (`src/middleware/rateLimit.ts`)
  - Connection in `src/plugins/db.ts`

## Job Queue

- **pg-boss 10** — PostgreSQL-backed job queue
  - Billing usage events and period closing
  - Initialized in `src/plugins/db.ts`

## Scheduled Tasks

- **node-cron 3** — cron scheduling
  - Billing period close (1st of month)
  - Health checks (every 30s)

## AI SDK

- **@anthropic-ai/sdk ^0.39.0** — Claude API client
  - Per-tenant client cache (`src/services/anthropic.ts`)
  - MessageStream for SSE streaming

## Payments

- **Stripe ^17.3.0** — payment processing
  - Dynamic import (only loaded when configured)
  - Webhook signature verification
  - Mock fallback for development

## Messaging

- **Twilio ^5.3.4** — WhatsApp integration
  - Dynamic import when configured
  - 35% markup on message costs

## Email

- **Resend ^4.0.0** — transactional email
  - Welcome emails, payment failures, ops alerts

## Security

- **OTPAuth ^9.3.1** — TOTP 2FA for admin users
- **Node crypto** — AES-256-GCM for API key vault, SHA-256 for key hashing

## PDF

- **PDFKit ^0.15.0** — invoice PDF generation

## Validation

- **Zod ^3.23.8** — request validation schemas

## Frontend (3 apps)

All share the same stack:
- **React 18** + **react-dom 18**
- **Vite 5** — build tool
- **Tailwind CSS 3.4** — styling
- **TypeScript 5.5**

Additional per-app:
- **dashboard/**: `@tanstack/react-query ^5.51`, `recharts ^2.12`, `react-router-dom ^6.26`
- **portal/**: `@tanstack/react-query`, `recharts`, `react-router-dom`
- **wizard/**: minimal (React only, fetches plans from API)

## Dev Dependencies

- **tsx ^4.16** — TypeScript execution (dev server)
- **@types/node**, `@types/pg`, `@types/pdfkit`, `@types/node-cron`

## Configuration

- Environment variables via `src/config.ts`
- `.env` file (not committed, `.env.example` exists)
- Key config values: `PORT`, `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MARGIN`, `STRIPE_SECRET_KEY`, `TWILIO_ACCOUNT_SID`, `VAULT_ENCRYPTION_KEY`, `METERING_PROXY_PORT`

## Build

- `npm run dev` — `tsx watch src/server.ts` (hot reload)
- `npm run build` — `tsc` (compiles to `dist/`)
- `npm run start` — `node dist/server.js`
- Frontend builds: `vite build` in each app directory
