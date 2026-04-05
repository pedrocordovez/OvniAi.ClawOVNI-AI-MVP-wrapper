# Testing

## Current State

**No tests exist.** Zero test files, no test framework configured, no test scripts in package.json.

## Test Framework (Planned)

- `CLAUDE.md` mentions Vitest as the intended test framework
- No `vitest` dependency in package.json yet

## What Needs Testing

### Critical Path (highest priority)
1. **Provisioning flow** (`src/services/provisioning.ts`) — atomic transaction, multi-table
2. **Auth middleware** (`src/middleware/auth.ts`) — SHA-256 key lookup, context resolution
3. **Billing** (`src/services/billing.ts`) — period management, invoice generation
4. **Token counting** (`src/services/tokenCounter.ts`) — cost calculation with margin
5. **Payment** (`src/services/payment.ts`) — Stripe + mock paths

### Service Tests
6. **API Key Vault** (`src/services/apiKeyVault.ts`) — encrypt/decrypt/rotate
7. **Message Router** (`src/services/messageRouter.ts`) — conversation history, Claude call
8. **Usage Emitter** (`src/services/usageEmitter.ts`) — usage event recording
9. **Webhook Dispatcher** (`src/services/webhookDispatcher.ts`) — HMAC signing, delivery

### Integration Tests
10. **Full provisioning** — POST /api/provision → tenant + user + key + billing period
11. **Chat endpoint** — POST /v1/chat → auth → rate limit → Anthropic → usage event
12. **Metering proxy** — forward to Anthropic, extract tokens, record usage
13. **Stripe webhook** — signature verification, event handling

### Frontend Tests
- No test setup in any of the 3 frontend apps
- Could use Vitest + React Testing Library

## Test Infrastructure Needed

```json
// package.json additions needed
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Mocking Strategy

- **Database:** Test against real Postgres (Docker or local) — no mocking DB
- **Redis:** Test against real Redis
- **Anthropic API:** Mock with `vi.mock()` — don't hit real API in tests
- **Stripe:** Use test mode keys or mock
- **Docker:** Mock `execFile` for instance orchestrator tests
- **Email:** Mock Resend client
