import type { Pool } from "pg";
import { config } from "../config.js";

/**
 * Credit Manager — handles prepaid credit balance for tenants.
 *
 * Billing model:
 * 1. Monthly fee charged upfront (plan subscription)
 * 2. API usage deducted from prepaid credit balance (Anthropic cost + OVNI margin)
 * 3. When balance drops below threshold → auto-recharge if enabled
 * 4. When balance hits 0 and no auto-recharge → suspend API access
 */

export interface CreditStatus {
  balance_cents:           number;
  auto_recharge:           boolean;
  recharge_amount_cents:   number;
  recharge_threshold_cents: number;
  suspended:               boolean;
  suspended_reason:        string | null;
}

// ─── Check if tenant has sufficient credit ──────────────────────────────────

export async function hasSufficientCredit(pg: Pool, tenantId: string): Promise<boolean> {
  const result = await pg.query(
    `SELECT credit_balance_cents, suspended FROM tenants WHERE id = $1`,
    [tenantId],
  );
  if (!result.rowCount) return false;
  const { credit_balance_cents, suspended } = result.rows[0];
  return !suspended && credit_balance_cents > 0;
}

// ─── Get credit status ──────────────────────────────────────────────────────

export async function getCreditStatus(pg: Pool, tenantId: string): Promise<CreditStatus> {
  const result = await pg.query(
    `SELECT credit_balance_cents, auto_recharge, recharge_amount_cents,
            recharge_threshold_cents, suspended, suspended_reason
     FROM tenants WHERE id = $1`,
    [tenantId],
  );
  if (!result.rowCount) throw new Error("Tenant not found");
  return result.rows[0] as CreditStatus;
}

// ─── Add credit (initial, recharge, or adjustment) ──────────────────────────

export async function addCredit(
  pg: Pool,
  tenantId: string,
  amountCents: number,
  type: "initial_credit" | "recharge" | "refund" | "adjustment",
  description: string,
  stripeChargeId?: string,
): Promise<{ newBalance: number }> {
  const client = await pg.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE tenants
       SET credit_balance_cents = credit_balance_cents + $2,
           suspended = false,
           suspended_reason = NULL
       WHERE id = $1
       RETURNING credit_balance_cents`,
      [tenantId, amountCents],
    );
    const newBalance = result.rows[0].credit_balance_cents as number;

    await client.query(
      `INSERT INTO credit_transactions (tenant_id, type, amount_cents, balance_after, description, stripe_charge_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, type, amountCents, newBalance, description, stripeChargeId ?? null],
    );

    await client.query("COMMIT");
    return { newBalance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Deduct credit for API usage ────────────────────────────────────────────

export async function deductUsageCredit(
  pg: Pool,
  tenantId: string,
  billedCostCents: number,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<{ newBalance: number; needsRecharge: boolean; suspended: boolean }> {
  const client = await pg.connect();
  try {
    await client.query("BEGIN");

    // Deduct from balance
    const result = await client.query(
      `UPDATE tenants
       SET credit_balance_cents = GREATEST(0, credit_balance_cents - $2)
       WHERE id = $1
       RETURNING credit_balance_cents, auto_recharge, recharge_threshold_cents`,
      [tenantId, billedCostCents],
    );

    const row = result.rows[0];
    const newBalance = row.credit_balance_cents as number;
    const autoRecharge = row.auto_recharge as boolean;
    const threshold = row.recharge_threshold_cents as number;

    // Log the transaction
    await client.query(
      `INSERT INTO credit_transactions (tenant_id, type, amount_cents, balance_after, description)
       VALUES ($1, 'usage_deduction', $2, $3, $4)`,
      [tenantId, -billedCostCents, newBalance,
       `${model}: ${inputTokens} in + ${outputTokens} out tokens`],
    );

    let needsRecharge = false;
    let suspended = false;

    if (newBalance <= threshold) {
      if (autoRecharge) {
        needsRecharge = true;
      } else if (newBalance <= 0) {
        // Suspend the tenant
        await client.query(
          `UPDATE tenants SET suspended = true, suspended_reason = 'Credito agotado. Recarga tu balance para continuar.'
           WHERE id = $1`,
          [tenantId],
        );
        suspended = true;
      }
    }

    await client.query("COMMIT");
    return { newBalance, needsRecharge, suspended };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Auto-recharge via Stripe ───────────────────────────────────────────────

export async function processAutoRecharge(
  pg: Pool,
  tenantId: string,
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const tenant = await pg.query(
    `SELECT id, name, recharge_amount_cents, stripe_customer_id, auto_recharge
     FROM tenants WHERE id = $1`,
    [tenantId],
  );
  if (!tenant.rowCount) return { success: false, error: "Tenant not found" };

  const t = tenant.rows[0];
  if (!t.auto_recharge) return { success: false, error: "Auto-recharge not enabled" };
  if (!t.stripe_customer_id && !config.stripeSecretKey) {
    // Mock mode — just add the credit
    const { newBalance } = await addCredit(
      pg, tenantId, t.recharge_amount_cents,
      "recharge", `Auto-recarga: $${(t.recharge_amount_cents / 100).toFixed(2)} (mock)`,
    );
    return { success: true, newBalance };
  }

  if (!config.stripeSecretKey) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(config.stripeSecretKey);

    // Charge the customer's default payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   t.recharge_amount_cents,
      currency: "usd",
      customer: t.stripe_customer_id,
      confirm:  true,
      description: `OVNI AI — Recarga de credito API (${t.name})`,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    if (paymentIntent.status === "succeeded") {
      const { newBalance } = await addCredit(
        pg, tenantId, t.recharge_amount_cents,
        "recharge",
        `Auto-recarga: $${(t.recharge_amount_cents / 100).toFixed(2)}`,
        paymentIntent.id,
      );
      return { success: true, newBalance };
    }

    return { success: false, error: `Payment status: ${paymentIntent.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Recharge failed";

    // Suspend tenant on payment failure
    await pg.query(
      `UPDATE tenants SET suspended = true,
         suspended_reason = 'Auto-recarga fallida: ${message.replace(/'/g, "")}'
       WHERE id = $1`,
      [tenantId],
    );

    return { success: false, error: message };
  }
}

// ─── Charge monthly fee ─────────────────────────────────────────────────────

export async function chargeMonthlyFee(
  pg: Pool,
  tenantId: string,
): Promise<{ success: boolean; newBalance?: number }> {
  const tenant = await pg.query(
    `SELECT monthly_seat_fee_cents, plan_id, credit_balance_cents FROM tenants WHERE id = $1`,
    [tenantId],
  );
  if (!tenant.rowCount) return { success: false };

  const planId = tenant.rows[0].plan_id as string;
  const plan = config.plans[planId as keyof typeof config.plans];
  if (!plan) return { success: false };

  const feeCents = plan.monthlyFeeCents;

  const client = await pg.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE tenants SET credit_balance_cents = credit_balance_cents - $2 WHERE id = $1
       RETURNING credit_balance_cents`,
      [tenantId, feeCents],
    );
    const newBalance = result.rows[0].credit_balance_cents as number;

    await client.query(
      `INSERT INTO credit_transactions (tenant_id, type, amount_cents, balance_after, description)
       VALUES ($1, 'monthly_fee', $2, $3, $4)`,
      [tenantId, -feeCents, newBalance, `Mensualidad Plan ${plan.name}: $${(feeCents / 100).toFixed(2)}`],
    );

    await client.query("COMMIT");
    return { success: true, newBalance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Get credit transaction history ─────────────────────────────────────────

export async function getCreditHistory(
  pg: Pool,
  tenantId: string,
  limit = 50,
): Promise<Array<{
  id: string; type: string; amount_cents: number;
  balance_after: number; description: string; created_at: Date;
}>> {
  const result = await pg.query(
    `SELECT id, type, amount_cents, balance_after, description, created_at
     FROM credit_transactions WHERE tenant_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows;
}
