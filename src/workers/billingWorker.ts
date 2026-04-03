import type { FastifyInstance } from "fastify";
import { updateBillingPeriodTotals, closePeriodAndGenerateInvoice } from "../services/billing.js";
import { dispatchWebhook } from "../services/webhookDispatcher.js";

export function startBillingWorker(app: FastifyInstance): void {
  const { boss, pg } = app;

  // ── billing.usage — Update running totals ──────────────────
  boss.work("billing.usage", { batchSize: 1 }, async ([job]) => {
    const { tenantId, tokens, billedCost } = job.data as {
      usageEventId: string;
      tenantId:     string;
      tokens:       number;
      billedCost:   number;
    };

    await updateBillingPeriodTotals(pg, tenantId, tokens, billedCost);

    // Check usage thresholds for webhooks
    const periodResult = await pg.query(
      `SELECT bp.total_tokens, t.monthly_token_cap
       FROM billing_periods bp
       JOIN tenants t ON t.id = bp.tenant_id
       WHERE bp.tenant_id = $1 AND bp.status = 'open'
       ORDER BY bp.period_start DESC LIMIT 1`,
      [tenantId],
    );

    if (periodResult.rowCount && periodResult.rowCount > 0) {
      const { total_tokens, monthly_token_cap } = periodResult.rows[0];
      const percent = (total_tokens / monthly_token_cap) * 100;

      for (const threshold of [80, 90, 100]) {
        const prevTokens = total_tokens - tokens;
        const prevPercent = (prevTokens / monthly_token_cap) * 100;

        if (prevPercent < threshold && percent >= threshold) {
          dispatchWebhook(pg, tenantId, "usage.threshold", {
            threshold,
            current_tokens: total_tokens,
            token_cap:      monthly_token_cap,
            percent:        Math.round(percent),
          }).catch(() => {});
        }
      }
    }

    app.log.debug({ tenantId, tokens }, "Billing usage updated");
  });

  // ── billing.close_period — Generate invoice ────────────────
  boss.work("billing.close_period", { batchSize: 1 }, async ([job]) => {
    const { periodId } = job.data as { periodId: string };

    const invoiceId = await closePeriodAndGenerateInvoice(pg, periodId);

    // Get tenant info for webhook
    const result = await pg.query(
      `SELECT bp.tenant_id, i.total_cents, i.invoice_number
       FROM billing_periods bp
       JOIN invoices i ON i.billing_period_id = bp.id
       WHERE bp.id = $1 AND i.id = $2`,
      [periodId, invoiceId],
    );

    if (result.rowCount && result.rowCount > 0) {
      const { tenant_id, total_cents, invoice_number } = result.rows[0];
      dispatchWebhook(pg, tenant_id, "invoice.ready", {
        invoice_id:     invoiceId,
        invoice_number,
        total_cents,
      }).catch(() => {});
    }

    app.log.info({ periodId, invoiceId }, "Billing period closed, invoice generated");
  });

  app.log.info("Billing worker started");
}
