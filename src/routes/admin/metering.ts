import type { FastifyInstance } from "fastify";
import { adminAuth } from "../../middleware/adminAuth.js";

export default async function adminMeteringRoutes(app: FastifyInstance) {
  app.addHook("preHandler", adminAuth);

  // GET /admin/metering/summary — Global metering summary
  app.get("/metering/summary", async () => {
    const result = await app.pg.query(
      `SELECT
         COUNT(*) AS total_requests,
         COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
         COALESCE(SUM(anthropic_cost::NUMERIC), 0) AS total_anthropic_cost,
         COALESCE(SUM(billed_cost::NUMERIC), 0) AS total_billed_cost,
         COALESCE(SUM(billed_cost::NUMERIC) - SUM(anthropic_cost::NUMERIC), 0) AS total_margin
       FROM usage_events
       WHERE created_at >= date_trunc('month', NOW())`,
    );

    const row = result.rows[0];

    return {
      period: "current_month",
      total_requests:      parseInt(row.total_requests, 10),
      total_input_tokens:  parseInt(row.total_input_tokens, 10),
      total_output_tokens: parseInt(row.total_output_tokens, 10),
      total_anthropic_cost: parseFloat(row.total_anthropic_cost),
      total_billed_cost:   parseFloat(row.total_billed_cost),
      total_margin:        parseFloat(row.total_margin),
    };
  });

  // GET /admin/metering/by-tenant — Per-tenant breakdown
  app.get("/metering/by-tenant", async () => {
    const result = await app.pg.query(
      `SELECT
         t.id AS tenant_id,
         t.name AS tenant_name,
         t.slug,
         t.plan_id,
         COUNT(ue.*) AS requests,
         COALESCE(SUM(ue.input_tokens + ue.output_tokens), 0) AS total_tokens,
         COALESCE(SUM(ue.anthropic_cost::NUMERIC), 0) AS anthropic_cost,
         COALESCE(SUM(ue.billed_cost::NUMERIC), 0) AS billed_cost,
         COALESCE(SUM(ue.billed_cost::NUMERIC) - SUM(ue.anthropic_cost::NUMERIC), 0) AS margin
       FROM tenants t
       LEFT JOIN usage_events ue ON ue.tenant_id = t.id
         AND ue.created_at >= date_trunc('month', NOW())
       WHERE t.active = true
       GROUP BY t.id, t.name, t.slug, t.plan_id
       ORDER BY billed_cost DESC`,
    );

    return { tenants: result.rows };
  });

  // GET /admin/metering/by-channel — Breakdown by channel (api vs openclaw vs whatsapp etc)
  app.get("/metering/by-channel", async () => {
    const result = await app.pg.query(
      `SELECT
         channel,
         COUNT(*) AS requests,
         COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
         COALESCE(SUM(anthropic_cost::NUMERIC), 0) AS anthropic_cost,
         COALESCE(SUM(billed_cost::NUMERIC), 0) AS billed_cost
       FROM usage_events
       WHERE created_at >= date_trunc('month', NOW())
       GROUP BY channel
       ORDER BY total_tokens DESC`,
    );

    return { channels: result.rows };
  });

  // GET /admin/metering/by-model — Breakdown by model
  app.get("/metering/by-model", async () => {
    const result = await app.pg.query(
      `SELECT
         model,
         COUNT(*) AS requests,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(anthropic_cost::NUMERIC), 0) AS anthropic_cost,
         COALESCE(SUM(billed_cost::NUMERIC), 0) AS billed_cost
       FROM usage_events
       WHERE created_at >= date_trunc('month', NOW())
       GROUP BY model
       ORDER BY billed_cost DESC`,
    );

    return { models: result.rows };
  });

  // GET /admin/metering/daily — Daily trend (last 30 days)
  app.get("/metering/daily", async (request) => {
    const query = request.query as { days?: string; tenant_id?: string };
    const days = parseInt(query.days ?? "30", 10);
    const params: unknown[] = [days];

    let tenantFilter = "";
    if (query.tenant_id) {
      tenantFilter = "AND tenant_id = $2";
      params.push(query.tenant_id);
    }

    const result = await app.pg.query(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*) AS requests,
         COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
         COALESCE(SUM(anthropic_cost::NUMERIC), 0) AS anthropic_cost,
         COALESCE(SUM(billed_cost::NUMERIC), 0) AS billed_cost,
         COALESCE(SUM(billed_cost::NUMERIC) - SUM(anthropic_cost::NUMERIC), 0) AS margin
       FROM usage_events
       WHERE created_at >= NOW() - INTERVAL '1 day' * $1 ${tenantFilter}
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      params,
    );

    return { daily: result.rows };
  });
}
