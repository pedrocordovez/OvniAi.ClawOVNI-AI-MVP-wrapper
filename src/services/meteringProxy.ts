import Fastify from "fastify";
import type { FastifyInstance as MeteringServer } from "fastify";
import type { Pool } from "pg";
import type PgBoss from "pg-boss";
import { calculateCost } from "./tokenCounter.js";
import { recordUsage } from "./usageEmitter.js";

const ANTHROPIC_BASE = "https://api.anthropic.com";

interface TenantLookup {
  tenantId:  string;
  tenantSlug: string;
}

// ─── Start the metering proxy server ─────────────────────────────────────────

export async function startMeteringProxy(
  pg: Pool,
  boss: PgBoss,
  port: number,
): Promise<MeteringServer> {
  const proxy = Fastify({ logger: { level: "info" } });

  // ── Resolve tenant from Anthropic API key ──────────────────
  // OpenClaw sends its Anthropic key in the x-api-key header.
  // We look up which tenant owns this key via the vault or tenant table.

  async function resolveTenant(anthropicKey: string): Promise<TenantLookup | null> {
    // First try vault (encrypted keys assigned to tenants)
    const vaultResult = await pg.query(
      `SELECT v.assigned_to AS tenant_id, t.slug AS tenant_slug
       FROM api_key_vault v
       JOIN tenants t ON t.id = v.assigned_to
       WHERE v.active = true AND v.assigned_to IS NOT NULL`,
    );

    // For vault keys we can't compare directly (they're encrypted),
    // so we fall back to matching via the tenant's anthropic_api_key field
    const tenantResult = await pg.query(
      `SELECT id AS tenant_id, slug AS tenant_slug
       FROM tenants
       WHERE anthropic_api_key = $1 AND active = true
       LIMIT 1`,
      [anthropicKey],
    );

    if (tenantResult.rowCount && tenantResult.rowCount > 0) {
      return tenantResult.rows[0] as TenantLookup;
    }

    // Also check instances — the key might be injected directly
    const instanceResult = await pg.query(
      `SELECT oi.tenant_id, t.slug AS tenant_slug
       FROM openclaw_instances oi
       JOIN tenants t ON t.id = oi.tenant_id
       WHERE t.anthropic_api_key = $1 AND t.active = true
       LIMIT 1`,
      [anthropicKey],
    );

    if (instanceResult.rowCount && instanceResult.rowCount > 0) {
      return instanceResult.rows[0] as TenantLookup;
    }

    return null;
  }

  // ── POST /v1/messages — Main Claude API proxy ──────────────
  proxy.post("/v1/messages", async (request, reply) => {
    const apiKey = (request.headers["x-api-key"] as string) ?? "";
    const anthropicVersion = (request.headers["anthropic-version"] as string) ?? "2023-06-01";

    if (!apiKey) {
      return reply.status(401).send({ error: "Missing x-api-key header" });
    }

    const tenant = await resolveTenant(apiKey);
    if (!tenant) {
      // Unknown key — still proxy it but don't meter
      proxy.log.warn("Metering proxy: unknown API key, forwarding without metering");
    }

    const body = request.body as Record<string, unknown>;
    const model = (body.model as string) ?? "claude-sonnet-4-20250514";
    const isStream = body.stream === true;
    const startTime = Date.now();

    // ── Forward to Anthropic ──────────────────────────────────
    const upstreamHeaders: Record<string, string> = {
      "x-api-key":         apiKey,
      "anthropic-version":  anthropicVersion,
      "content-type":       "application/json",
    };

    // Copy anthropic beta headers if present
    const betaHeader = request.headers["anthropic-beta"] as string | undefined;
    if (betaHeader) upstreamHeaders["anthropic-beta"] = betaHeader;

    const upstreamResponse = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
      method:  "POST",
      headers: upstreamHeaders,
      body:    JSON.stringify(body),
    });

    if (!upstreamResponse.ok) {
      const errorBody = await upstreamResponse.text();
      return reply
        .status(upstreamResponse.status)
        .headers(extractSafeHeaders(upstreamResponse.headers))
        .send(errorBody);
    }

    // ── Streaming response ────────────────────────────────────
    if (isStream && upstreamResponse.body) {
      reply.raw.writeHead(upstreamResponse.status, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });

      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;
          reply.raw.write(chunk);

          // Parse SSE events to extract usage from message_stop
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (event.type === "message_delta" && event.usage) {
                outputTokens = event.usage.output_tokens ?? outputTokens;
              }
              if (event.type === "message_start" && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens ?? 0;
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        }
      } finally {
        reply.raw.end();
      }

      // Record metered usage
      if (tenant && (inputTokens > 0 || outputTokens > 0)) {
        const latencyMs = Date.now() - startTime;
        const cost = calculateCost(model, inputTokens, outputTokens);

        recordUsage(pg, boss, {
          tenantId:      tenant.tenantId,
          userId:        null,
          model,
          inputTokens,
          outputTokens,
          anthropicCost: cost.anthropicCost,
          billedCost:    cost.billedCost,
          latencyMs,
          status:        "success",
          channel:       "openclaw",
        }).catch(err => proxy.log.warn({ err }, "Failed to record metered usage"));
      }

      return;
    }

    // ── Non-streaming response ────────────────────────────────
    const responseBody = await upstreamResponse.json() as Record<string, unknown>;

    // Extract usage from response
    if (tenant && responseBody.usage) {
      const usage = responseBody.usage as { input_tokens: number; output_tokens: number };
      const latencyMs = Date.now() - startTime;
      const cost = calculateCost(model, usage.input_tokens, usage.output_tokens);

      recordUsage(pg, boss, {
        tenantId:      tenant.tenantId,
        userId:        null,
        model,
        inputTokens:   usage.input_tokens,
        outputTokens:  usage.output_tokens,
        anthropicCost: cost.anthropicCost,
        billedCost:    cost.billedCost,
        latencyMs,
        status:        "success",
        channel:       "openclaw",
      }).catch(err => proxy.log.warn({ err }, "Failed to record metered usage"));
    }

    return reply
      .status(upstreamResponse.status)
      .send(responseBody);
  });

  // ── Catch-all: proxy other Anthropic endpoints unchanged ───
  proxy.all("/*", async (request, reply) => {
    const apiKey = (request.headers["x-api-key"] as string) ?? "";
    const url = `${ANTHROPIC_BASE}${request.url}`;

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (apiKey) headers["x-api-key"] = apiKey;

    const anthropicVersion = request.headers["anthropic-version"] as string | undefined;
    if (anthropicVersion) headers["anthropic-version"] = anthropicVersion;

    const fetchOptions: RequestInit = {
      method:  request.method,
      headers,
    };

    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
      fetchOptions.body = JSON.stringify(request.body);
    }

    const upstreamResponse = await fetch(url, fetchOptions);
    const body = await upstreamResponse.text();

    return reply
      .status(upstreamResponse.status)
      .header("content-type", upstreamResponse.headers.get("content-type") ?? "application/json")
      .send(body);
  });

  await proxy.listen({ port, host: "0.0.0.0" });
  proxy.log.info(`Metering proxy listening on port ${port}`);

  return proxy;
}

function extractSafeHeaders(headers: Headers): Record<string, string> {
  const safe: Record<string, string> = {};
  const allowList = ["content-type", "x-request-id", "request-id"];
  for (const key of allowList) {
    const val = headers.get(key);
    if (val) safe[key] = val;
  }
  return safe;
}
