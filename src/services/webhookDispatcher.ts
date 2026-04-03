import { createHmac } from "crypto";
import type { Pool } from "pg";

export async function dispatchWebhook(
  pg: Pool,
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const endpoints = await pg.query(
    `SELECT id, url, secret FROM webhook_endpoints
     WHERE tenant_id = $1 AND active = true AND $2 = ANY(events)`,
    [tenantId, event],
  );

  for (const ep of endpoints.rows) {
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = createHmac("sha256", ep.secret as string).update(body).digest("hex");

    let statusCode = 0;
    let response = "";
    let success = false;

    try {
      const res = await fetch(ep.url as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OVNI-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = res.status;
      response = await res.text().catch(() => "");
      success = res.ok;
    } catch (err) {
      response = err instanceof Error ? err.message : "Unknown error";
    }

    await pg.query(
      `INSERT INTO webhook_deliveries (endpoint_id, event, payload, status_code, response, success)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ep.id, event, JSON.stringify(payload), statusCode, response.slice(0, 1000), success],
    ).catch(() => {}); // best-effort logging
  }
}
