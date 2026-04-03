import type { Pool } from "pg";
import type PgBoss from "pg-boss";

export interface UsageEventInput {
  tenantId:      string;
  userId:        string | null;
  model:         string;
  inputTokens:   number;
  outputTokens:  number;
  anthropicCost: number;
  billedCost:    number;
  latencyMs:     number | null;
  status:        string;
  channel?:      string;
}

export async function recordUsage(
  pg: Pool,
  boss: PgBoss,
  event: UsageEventInput,
): Promise<string> {
  const result = await pg.query(
    `INSERT INTO usage_events
       (tenant_id, user_id, model, input_tokens, output_tokens,
        anthropic_cost, billed_cost, latency_ms, status, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      event.tenantId, event.userId, event.model,
      event.inputTokens, event.outputTokens,
      event.anthropicCost, event.billedCost,
      event.latencyMs, event.status,
      event.channel ?? "api",
    ],
  );

  const usageId: string = result.rows[0].id;

  // Enqueue billing job (non-blocking)
  await boss.send("billing.usage", {
    usageEventId: usageId,
    tenantId:     event.tenantId,
    tokens:       event.inputTokens + event.outputTokens,
    billedCost:   event.billedCost,
  });

  return usageId;
}
