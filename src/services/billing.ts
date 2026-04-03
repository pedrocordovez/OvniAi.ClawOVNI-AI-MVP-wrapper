import type { Pool, PoolClient } from "pg";

export async function getOrCreateBillingPeriod(
  pg: Pool,
  tenantId: string,
  date: Date = new Date(),
): Promise<string> {
  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const startStr = periodStart.toISOString().split("T")[0];
  const endStr = periodEnd.toISOString().split("T")[0];

  // Try to find existing
  const existing = await pg.query(
    `SELECT id FROM billing_periods
     WHERE tenant_id = $1 AND period_start = $2 AND status = 'open'`,
    [tenantId, startStr],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0].id as string;
  }

  // Create new
  const result = await pg.query(
    `INSERT INTO billing_periods (tenant_id, period_start, period_end, status)
     VALUES ($1, $2, $3, 'open')
     ON CONFLICT (tenant_id, period_start) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [tenantId, startStr, endStr],
  );

  return result.rows[0].id as string;
}

export async function updateBillingPeriodTotals(
  pg: Pool,
  tenantId: string,
  tokens: number,
  billedCost: number,
): Promise<void> {
  const periodStart = new Date();
  const startStr = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
    .toISOString().split("T")[0];

  await pg.query(
    `UPDATE billing_periods
     SET total_tokens = total_tokens + $3,
         total_billed_cost = total_billed_cost + $4
     WHERE tenant_id = $1 AND period_start = $2 AND status = 'open'`,
    [tenantId, startStr, tokens, billedCost],
  );
}

export async function closePeriodAndGenerateInvoice(
  pg: Pool,
  periodId: string,
): Promise<string> {
  const client = await pg.connect();
  try {
    await client.query("BEGIN");

    // Lock and fetch the period
    const periodResult = await client.query(
      `SELECT bp.*, t.name AS tenant_name, t.monthly_seat_fee_cents, t.plan_id
       FROM billing_periods bp
       JOIN tenants t ON t.id = bp.tenant_id
       WHERE bp.id = $1 AND bp.status = 'open'
       FOR UPDATE`,
      [periodId],
    );

    if (!periodResult.rowCount || periodResult.rowCount === 0) {
      await client.query("ROLLBACK");
      throw new Error(`Billing period ${periodId} not found or already closed`);
    }

    const period = periodResult.rows[0];

    // Count active users in this period
    const userCountResult = await client.query(
      `SELECT COUNT(DISTINCT user_id) AS cnt
       FROM usage_events
       WHERE tenant_id = $1
         AND created_at >= $2
         AND created_at < $3::date + INTERVAL '1 day'`,
      [period.tenant_id, period.period_start, period.period_end],
    );
    const activeUsers = parseInt(userCountResult.rows[0].cnt, 10);

    // Update period
    await client.query(
      `UPDATE billing_periods
       SET status = 'invoiced', active_user_count = $2
       WHERE id = $1`,
      [periodId, activeUsers],
    );

    // Generate invoice number
    const periodDate = new Date(period.period_start);
    const yyyymm = `${periodDate.getFullYear()}${String(periodDate.getMonth() + 1).padStart(2, "0")}`;
    const seqResult = await client.query(
      `SELECT COUNT(*) AS cnt FROM invoices WHERE invoice_number LIKE $1`,
      [`OVNI-${yyyymm}-%`],
    );
    const seq = parseInt(seqResult.rows[0].cnt, 10) + 1;
    const invoiceNumber = `OVNI-${yyyymm}-${String(seq).padStart(4, "0")}`;

    // Calculate line items
    const tokenUsageCents = Math.round(parseFloat(period.total_billed_cost) * 100);
    const seatFeeCents = period.monthly_seat_fee_cents * activeUsers;
    const subtotalCents = tokenUsageCents + seatFeeCents;

    // Create invoice
    const invoiceResult = await client.query(
      `INSERT INTO invoices
         (tenant_id, billing_period_id, invoice_number, subtotal_cents, total_cents, status)
       VALUES ($1, $2, $3, $4, $4, 'draft')
       RETURNING id`,
      [period.tenant_id, periodId, invoiceNumber, subtotalCents],
    );
    const invoiceId: string = invoiceResult.rows[0].id;

    // Token usage line item
    if (tokenUsageCents > 0) {
      await client.query(
        `INSERT INTO invoice_line_items
           (invoice_id, type, description, quantity, unit_price_cents, total_cents)
         VALUES ($1, 'token_usage', $2, $3, 1, $4)`,
        [
          invoiceId,
          `API token usage — ${period.total_tokens} tokens`,
          period.total_tokens,
          tokenUsageCents,
        ],
      );
    }

    // Seat fee line item
    if (seatFeeCents > 0) {
      await client.query(
        `INSERT INTO invoice_line_items
           (invoice_id, type, description, quantity, unit_price_cents, total_cents)
         VALUES ($1, 'seat_fee', $2, $3, $4, $5)`,
        [
          invoiceId,
          `Monthly seat fee (${activeUsers} active users)`,
          activeUsers,
          period.monthly_seat_fee_cents,
          seatFeeCents,
        ],
      );
    }

    await client.query("COMMIT");
    return invoiceId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
