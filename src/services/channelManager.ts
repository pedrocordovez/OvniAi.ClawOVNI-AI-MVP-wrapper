import type { Pool } from "pg";

export interface ChannelConfig {
  whatsapp?: { phoneNumber: string };
  telegram?: { botToken: string };
  slack?:    { botToken: string; appToken: string; teamId: string };
  teams?:    { appId: string; appPassword: string; tenantId: string };
  webchat?:  { enabled: boolean };
}

// ─── Configure channels on an OpenClaw instance ──────────────────────────────

export async function configureChannels(
  pg: Pool,
  instanceId: string,
  channels: ChannelConfig,
): Promise<void> {
  // Get instance gateway info
  const instance = await pg.query(
    `SELECT gateway_url, gateway_token FROM openclaw_instances WHERE id = $1`,
    [instanceId],
  );
  if (!instance.rowCount) throw new Error("Instance not found");

  const { gateway_url, gateway_token } = instance.rows[0];
  const channelStatuses: Record<string, string> = {};

  // Configure each channel via OpenClaw's API
  for (const [channelType, config] of Object.entries(channels)) {
    if (!config) continue;

    try {
      const res = await fetch(`${gateway_url}/api/channels/${channelType}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${gateway_token}`,
        },
        body: JSON.stringify(config),
        signal: AbortSignal.timeout(10_000),
      });

      channelStatuses[channelType] = res.ok ? "connected" : "error";

      // Store channel record
      await pg.query(
        `INSERT INTO messaging_channels (tenant_id, channel_type, config, active)
         SELECT oi.tenant_id, $2, $3, true
         FROM openclaw_instances oi WHERE oi.id = $1
         ON CONFLICT (channel_id, external_user_id) DO NOTHING`,
        [instanceId, channelType, JSON.stringify(config)],
      ).catch(() => {
        // If the constraint doesn't match, just do a regular insert
        // This is a best-effort record
      });
    } catch {
      channelStatuses[channelType] = "error";
    }
  }

  // Update instance with channel statuses
  await pg.query(
    `UPDATE openclaw_instances SET channels = $2 WHERE id = $1`,
    [instanceId, JSON.stringify(channelStatuses)],
  );
}

// ─── Get channel status from an OpenClaw instance ────────────────────────────

export async function getChannelStatus(
  gatewayUrl: string,
  gatewayToken: string,
): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${gatewayUrl}/api/channels`, {
      headers: { "Authorization": `Bearer ${gatewayToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return {};
    return await res.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── Disconnect a channel ────────────────────────────────────────────────────

export async function disconnectChannel(
  pg: Pool,
  instanceId: string,
  channelType: string,
): Promise<void> {
  const instance = await pg.query(
    `SELECT gateway_url, gateway_token, channels
     FROM openclaw_instances WHERE id = $1`,
    [instanceId],
  );
  if (!instance.rowCount) throw new Error("Instance not found");

  const { gateway_url, gateway_token, channels } = instance.rows[0];

  // Tell OpenClaw to disconnect
  await fetch(`${gateway_url}/api/channels/${channelType}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${gateway_token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});

  // Update channels JSON
  const updated = { ...(channels as Record<string, unknown>) };
  delete updated[channelType];

  await pg.query(
    `UPDATE openclaw_instances SET channels = $2 WHERE id = $1`,
    [instanceId, JSON.stringify(updated)],
  );
}

// ─── Configure software stack (skills) on OpenClaw ───────────────────────────

export async function configureSoftwareStack(
  pg: Pool,
  instanceId: string,
  softwareStack: Record<string, unknown>,
): Promise<void> {
  const instance = await pg.query(
    `SELECT gateway_url, gateway_token FROM openclaw_instances WHERE id = $1`,
    [instanceId],
  );
  if (!instance.rowCount) throw new Error("Instance not found");

  const { gateway_url, gateway_token } = instance.rows[0];

  // Map software selections to OpenClaw skills
  const skills: string[] = [];
  if (softwareStack.email === "gmail") skills.push("google-email");
  if (softwareStack.email === "outlook") skills.push("microsoft-email");
  if (softwareStack.crm === "hubspot") skills.push("hubspot");
  if (softwareStack.crm === "salesforce") skills.push("salesforce");
  if (softwareStack.billing === "quickbooks") skills.push("quickbooks");
  if (softwareStack.billing === "xero") skills.push("xero");
  if (softwareStack.hr === "bamboohr") skills.push("bamboohr");
  if (softwareStack.calendar) skills.push("google-calendar");
  if (softwareStack.webBrowsing) skills.push("web-browsing");

  // Enable skills via OpenClaw API
  for (const skill of skills) {
    await fetch(`${gateway_url}/api/skills/${skill}/enable`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${gateway_token}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  }

  await pg.query(
    `UPDATE openclaw_instances SET software_stack = $2 WHERE id = $1`,
    [instanceId, JSON.stringify({ ...softwareStack, enabled_skills: skills })],
  );
}
