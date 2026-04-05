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

  // ── Channel Management ──────────────────────────────────

  // GET /portal/channels — list connected channels
  app.get("/portal/channels", async (request) => {
    const tenant = request.tenant!;

    const result = await app.pg.query(
      `SELECT id, channel_type, active, created_at, updated_at
       FROM messaging_channels WHERE tenant_id = $1 ORDER BY created_at`,
      [tenant.tenantId],
    );

    return { channels: result.rows };
  });

  // POST /portal/channels/telegram — connect Telegram bot
  app.post("/portal/channels/telegram", async (request, reply) => {
    const tenant = request.tenant!;
    const body = request.body as { bot_token: string };

    if (!body.bot_token || !body.bot_token.includes(":")) {
      return reply.status(400).send({ error: "Token de bot invalido. Debe tener formato: 123456789:ABCdef..." });
    }

    // Verify bot token is valid
    const verifyRes = await fetch(`https://api.telegram.org/bot${body.bot_token}/getMe`);
    const verifyData = await verifyRes.json() as any;

    if (!verifyData.ok) {
      return reply.status(400).send({ error: "Token de bot invalido. Verifica con @BotFather." });
    }

    const botUsername = verifyData.result.username;

    // Check if telegram channel already exists
    const existing = await app.pg.query(
      `SELECT id FROM messaging_channels WHERE tenant_id = $1 AND channel_type = 'telegram'`,
      [tenant.tenantId],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      // Update existing
      await app.pg.query(
        `UPDATE messaging_channels SET config = $2, active = true, updated_at = NOW() WHERE id = $1`,
        [existing.rows[0].id, JSON.stringify({ botToken: body.bot_token, botUsername })],
      );
    } else {
      // Create new
      await app.pg.query(
        `INSERT INTO messaging_channels (tenant_id, channel_type, config, active)
         VALUES ($1, 'telegram', $2, true)`,
        [tenant.tenantId, JSON.stringify({ botToken: body.bot_token, botUsername })],
      );
    }

    // Set webhook with Telegram API
    const webhookUrl = `https://new.ovni.ai/webhooks/telegram/${tenant.tenantId}`;
    const whRes = await fetch(`https://api.telegram.org/bot${body.bot_token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const whData = await whRes.json() as any;

    if (!whData.ok) {
      return reply.status(500).send({ error: "No se pudo configurar el webhook de Telegram." });
    }

    return {
      status: "connected",
      channel: "telegram",
      bot_username: botUsername,
      webhook_url: webhookUrl,
      message: `Bot @${botUsername} conectado! Los mensajes que reciba seran respondidos por tu agente AI.`,
    };
  });

  // POST /portal/channels/webchat — enable web chat widget
  app.post("/portal/channels/webchat", async (request, reply) => {
    const tenant = request.tenant!;

    // Get or create API key for webchat
    const keyResult = await app.pg.query(
      `SELECT key_prefix FROM api_keys WHERE tenant_id = $1 AND active = true LIMIT 1`,
      [tenant.tenantId],
    );

    if (!keyResult.rowCount) {
      return reply.status(400).send({ error: "No hay API key activa. Contacta soporte." });
    }

    return {
      status: "ready",
      channel: "webchat",
      embed_code: `<script>\nwindow.OvniChat = {\n  apiKey: "${keyResult.rows[0].key_prefix}...",\n  apiUrl: "https://new.ovni.ai",\n  title: "Chat con IA",\n  color: "#000"\n};\n</script>\n<script src="https://new.ovni.ai/webchat/widget.js"></script>`,
      instructions: "Pega este codigo antes del </body> de tu sitio web. Reemplaza el apiKey con tu key completa.",
      message: "Widget listo! Pega el codigo en tu sitio web.",
    };
  });

  // DELETE /portal/channels/:type — disconnect channel
  app.delete<{ Params: { type: string } }>("/portal/channels/:type", async (request, reply) => {
    const tenant = request.tenant!;
    const { type } = request.params;

    const result = await app.pg.query(
      `UPDATE messaging_channels SET active = false, updated_at = NOW()
       WHERE tenant_id = $1 AND channel_type = $2 AND active = true
       RETURNING id, config`,
      [tenant.tenantId, type],
    );

    if (!result.rowCount) {
      return reply.status(404).send({ error: "Canal no encontrado o ya desconectado." });
    }

    // Remove Telegram webhook if disconnecting telegram
    if (type === "telegram") {
      const config = result.rows[0].config as { botToken?: string };
      if (config.botToken) {
        await fetch(`https://api.telegram.org/bot${config.botToken}/deleteWebhook`).catch(() => {});
      }
    }

    return { status: "disconnected", channel: type };
  });

  // ── Agent Management ────────────────────────────────────

  // GET /portal/agent — get agent config (system prompt, knowledge)
  app.get("/portal/agent", async (request) => {
    const tenant = request.tenant!;

    const result = await app.pg.query(
      `SELECT name, slug, system_prompt, default_model, plan_id,
              industry, anthropic_api_key
       FROM tenants WHERE id = $1`,
      [tenant.tenantId],
    );
    if (!result.rowCount) return { error: "Not found" };

    const t = result.rows[0];

    // Get channel info for sharing links
    const channels = await app.pg.query(
      `SELECT channel_type, config, active FROM messaging_channels
       WHERE tenant_id = $1 AND active = true`,
      [tenant.tenantId],
    );

    const shareLinks: Record<string, string> = {
      chat_page: `https://new.ovni.ai/chat/${t.slug}`,
    };
    for (const ch of channels.rows) {
      if (ch.channel_type === "telegram") {
        const cfg = ch.config as { botUsername?: string };
        if (cfg.botUsername) shareLinks.telegram = `https://t.me/${cfg.botUsername}`;
      }
    }

    return {
      agent: {
        name: t.name,
        slug: t.slug,
        model: t.default_model,
        system_prompt: t.system_prompt,
        plan: t.plan_id,
      },
      share_links: shareLinks,
      channels: channels.rows.map((c: any) => ({
        type: c.channel_type,
        active: c.active,
      })),
    };
  });

  // PATCH /portal/agent — update agent system prompt / knowledge
  app.patch("/portal/agent", async (request, reply) => {
    const tenant = request.tenant!;
    const body = request.body as {
      system_prompt?: string;
      agent_name?: string;
      additional_knowledge?: string;
    };

    if (!body.system_prompt && !body.agent_name && !body.additional_knowledge) {
      return reply.status(400).send({ error: "Nada que actualizar." });
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 2;

    if (body.system_prompt !== undefined) {
      updates.push(`system_prompt = $${idx++}`);
      params.push(body.system_prompt);
    }

    if (body.agent_name !== undefined) {
      updates.push(`name = $${idx++}`);
      params.push(body.agent_name);
    }

    // Additional knowledge gets appended to the system prompt
    if (body.additional_knowledge) {
      const current = await app.pg.query(
        `SELECT system_prompt FROM tenants WHERE id = $1`,
        [tenant.tenantId],
      );
      const existingPrompt = current.rows[0]?.system_prompt ?? "";
      const separator = "\n\n--- CONOCIMIENTO ADICIONAL ---\n";
      // Replace existing additional knowledge section or append
      const basePrompt = existingPrompt.includes(separator)
        ? existingPrompt.split(separator)[0]
        : existingPrompt;
      const newPrompt = basePrompt + separator + body.additional_knowledge;
      updates.push(`system_prompt = $${idx++}`);
      params.push(newPrompt);
    }

    await app.pg.query(
      `UPDATE tenants SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1`,
      [tenant.tenantId, ...params],
    );

    return { status: "updated", message: "Agente actualizado. Los cambios aplican inmediatamente." };
  });
}
