import type { FastifyRequest, FastifyReply } from "fastify";
import { hashKey } from "../services/keyGenerator.js";
import type { TenantContext } from "../types.js";

export async function tenantAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7);
  if (!token.startsWith("ovni_sk_") && !token.startsWith("ovni_")) {
    reply.status(401).send({ error: "Invalid API key format" });
    return;
  }

  const keyHash = hashKey(token);

  const result = await request.server.pg.query(
    `SELECT
       ak.id AS key_id, ak.user_id,
       t.id AS tenant_id, t.anthropic_api_key, t.default_model,
       t.allowed_models, t.system_prompt, t.rpm_limit, t.tpm_limit,
       t.monthly_token_cap, t.plan_id
     FROM api_keys ak
     JOIN tenants t ON t.id = ak.tenant_id
     WHERE ak.key_hash = $1 AND ak.active = true AND t.active = true`,
    [keyHash],
  );

  if (!result.rowCount || result.rowCount === 0) {
    reply.status(401).send({ error: "Invalid or revoked API key" });
    return;
  }

  const row = result.rows[0];

  const tenant: TenantContext = {
    tenantId:        row.tenant_id,
    userId:          row.user_id,
    anthropicApiKey: row.anthropic_api_key,
    defaultModel:    row.default_model,
    allowedModels:   row.allowed_models ?? [],
    systemPrompt:    row.system_prompt,
    rpmLimit:        row.rpm_limit,
    tpmLimit:        row.tpm_limit,
    monthlyTokenCap: row.monthly_token_cap,
    planId:          row.plan_id,
  };

  request.tenant = tenant;

  // Update last_used_at (fire-and-forget)
  request.server.pg.query(
    `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
    [row.key_id],
  ).catch(() => {});
}
