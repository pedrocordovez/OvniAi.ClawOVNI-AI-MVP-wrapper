# Architecture

## Pattern

**Multi-tenant SaaS with per-tenant container orchestration.**

Two main runtime processes:
1. **Main API** (`:3000`) — Fastify server handling all HTTP routes, webhooks, admin API, portal API
2. **Metering Proxy** (`:3001`) — Separate Fastify instance that intercepts OpenClaw→Anthropic API calls for token counting and billing

Per-tenant OpenClaw instances run as separate Docker containers, each with:
- Dedicated Anthropic API key (injected as env var)
- `ANTHROPIC_API_BASE` pointing to metering proxy so all API traffic flows through OVNI AI
- Persistent volumes for config and workspace

## Layers

```
┌─────────────────────────────────────────────────┐
│ Frontend Layer (3 Vite apps)                     │
│ dashboard/ (staff) · portal/ (client) · wizard/ │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│ Route Layer (src/routes/)                        │
│ chat · provision · portal · admin/* · webhooks/* │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│ Middleware Layer (src/middleware/)                │
│ auth (tenant) · adminAuth · rateLimit (Redis)   │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│ Service Layer (src/services/)                    │
│ anthropic · billing · payment · provisioning     │
│ instanceOrchestrator · channelManager            │
│ messageRouter · meteringProxy · apiKeyVault      │
│ email · whatsapp · telegram · auditLog · totp    │
│ tokenCounter · usageEmitter · webhookDispatcher  │
│ pdfGenerator · keyGenerator                      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│ Data Layer                                       │
│ PostgreSQL (pg Pool) · Redis (ioredis) · pg-boss │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│ Worker Layer (src/workers/)                      │
│ billingWorker · billingCron · healthCheckWorker  │
└─────────────────────────────────────────────────┘
```

## Data Flow

### Chat Request (direct API)
```
Client → POST /v1/chat → auth middleware (API key → TenantContext)
  → rateLimit middleware → chat route → anthropic service
  → Anthropic API → response → usageEmitter (async) → pg-boss job
```

### Chat via Messaging Channel
```
WhatsApp/Telegram webhook → parse → messageRouter
  → load conversation history → anthropic service → Anthropic API
  → save response to conversation → send reply via channel
  → usageEmitter (async)
```

### Chat via OpenClaw Instance
```
OpenClaw container → POST /v1/messages to metering proxy (:3001)
  → proxy resolves tenant by API key → forwards to api.anthropic.com
  → extracts token usage from response → records usage_event
  → returns response to OpenClaw
```

### Provisioning
```
Wizard → POST /api/provision → validate (Zod) → idempotency check
  → rate limit by IP → create order → processPayment (Stripe/mock)
  → provisionTenant (BEGIN transaction):
    INSERT tenant → INSERT user → INSERT api_key → INSERT billing_period
  → COMMIT → provisionInstance (docker run) → configureChannels
  → send welcome email → return API key
```

### Billing
```
usage_event INSERT → pg-boss job → billingWorker processes
billingCron (1st of month) → closePeriodAndGenerateInvoice
  → creates invoice + line items (token usage + seat fee)
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
