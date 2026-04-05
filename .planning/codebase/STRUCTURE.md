# Structure

## Directory Layout

```
OvniAi.ClawOVNI-AI-MVP-wrapper/
├── .env                    # Environment variables (not committed)
├── .env.example            # Template for .env
├── CLAUDE.md               # Project instructions for Claude Code
├── Dockerfile              # Production container build
├── docker-compose.yml      # Dev environment (Postgres + Redis)
├── package.json            # Backend dependencies and scripts
├── tsconfig.json           # TypeScript config (strict mode)
│
├── src/                    # Backend source (TypeScript)
│   ├── server.ts           # Entry point — registers everything
│   ├── config.ts           # Environment vars + plan definitions + pricing
│   ├── types.ts            # All DB row types + request contexts + Fastify augmentation
│   │
│   ├── db/                 # Database schemas and seed
│   │   ├── schema.sql              # 001: tenants, users, api_keys, usage_events
│   │   ├── billing_schema.sql      # 002: billing_periods, invoices, line_items, admin_users
│   │   ├── provisioning_schema.sql # 003: provisioning_orders
│   │   ├── messaging_schema.sql    # 004: messaging_channels, conversations
│   │   ├── audit_schema.sql        # 005: audit_logs
│   │   ├── webhooks_schema.sql     # 006: webhook_endpoints, deliveries
│   │   ├── openclaw_schema.sql     # 007: openclaw_instances, health_log, api_key_vault
│   │   └── seed.ts                 # Creates 2 demo tenants + 1 admin
│   │
│   ├── middleware/          # Fastify preHandlers
│   │   ├── auth.ts          # API key → TenantContext (SHA-256 lookup)
│   │   ├── adminAuth.ts     # Admin key → AdminContext
│   │   └── rateLimit.ts     # Redis sliding window RPM/TPM
│   │
│   ├── plugins/
│   │   └── db.ts            # Fastify plugin: Postgres pool + Redis + pg-boss
│   │
│   ├── routes/              # HTTP route handlers
│   │   ├── chat.ts          # POST /v1/chat (tenant auth)
│   │   ├── provision.ts     # POST /api/provision, GET /api/provision/plans
│   │   ├── portal.ts        # GET /portal/dashboard|usage|invoices|invoices/:id/pdf
│   │   ├── admin/           # All require adminAuth
│   │   │   ├── tenants.ts   # CRUD tenants + usage stats
│   │   │   ├── users.ts     # CRUD users + API keys
│   │   │   ├── invoices.ts  # Invoice workflow (draft→paid→void)
│   │   │   ├── instances.ts # OpenClaw lifecycle + vault + channels
│   │   │   ├── channels.ts  # Channel management
│   │   │   └── metering.ts  # Usage metrics
│   │   └── webhooks/
│   │       ├── stripe.ts    # Stripe event handler
│   │       ├── whatsapp.ts  # Twilio WhatsApp → messageRouter
│   │       └── telegram.ts  # Telegram updates → messageRouter
│   │
│   ├── services/            # Business logic (16 services)
│   │   ├── anthropic.ts     # Per-tenant Anthropic client cache
│   │   ├── apiKeyVault.ts   # AES-256-GCM encrypt/decrypt/rotate
│   │   ├── auditLog.ts      # Audit trail writer
│   │   ├── billing.ts       # Billing periods + invoice generation
│   │   ├── channelManager.ts # Configure channels via OpenClaw API
│   │   ├── email.ts         # Resend transactional emails
│   │   ├── instanceOrchestrator.ts # Docker container lifecycle
│   │   ├── keyGenerator.ts  # Generate ovni_sk_ and ovni_admin_ keys
│   │   ├── messageRouter.ts # Channel→Claude→response with history
│   │   ├── meteringProxy.ts # Separate Fastify proxy on :3001
│   │   ├── payment.ts       # Stripe or mock payment processing
│   │   ├── pdfGenerator.ts  # Invoice PDF with PDFKit
│   │   ├── provisioning.ts  # Atomic tenant provisioning transaction
│   │   ├── telegram.ts      # Telegram Bot API helpers
│   │   ├── tokenCounter.ts  # Cost calculation with margin
│   │   ├── totp.ts          # TOTP 2FA generation/verification
│   │   ├── usageEmitter.ts  # Write usage_events + enqueue billing
│   │   ├── webhookDispatcher.ts # HMAC-signed webhook delivery
│   │   └── whatsapp.ts      # Twilio WhatsApp helpers
│   │
│   └── workers/             # Background jobs
│       ├── billingWorker.ts     # pg-boss consumer
│       ├── billingCron.ts       # Monthly period close
│       └── healthCheckWorker.ts # 30s instance health checks
│
├── dashboard/               # Staff Console (Ovnicom admin)
│   ├── src/
│   │   ├── App.tsx          # Router with 7 routes
│   │   ├── pages/           # Dashboard, Tenants, TenantDetail, Invoices, InvoiceDetail, Instances, Login
│   │   ├── components/      # Layout, StatCard, StatusBadge
│   │   ├── api/             # client.ts, tenants.ts, invoices.ts, instances.ts
│   │   ├── hooks/           # useAuth.ts
│   │   └── utils/           # format.ts
│   └── (vite.config.ts, tailwind.config.js, etc.)
│
├── portal/                  # Client Portal (tenant self-service)
│   └── src/
│       └── App.tsx          # All-in-one: Login, Dashboard, Usage, Invoices
│
└── wizard/                  # Onboarding Wizard
    └── src/
        └── App.tsx          # 10-step onboarding flow
```

## Naming Conventions

- **Files:** camelCase for TypeScript (`instanceOrchestrator.ts`), snake_case for SQL (`billing_schema.sql`)
- **DB tables:** snake_case (`openclaw_instances`, `api_key_vault`)
- **DB columns:** snake_case (`tenant_id`, `created_at`)
- **TypeScript types:** PascalCase with `Row` suffix for DB types (`TenantRow`, `InvoiceRow`)
- **API keys:** `ovni_sk_` prefix for tenant, `ovni_admin_` prefix for admin
- **Routes:** REST-style (`/admin/tenants/:id`, `/portal/invoices/:id/pdf`)
- **Frontend:** PascalCase components, camelCase utilities
