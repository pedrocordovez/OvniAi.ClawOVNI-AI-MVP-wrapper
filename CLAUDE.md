# CLAUDE.md

Lee HANDOFF.md primero. Contiene el contexto completo del proyecto OVNI AI.

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what’s necessary. Avoid introducing bugs.

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don’t keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: “Would a staff engineer approve this?”
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask “is there a more elegant way?”
- If a fix feels hacky: “Knowing everything I know now, implement the elegant solution”
- Skip this for simple, obvious fixes — don’t over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don’t ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
1. **Verify Plan:** Check in before starting implementation
1. **Track Progress:** Mark items complete as you go
1. **Explain Changes:** High-level summary at each step
1. **Document Results:** Add review section to `tasks/todo.md`
1. **Capture Lessons:** Update `tasks/lessons.md` after corrections

## Project Rules

- TypeScript estricto, sin `any`
- Transacciones para toda operación multi-tabla
- API keys solo como SHA-256 hash en DB, nunca texto plano
- Emails siempre fire-and-forget
- Costos de tokens en `NUMERIC(12,6)`, fees en cents (`INT`)

**Próxima tarea prioritaria:** dashboard de staff (React + TanStack Query)
Ver sección “Lo que falta” en HANDOFF.md

<!-- GSD:project-start source:PROJECT.md -->

## Project

**OVNI AI — Production Launch**

OVNI AI is a multi-tenant SaaS platform operated by Ovnicom (Panama) that offers OpenClaw (AI agent) as a managed service to businesses. Clients get a fully managed AI assistant connected to WhatsApp, Telegram, Web Chat, and API — without touching infrastructure. Ovnicom provisions, administers, and bills each tenant with a 25% markup on Anthropic token costs plus monthly plan fees.

**Core Value:** Clients can self-provision and immediately use an AI assistant across their communication channels, while Ovnicom manages all infrastructure and billing transparently.

### Constraints

- **Timeline:** This week — must prioritize ruthlessly
- **Infrastructure:** AWS account available, Stripe configured
- **Docker:** Required for OpenClaw instances — must be on production server
- **Single operator:** Pedro manages everything — automation and simplicity are critical
- **Budget:** Reasonable AWS spend acceptable for production workload

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages & Runtime

- **TypeScript 5.5** — strict mode enabled (`strict: true` in tsconfig.json)
- **Node.js 20+** — required in `package.json` engines field
- **JSX/TSX** — React frontends use TSX

## Backend Framework

- **Fastify 4.28** — HTTP framework (`src/server.ts` entry point)

## Database

- **PostgreSQL 16** — primary data store

## Cache & Rate Limiting

- **Redis 7** — via `ioredis ^5.4.1`

## Job Queue

- **pg-boss 10** — PostgreSQL-backed job queue

## Scheduled Tasks

- **node-cron 3** — cron scheduling

## AI SDK

- **@anthropic-ai/sdk ^0.39.0** — Claude API client

## Payments

- **Stripe ^17.3.0** — payment processing

## Messaging

- **Twilio ^5.3.4** — WhatsApp integration

## Email

- **Resend ^4.0.0** — transactional email

## Security

- **OTPAuth ^9.3.1** — TOTP 2FA for admin users
- **Node crypto** — AES-256-GCM for API key vault, SHA-256 for key hashing

## PDF

- **PDFKit ^0.15.0** — invoice PDF generation

## Validation

- **Zod ^3.23.8** — request validation schemas

## Frontend (3 apps)

- **React 18** + **react-dom 18**
- **Vite 5** — build tool
- **Tailwind CSS 3.4** — styling
- **TypeScript 5.5**
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

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## TypeScript

- **Strict mode:** `strict: true` in `tsconfig.json`
- **No `any`:** Enforced by project convention
- **Module system:** ES modules (`.js` extensions in imports for Node.js ESM)
- **Target:** ES2022

## Code Style

### Imports

- Type-only imports use `import type { ... }`
- `.js` extension on all internal imports (required for Node.js ESM)

### Functions

- Named exports (no default exports in services/middleware)
- Default exports for route handlers (Fastify plugin pattern)
- Async functions throughout (no callbacks)

### Error Handling

- Services throw errors for callers to handle
- Routes catch and return appropriate HTTP status codes
- Fire-and-forget pattern for non-critical operations (emails, audit logs)

### Database Queries

- No ORM — raw SQL with `pg` driver
- Parameterized queries only (no string interpolation)
- Transactions via `client.query("BEGIN")` / `"COMMIT"` / `"ROLLBACK"`
- Client acquired from pool for transactions: `const client = await pg.connect()`

### Validation

### Route Registration

### Type Patterns

- DB row types in `src/types.ts` with `Row` suffix
- Request context types: `TenantContext`, `AdminContext`
- Fastify augmentation via `declare module "fastify"`
- NUMERIC columns from pg come as strings, parsed with `parseInt`/`parseFloat`

## Monetary Values

- **Invoice amounts:** cents as INTEGER (`total_cents`, `subtotal_cents`)
- **Token costs:** NUMERIC(12,6) as string from pg (`anthropic_cost`, `billed_cost`)
- **Frontend display:** `fmtCents(n)` → `$${(n / 100).toFixed(2)}`

## API Key Security

- Keys generated with `crypto.randomBytes(24).toString("hex")` + prefix
- Stored as SHA-256 hash only — raw key returned once at creation
- Lookup: hash incoming key, query by hash
- Anthropic keys: AES-256-GCM encrypted in `api_key_vault` table

## Frontend Patterns

- **State:** TanStack Query for server state, React useState for UI state
- **Styling:** Tailwind utility classes, custom `ovni-*` color theme
- **Auth:** Admin key stored in localStorage, sent as Bearer token
- **API calls:** Centralized `apiFetch<T>()` in `dashboard/src/api/client.ts`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Pattern

- Dedicated Anthropic API key (injected as env var)
- `ANTHROPIC_API_BASE` pointing to metering proxy so all API traffic flows through OVNI AI
- Persistent volumes for config and workspace

## Layers

```

```

## Data Flow

### Chat Request (direct API)

```

```

### Chat via Messaging Channel

```

```

### Chat via OpenClaw Instance

```

```

### Provisioning

```

```

### Billing

```

```

## Entry Points

- `src/server.ts` — main entry, registers all plugins, routes, and workers
- `src/services/meteringProxy.ts` — secondary Fastify server on :3001
- `src/db/seed.ts` — data seeding script

## Key Abstractions

- **TenantContext** (`src/types.ts:190`) — resolved by auth middleware, carried through request lifecycle
- **AdminContext** (`src/types.ts:203`) — resolved by adminAuth middleware
- **Fastify augmentation** (`src/types.ts:212`) — adds `pg`, `redis`, `boss` to FastifyInstance
- **Plan config** (`src/config.ts:25-57`) — defines plan tiers with limits, models, pricing

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.

<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` – do not edit manually.

<!-- GSD:profile-end -->