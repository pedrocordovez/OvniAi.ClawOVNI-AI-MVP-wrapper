import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { tenantAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { getAnthropicClient } from "../services/anthropic.js";
import { calculateCost } from "../services/tokenCounter.js";
import { recordUsage } from "../services/usageEmitter.js";
import { deductUsageCredit, processAutoRecharge } from "../services/creditManager.js";
import type { TenantContext } from "../types.js";

const ChatSchema = z.object({
  messages: z.array(z.object({
    role:    z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).min(1),
  model:      z.string().optional(),
  max_tokens: z.number().int().min(1).max(128_000).optional(),
  stream:     z.boolean().optional().default(false),
});

export default async function chatRoutes(app: FastifyInstance) {

  app.post("/v1/chat", {
    preHandler: [tenantAuth, checkRateLimit],
  }, async (request, reply) => {
    const tenant = request.tenant!;

    const parsed = ChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error:   "invalid_request",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { messages, max_tokens, stream } = parsed.data;
    const model = parsed.data.model ?? tenant.defaultModel;

    if (tenant.allowedModels.length > 0 && !tenant.allowedModels.includes(model)) {
      return reply.status(400).send({
        error:   "model_not_allowed",
        message: `Model "${model}" is not in your allowed models list`,
        allowed: tenant.allowedModels,
      });
    }

    const client = getAnthropicClient(tenant.tenantId, tenant.anthropicApiKey);
    const startTime = Date.now();

    try {
      if (stream) {
        return await handleStreaming(app, reply, client, tenant, model, messages, max_tokens ?? 1024, startTime);
      } else {
        return await handleSync(app, reply, client, tenant, model, messages, max_tokens ?? 1024, startTime);
      }
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      app.log.error({ err, tenantId: tenant.tenantId }, "Chat request failed");

      recordUsage(app.pg, app.boss, {
        tenantId: tenant.tenantId, userId: tenant.userId, model,
        inputTokens: 0, outputTokens: 0, anthropicCost: 0, billedCost: 0,
        latencyMs, status: "error",
      }).catch(() => {});

      return reply.status(502).send({
        error: "upstream_error",
        message: "Failed to get response from AI provider",
      });
    }
  });
}

async function handleSync(
  app: FastifyInstance,
  reply: FastifyReply,
  client: Anthropic,
  tenant: TenantContext,
  model: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number,
  startTime: number,
) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: tenant.systemPrompt ?? undefined,
    messages,
  });

  const latencyMs = Date.now() - startTime;
  const cost = calculateCost(model, response.usage.input_tokens, response.usage.output_tokens);

  recordUsage(app.pg, app.boss, {
    tenantId: tenant.tenantId, userId: tenant.userId, model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    anthropicCost: cost.anthropicCost, billedCost: cost.billedCost,
    latencyMs, status: "success",
  }).catch(err => app.log.warn({ err }, "Failed to record usage"));

  // Deduct from prepaid credit balance
  const billedCents = Math.ceil(cost.billedCost * 100);
  deductUsageCredit(app.pg, tenant.tenantId, billedCents, model,
    response.usage.input_tokens, response.usage.output_tokens,
  ).then(({ needsRecharge }) => {
    if (needsRecharge) {
      processAutoRecharge(app.pg, tenant.tenantId)
        .catch(err => app.log.warn({ err }, "Auto-recharge failed"));
    }
  }).catch(err => app.log.warn({ err }, "Credit deduction failed"));

  return reply.send({
    id:      response.id,
    model:   response.model,
    content: response.content,
    usage: {
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    stop_reason: response.stop_reason,
  });
}

async function handleStreaming(
  app: FastifyInstance,
  reply: FastifyReply,
  client: Anthropic,
  tenant: TenantContext,
  model: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number,
  startTime: number,
) {
  reply.raw.writeHead(200, {
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection":    "keep-alive",
  });

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: tenant.systemPrompt ?? undefined,
    messages,
  });

  let inputTokens = 0;
  let outputTokens = 0;

  stream.on("text", (text) => {
    reply.raw.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { text } })}\n\n`);
  });

  stream.on("message", (message) => {
    inputTokens = message.usage.input_tokens;
    outputTokens = message.usage.output_tokens;
  });

  stream.on("error", (err) => {
    app.log.error({ err }, "Stream error");
    reply.raw.write(`data: ${JSON.stringify({ type: "error", error: "Stream interrupted" })}\n\n`);
    reply.raw.end();
  });

  stream.on("end", () => {
    reply.raw.write(`data: ${JSON.stringify({ type: "message_stop", usage: { input_tokens: inputTokens, output_tokens: outputTokens } })}\n\n`);
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();

    const latencyMs = Date.now() - startTime;
    const cost = calculateCost(model, inputTokens, outputTokens);

    recordUsage(app.pg, app.boss, {
      tenantId: tenant.tenantId, userId: tenant.userId, model,
      inputTokens, outputTokens,
      anthropicCost: cost.anthropicCost, billedCost: cost.billedCost,
      latencyMs, status: "success",
    }).catch(err => app.log.warn({ err }, "Failed to record usage"));

    // Deduct from prepaid credit balance
    const billedCents = Math.ceil(cost.billedCost * 100);
    deductUsageCredit(app.pg, tenant.tenantId, billedCents, model, inputTokens, outputTokens)
      .then(({ needsRecharge }) => {
        if (needsRecharge) {
          processAutoRecharge(app.pg, tenant.tenantId)
            .catch(err => app.log.warn({ err }, "Auto-recharge failed"));
        }
      }).catch(err => app.log.warn({ err }, "Credit deduction failed"));
  });

  await stream.finalMessage();
}
