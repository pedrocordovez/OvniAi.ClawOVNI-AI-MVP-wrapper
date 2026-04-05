# Concerns

## Security

### High Priority

- **Vault encryption key default:** `src/services/apiKeyVault.ts:5` — `VAULT_ENCRYPTION_KEY` defaults to `"0".repeat(64)` (all zeros). Production MUST set a real key.
- **Anthropic keys in tenant table:** `tenants.anthropic_api_key` stores the key in plaintext. The vault (`api_key_vault`) encrypts keys, but the tenant row still has a plaintext field used as fallback in `getTenantAnthropicKey()`.
- **Admin key in localStorage:** Dashboard stores admin bearer token in `localStorage`, vulnerable to XSS. Consider httpOnly cookies for production.
- **No CSRF protection:** Frontend apps make authenticated requests without CSRF tokens.
- **Raw card numbers flow through API:** `POST /api/provision` receives card_number, cvv in plaintext. Even with Stripe, this is PCI-DSS concerning. Should use Stripe Elements / Payment Intents client-side flow instead.

### Medium Priority

- **No request size limits:** Fastify defaults apply but no explicit body size limits configured.
- **CORS origin: true:** `src/server.ts:27` — allows all origins. Should restrict in production.
- **No rate limiting on admin endpoints:** Only tenant chat and provisioning have rate limits.

## Technical Debt

### Missing Tests
- **Zero test coverage** across entire codebase. Most critical gap.
- No CI/CD pipeline configured.

### Docker Dependency
- **Instance orchestrator requires Docker:** `src/services/instanceOrchestrator.ts` shells out to `docker` CLI via `execFile`. No Docker = no OpenClaw instances.
- **Port allocation is in-memory:** `nextPort` variable resets on server restart. The DB query fallback works but there's a race condition if two provisions happen simultaneously.

### Hardcoded Values
- **Health check interval:** 30 seconds hardcoded in env default (`src/workers/healthCheckWorker.ts:5`)
- **Metering proxy URL:** `http://host.docker.internal:3001` — Docker Desktop specific, won't work on Linux without config.
- **Max conversation history:** 20 messages hardcoded in `src/services/messageRouter.ts:12`

### Schema Concerns
- **No migration system:** Uses Docker entrypoint init scripts (only run on fresh DB). No way to apply schema changes to existing databases. Need a proper migration tool (e.g., `node-pg-migrate`, `knex migrate`).
- **ON CONFLICT clauses in seed:** Some conflict targets reference columns that may not have unique constraints, leading to potential insert failures.

## Performance

### Potential Bottlenecks
- **Metering proxy tenant resolution:** `src/services/meteringProxy.ts:28-66` — queries the DB on every single API call to resolve tenant from Anthropic key. Should cache this.
- **Health check worker:** Queries all running instances every 30 seconds, then does a `fetch` + DB update for each. At scale (100+ instances) this could be slow.
- **Conversation history loading:** `messageRouter.ts` loads full conversation JSON from `messaging_conversations` on every message. Large conversations could be slow.

### Missing Indices
- No explicit index creation visible in schema files (depends on what the SQL files contain — need to verify).

## Fragile Areas

- **Provisioning rollback:** `src/services/provisioning.ts` — if the DB transaction commits but `provisionInstance()` (Docker) fails, the tenant exists in DB but has no running instance. The order is marked "failed" but the tenant record remains.
- **Channel configuration:** `src/services/channelManager.ts:47-53` — ON CONFLICT clause references `(channel_id, external_user_id)` which may not match the actual table schema, wrapped in a `.catch()` that silently swallows errors.
- **Stripe webhook content type parser:** `src/routes/webhooks/stripe.ts:15` ��� adds a content type parser for `application/json` as buffer. This could conflict with other routes if the parser is registered globally.

## Missing for Production

1. **Docker or container runtime** — required for OpenClaw instances
2. **Proper migration system** — schema changes to existing DBs
3. **Logging/monitoring** — no structured log aggregation, no metrics
4. **Backup strategy** — no DB backup configuration
5. **SSL/TLS** — no HTTPS configuration (expects reverse proxy)
6. **Environment validation** — no startup check that required env vars are set
7. **Graceful shutdown** — no shutdown handler for cleaning up connections/workers
