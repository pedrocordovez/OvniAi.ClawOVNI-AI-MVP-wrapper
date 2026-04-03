import type { Pool } from "pg";
import type PgBoss from "pg-boss";
import type { TenantRow } from "../types.js";
import { getAnthropicClient } from "./anthropic.js";
import { calculateCost } from "./tokenCounter.js";
import { recordUsage } from "./usageEmitter.js";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY = 20; // keep last N messages for context

export async function routeMessage(
  pg: Pool,
  boss: PgBoss,
  tenant: TenantRow,
  channelId: string,
  externalUserId: string,
  userMessage: string,
  channel: "whatsapp" | "telegram",
): Promise<string> {
  // Load or create conversation
  const convResult = await pg.query(
    `INSERT INTO messaging_conversations (channel_id, tenant_id, external_user_id, messages)
     VALUES ($1, $2, $3, '[]')
     ON CONFLICT (channel_id, external_user_id) DO UPDATE SET updated_at = NOW()
     RETURNING id, messages`,
    [channelId, tenant.id, externalUserId],
  );

  const convId = convResult.rows[0].id as string;
  const history: ConversationMessage[] = convResult.rows[0].messages as ConversationMessage[];

  // Add user message to history
  history.push({ role: "user", content: userMessage });

  // Build messages for Claude
  const messages = history.slice(-MAX_HISTORY).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Call Claude
  const client = getAnthropicClient(tenant.id, tenant.anthropic_api_key);
  const startTime = Date.now();

  const response = await client.messages.create({
    model:      tenant.default_model,
    max_tokens: 1024,
    system:     tenant.system_prompt ?? undefined,
    messages,
  });

  const latencyMs = Date.now() - startTime;

  const assistantText = response.content
    .filter(block => block.type === "text")
    .map(block => block.type === "text" ? block.text : "")
    .join("");

  // Add assistant response to history
  history.push({ role: "assistant", content: assistantText });

  // Persist updated conversation (keep last MAX_HISTORY * 2)
  const trimmedHistory = history.slice(-(MAX_HISTORY * 2));
  await pg.query(
    `UPDATE messaging_conversations SET messages = $2, updated_at = NOW() WHERE id = $1`,
    [convId, JSON.stringify(trimmedHistory)],
  );

  // Record usage
  const cost = calculateCost(
    tenant.default_model,
    response.usage.input_tokens,
    response.usage.output_tokens,
  );

  await recordUsage(pg, boss, {
    tenantId:      tenant.id,
    userId:        null,
    model:         tenant.default_model,
    inputTokens:   response.usage.input_tokens,
    outputTokens:  response.usage.output_tokens,
    anthropicCost: cost.anthropicCost,
    billedCost:    cost.billedCost,
    latencyMs,
    status:        "success",
    channel,
  });

  return assistantText;
}
