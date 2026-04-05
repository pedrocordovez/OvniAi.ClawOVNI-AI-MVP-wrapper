import type { FastifyInstance } from "fastify";
import { tenantAuth } from "../middleware/auth.js";
import { generateInvoicePdf } from "../services/pdfGenerator.js";
import { getCreditStatus, getCreditHistory } from "../services/creditManager.js";

export default async function portalRoutes(app: FastifyInstance) {

  app.addHook("preHandler", tenantAuth);

  // GET /portal/dashboard
  app.get("/portal/dashboard", async (request) => {
    const tenant = request.tenant!;

    const [tenantInfo, periodInfo, usageInfo, instanceInfo] = await Promise.all([
      app.pg.query(
        `SELECT name, slug, plan_id, default_model, monthly_token_cap, rpm_limit,
                credit_balance_cents, auto_recharge, recharge_amount_cents,
                recharge_threshold_cents, suspended, suspended_reason
         FROM tenants WHERE id = $1`,
        [tenant.tenantId],
      ),
      app.pg.query(
        `SELECT * FROM billing_periods
         WHERE tenant_id = $1 AND status = 'open'
         ORDER BY period_start DESC LIMIT 1`,
        [tenant.tenantId],
      ),
      app.pg.query(
        `SELECT
           COUNT(*) AS total_requests,
           COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
           COALESCE(SUM(billed_cost::NUMERIC), 0) AS total_cost
         FROM usage_events
         WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())`,
        [tenant.tenantId],
      ),
      app.pg.query(
        `SELECT status, health_status, channels, gateway_url, last_health_check
         FROM openclaw_instances WHERE tenant_id = $1`,
        [tenant.tenantId],
      ),
    ]);

    const t = tenantInfo.rows[0];
    const instance = instanceInfo.rows[0] ?? null;
    const usage = usageInfo.rows[0];
    const totalTokens = parseInt(usage.total_tokens, 10);

    return {
      tenant: {
        name:  t.name,
        slug:  t.slug,
        plan:  t.plan_id,
        model: t.default_model,
      },
      credit: {
        balance_cents:           t.credit_balance_cents,
        auto_recharge:           t.auto_recharge,
        recharge_amount_cents:   t.recharge_amount_cents,
        recharge_threshold_cents: t.recharge_threshold_cents,
        suspended:               t.suspended,
        suspended_reason:        t.suspended_reason,
      },
      current_period: periodInfo.rows[0] ?? null,
      usage: {
        total_requests: parseInt(usage.total_requests, 10),
        total_tokens:   totalTokens,
        total_cost:     parseFloat(usage.total_cost),
        token_cap:      t.monthly_token_cap,
        usage_percent:  Math.round((totalTokens / t.monthly_token_cap) * 100),
      },
      instance: instance ? {
        status:        instance.status,
        health:        instance.health_status,
        channels:      instance.channels,
        last_check:    instance.last_health_check,
      } : null,
    };
  });

  // GET /portal/usage
  app.get("/portal/usage", async (request) => {
    const tenant = request.tenant!;
    const query = request.query as { page?: string; limit?: string; days?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, parseInt(query.limit ?? "50", 10));
    const days = parseInt(query.days ?? "30", 10);
    const offset = (page - 1) * limit;

    const result = await app.pg.query(
      `SELECT id, model, input_tokens, output_tokens, billed_cost, latency_ms, status, channel, created_at
       FROM usage_events
       WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [tenant.tenantId, days, limit, offset],
    );

    return { usage: result.rows, pagination: { page, limit } };
  });

  // GET /portal/invoices
  app.get("/portal/invoices", async (request) => {
    const tenant = request.tenant!;

    const result = await app.pg.query(
      `SELECT id, invoice_number, subtotal_cents, total_cents, status, created_at, paid_at
       FROM invoices
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenant.tenantId],
    );

    return { invoices: result.rows };
  });

  // GET /portal/invoices/:id
  app.get<{ Params: { id: string } }>("/portal/invoices/:id", async (request, reply) => {
    const tenant = request.tenant!;
    const { id } = request.params;

    const [invoiceResult, itemsResult] = await Promise.all([
      app.pg.query(
        `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
        [id, tenant.tenantId],
      ),
      app.pg.query(
        `SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at`,
        [id],
      ),
    ]);

    if (!invoiceResult.rowCount) return reply.status(404).send({ error: "Invoice not found" });

    return { ...invoiceResult.rows[0], line_items: itemsResult.rows };
  });

  // GET /portal/invoices/:id/pdf
  app.get<{ Params: { id: string } }>("/portal/invoices/:id/pdf", async (request, reply) => {
    const tenant = request.tenant!;
    const { id } = request.params;

    const [invoiceResult, itemsResult, tenantResult] = await Promise.all([
      app.pg.query(`SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`, [id, tenant.tenantId]),
      app.pg.query(`SELECT * FROM invoice_line_items WHERE invoice_id = $1`, [id]),
      app.pg.query(`SELECT * FROM tenants WHERE id = $1`, [tenant.tenantId]),
    ]);

    if (!invoiceResult.rowCount) return reply.status(404).send({ error: "Invoice not found" });

    const pdf = generateInvoicePdf(invoiceResult.rows[0], itemsResult.rows, tenantResult.rows[0]);

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${invoiceResult.rows[0].invoice_number}.pdf"`)
      .send(pdf);
  });

  // GET /portal/credit — credit balance and transaction history
  app.get("/portal/credit", async (request) => {
    const tenant = request.tenant!;

    const [status, history] = await Promise.all([
      getCreditStatus(app.pg, tenant.tenantId),
      getCreditHistory(app.pg, tenant.tenantId, 50),
    ]);

    return { credit: status, transactions: history };
  });
}
