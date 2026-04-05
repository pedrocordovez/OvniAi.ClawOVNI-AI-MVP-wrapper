# Integrations

## Anthropic Claude API

- **Service:** `src/services/anthropic.ts`
- **Usage:** Per-tenant client cache (`Map<tenantId, Anthropic>`)
- **Endpoints proxied:** POST /v1/messages (sync + streaming)
- **Metering proxy:** `src/services/meteringProxy.ts` — runs on :3001, intercepts all OpenClaw→Anthropic traffic, records token usage and billing
- **Auth:** x-api-key header with per-tenant Anthropic key
- **Models configured:** claude-haiku-4-5, claude-sonnet-4, claude-opus-4

## PostgreSQL

- **Connection:** `src/plugins/db.ts` — Pool from `pg`
- **URL:** `DATABASE_URL` env var (default: `postgres://ovni:ovni_secret@localhost:5432/ovni_wrapper`)
- **Tables:** 17 across 7 schema files
- **Transactions:** Used for multi-table operations (provisioning, billing)

## Redis

- **Connection:** `src/plugins/db.ts` — `ioredis`
- **URL:** `REDIS_URL` env var (default: `redis://localhost:6379`)
- **Usage:** Rate limiting sliding windows (RPM/TPM per tenant)

## Stripe

- **Service:** `src/services/payment.ts`
- **Webhook:** `src/routes/webhooks/stripe.ts`
- **Events handled:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.payment_failed`
- **Features:** PaymentIntents, PaymentMethods, signature verification, idempotency via audit_logs
- **Fallback:** Mock payment in dev (when `STRIPE_SECRET_KEY` not set)

## Twilio (WhatsApp)

- **Service:** `src/services/whatsapp.ts`
- **Webhook:** `src/routes/webhooks/whatsapp.ts` — POST `/webhooks/whatsapp/:tenantId`
- **Flow:** Twilio webhook → parse → routeMessage → Claude → sendWhatsAppMessage
- **Fallback:** Console log mock when Twilio not configured

## Telegram Bot API

- **Service:** `src/services/telegram.ts`
- **Webhook:** `src/routes/webhooks/telegram.ts` — POST `/webhooks/telegram/:tenantId`
- **Flow:** Telegram update → parse → routeMessage → Claude → sendTelegramMessage
- **Setup:** `setTelegramWebhook()` to register webhook URL with Telegram

## Resend (Email)

- **Service:** `src/services/email.ts`
- **Usage:** Welcome emails, payment failure notifications, ops alerts
- **Pattern:** Fire-and-forget (never blocks HTTP response)

## Docker (OpenClaw Instances)

- **Service:** `src/services/instanceOrchestrator.ts`
- **Operations:** provision, stop, start, restart, pause, destroy
- **Network:** Dedicated Docker network (`ovni-ai-instances`)
- **Volumes:** Per-tenant config + workspace volumes at `OPENCLAW_VOLUMES_BASE`
- **Health:** `src/workers/healthCheckWorker.ts` — cron every 30s, auto-restart on crash

## pg-boss (Job Queue)

- **Init:** `src/plugins/db.ts`
- **Workers:** `src/workers/billingWorker.ts` — processes `billing.usage` and `billing.close_period` jobs
- **Producers:** `src/services/usageEmitter.ts` — enqueues usage events

## Webhook Dispatcher (Outbound)

- **Service:** `src/services/webhookDispatcher.ts`
- **Tables:** `webhook_endpoints`, `webhook_deliveries`
- **Auth:** HMAC-SHA256 signatures (`X-OVNI-Signature` header)
- **Timeout:** 10s per delivery, best-effort logging
