import type { Pool } from "pg";
import { config, type PlanId } from "../config.js";
import { generateTenantKey } from "./keyGenerator.js";
import { getOrCreateBillingPeriod } from "./billing.js";

export interface ProvisionInput {
  orderId:       string;
  companyName:   string;
  companySlug:   string;
  contactName:   string;
  contactEmail:  string;
  industry:      string;
  planId:        PlanId;
  channels?:     Record<string, unknown>;
  softwareStack?: Record<string, unknown>;
}

export interface ProvisionResult {
  tenantId:    string;
  apiKey:      string;
  keyPrefix:   string;
  instanceId:  string;
  gatewayUrl:  string;
}

export async function provisionTenant(
  pg: Pool,
  data: ProvisionInput,
): Promise<ProvisionResult> {
  const plan = config.plans[data.planId];
  const key = generateTenantKey();

  const client = await pg.connect();
  try {
    await client.query("BEGIN");

    // Mark order as in_progress
    await client.query(
      `UPDATE provisioning_orders SET provision_status = 'in_progress' WHERE id = $1`,
      [data.orderId],
    );

    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants
         (name, slug, anthropic_api_key, default_model, plan_id,
          rpm_limit, tpm_limit, monthly_token_cap, monthly_seat_fee_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        data.companyName, data.companySlug,
        config.anthropicApiKey, // default key; admin assigns per-tenant later
        plan.model, data.planId,
        plan.rpmLimit, plan.tpmLimit,
        plan.monthlyTokenCap, 0,
      ],
    );
    const tenantId: string = tenantResult.rows[0].id;

    // Create admin user
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, name, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id`,
      [tenantId, data.contactEmail, data.contactName],
    );
    const userId: string = userResult.rows[0].id;

    // Create API key
    await client.query(
      `INSERT INTO api_keys (tenant_id, user_id, key_hash, key_prefix, label)
       VALUES ($1, $2, $3, $4, 'Default key')`,
      [tenantId, userId, key.hash, key.prefix],
    );

    // Create billing period for current month
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await client.query(
      `INSERT INTO billing_periods (tenant_id, period_start, period_end, status)
       VALUES ($1, $2, $3, 'open')
       ON CONFLICT (tenant_id, period_start) DO NOTHING`,
      [tenantId, periodStart.toISOString().split("T")[0], periodEnd.toISOString().split("T")[0]],
    );

    // Mark order as complete
    await client.query(
      `UPDATE provisioning_orders
       SET provision_status = 'complete', tenant_id = $2
       WHERE id = $1`,
      [data.orderId, tenantId],
    );

    await client.query("COMMIT");

    // Provision OpenClaw instance — mandatory, tenant is not usable without it
    const { provisionInstance } = await import("./instanceOrchestrator.js");
    const instanceInfo = await provisionInstance(pg, {
      tenantId,
      tenantSlug:    data.companySlug,
      anthropicKey:  config.anthropicApiKey,
      defaultModel:  plan.model,
      channels:      data.channels,
      softwareStack: data.softwareStack,
    });

    // Configure channels inside the OpenClaw instance
    if (data.channels && Object.keys(data.channels).length > 0) {
      const { configureChannels } = await import("./channelManager.js");
      await configureChannels(pg, instanceInfo.instanceId, data.channels);
    }

    // Configure software stack (skills) inside OpenClaw
    if (data.softwareStack && Object.keys(data.softwareStack).length > 0) {
      const { configureSoftwareStack } = await import("./channelManager.js");
      await configureSoftwareStack(pg, instanceInfo.instanceId, data.softwareStack);
    }

    return {
      tenantId,
      apiKey:      key.raw,
      keyPrefix:   key.prefix,
      instanceId:  instanceInfo.instanceId,
      gatewayUrl:  instanceInfo.gatewayUrl,
    };
  } catch (err) {
    await client.query("ROLLBACK");

    // Mark order as failed
    await pg.query(
      `UPDATE provisioning_orders
       SET provision_status = 'failed', error_message = $2
       WHERE id = $1`,
      [data.orderId, (err as Error).message],
    ).catch(() => {}); // best-effort

    throw err;
  } finally {
    client.release();
  }
}
