# OVNI AI — Production Launch

## What This Is

OVNI AI is a multi-tenant SaaS platform operated by Ovnicom (Panama) that offers OpenClaw (AI agent) as a managed service to businesses. Clients get a fully managed AI assistant connected to WhatsApp, Telegram, Web Chat, and API — without touching infrastructure. Ovnicom provisions, administers, and bills each tenant with a 25% markup on Anthropic token costs plus monthly plan fees.

## Core Value

Clients can self-provision and immediately use an AI assistant across their communication channels, while Ovnicom manages all infrastructure and billing transparently.

## Requirements

### Validated

- ✓ Multi-tenant wrapper with auth, rate limiting, token counting, margin engine — existing
- ✓ Streaming and sync chat completion (POST /v1/chat) — existing
- ✓ Per-tenant Anthropic client with key isolation — existing
- ✓ Billing platform (usage_events → billing_periods → invoices) — existing
- ✓ Auto-provisioning flow (POST /api/provision) with idempotency — existing
- ✓ Stripe integration (payment + webhook) — existing
- ✓ Instance Orchestrator (Docker container lifecycle) — existing
- ✓ Metering Proxy (intercept and bill OpenClaw API calls) — existing
- ✓ API Key Vault (AES-256-GCM encryption at rest) — existing
- ✓ Channel Manager (configure/disconnect via OpenClaw API) — existing
- ✓ Message Router (channel → conversation history → Claude → reply) — existing
- ✓ WhatsApp via Twilio (webhook + send + 35% markup) — existing
- ✓ Telegram (parse + send + set webhook) — existing
- ✓ Health Check Worker (30s cron, auto-restart) — existing
- ✓ Audit logs, TOTP 2FA, PDF invoices, webhook dispatcher — existing
- ✓ Staff Dashboard (React, 7 pages) — existing
- ✓ Client Portal (React, dashboard + usage + invoices + PDF) — existing
- ✓ Onboarding Wizard (React, 10-step flow) — existing

### Active

- [ ] Deploy to AWS (ECS/EC2 + RDS + ElastiCache + Docker host)
- [ ] Production security hardening (CORS, env validation, PCI flow, vault key)
- [ ] Docker host for OpenClaw instances (EC2 or ECS with Docker)
- [ ] Web Chat widget (embeddable JS widget for client websites)
- [ ] Domain + SSL (ovni.ai or similar, reverse proxy)
- [ ] Connect Stripe production keys + webhook endpoint
- [ ] Database migrations system (for schema changes post-launch)
- [ ] Basic monitoring and alerting (CloudWatch or similar)
- [ ] End-to-end test of full flow (provision → instance → chat → billing)

### Out of Scope

- Slack/Teams integrations — defer to v2, not needed for launch
- Comprehensive test suite — defer to post-launch stabilization
- Multi-host scaling — single Docker host sufficient for initial clients
- Mobile app — web-first
- OAuth/SSO for client portal — API key auth sufficient for v1
- Custom OpenClaw skills per tenant — standard config for now

## Context

- **Existing code:** Backend compiles clean (tsc --noEmit = 0 errors), all 3 frontends build successfully
- **Server tested:** API responds correctly on localhost (health, plans, admin, portal, provisioning)
- **Blocker:** Docker not installed on dev machine — instance orchestration untested end-to-end
- **Codebase map:** 7 documents in .planning/codebase/ covering stack, architecture, structure, conventions, testing, integrations, concerns
- **Key concerns from codebase audit:** zero tests, vault key defaults to zeros, Anthropic keys in plaintext on tenant row, raw card numbers through API, no migration system, no graceful shutdown
- **Team:** Pedro (CEO/founder), building with Claude Code
- **Timeline:** Launch this week — clients are waiting

## Constraints

- **Timeline:** This week — must prioritize ruthlessly
- **Infrastructure:** AWS account available, Stripe configured
- **Docker:** Required for OpenClaw instances — must be on production server
- **Single operator:** Pedro manages everything — automation and simplicity are critical
- **Budget:** Reasonable AWS spend acceptable for production workload

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fastify over Express | Already built, performant, TypeScript-native | ✓ Good |
| pg-boss over Bull/BullMQ | Uses existing Postgres, no extra infra | ✓ Good |
| Per-tenant Docker containers | Full isolation, independent lifecycle | — Pending (untested at scale) |
| Metering proxy architecture | Transparent billing without modifying OpenClaw | ✓ Good |
| Raw SQL over ORM | Full control, no abstraction leaks | ✓ Good |
| 3 separate frontend apps | Clean separation of concerns (staff/client/wizard) | ✓ Good |
| Launch without tests | Time pressure, clients waiting — add tests post-launch | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-04 after initialization*
