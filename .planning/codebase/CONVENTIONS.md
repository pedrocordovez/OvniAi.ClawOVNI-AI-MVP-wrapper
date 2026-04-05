# Conventions

## TypeScript

- **Strict mode:** `strict: true` in `tsconfig.json`
- **No `any`:** Enforced by project convention (CLAUDE.md)
- **Module system:** ES modules (`.js` extensions in imports for Node.js ESM)
- **Target:** ES2022

## Code Style

### Imports
```typescript
// External dependencies first
import type { Pool } from "pg";
import { z } from "zod";

// Internal imports second
import { config } from "../config.js";
import { logAudit } from "../../services/auditLog.js";
```

- Type-only imports use `import type { ... }`
- `.js` extension on all internal imports (required for Node.js ESM)

### Functions
- Named exports (no default exports in services/middleware)
- Default exports for route handlers (Fastify plugin pattern)
- Async functions throughout (no callbacks)

### Error Handling
```typescript
// Pattern: try/catch with typed error messages
try {
  // operation
} catch (err) {
  const message = err instanceof Error ? err.message : "Unknown error";
  // handle
}
```

- Services throw errors for callers to handle
- Routes catch and return appropriate HTTP status codes
- Fire-and-forget pattern for non-critical operations (emails, audit logs):
  ```typescript
  sendWelcomeEmail(email).catch(() => {}); // non-blocking
  ```

### Database Queries
```typescript
// Direct pg queries with parameterized values
const result = await pg.query(
  `SELECT * FROM tenants WHERE id = $1 AND active = true`,
  [tenantId],
);
```

- No ORM — raw SQL with `pg` driver
- Parameterized queries only (no string interpolation)
- Transactions via `client.query("BEGIN")` / `"COMMIT"` / `"ROLLBACK"`
- Client acquired from pool for transactions: `const client = await pg.connect()`

### Validation
```typescript
// Zod schemas for request validation
const schema = z.object({
  tenant_id: z.string().uuid(),
  system_prompt: z.string().optional(),
});
const parsed = schema.safeParse(request.body);
if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
```

### Route Registration
```typescript
// Fastify plugin pattern
export default async function routeName(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.get("/path", async (request, reply) => { ... });
}

// In server.ts:
await app.register(routeName, { prefix: "/admin" });
```

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
