import type { FastifyInstance } from "fastify";
import { parseWhatsAppWebhook, sendWhatsAppMessage, type WhatsAppConfig } from "../../services/whatsapp.js";
import { routeMessage } from "../../services/messageRouter.js";
import type { TenantRow } from "../../types.js";

export default async function whatsappWebhookRoutes(app: FastifyInstance) {

  app.post<{ Params: { tenantId: string } }>("/webhooks/whatsapp/:tenantId", async (request, reply) => {
    const { tenantId } = request.params;

    // Find active WhatsApp channel for this tenant
    const channelResult = await app.pg.query(
      `SELECT mc.id AS channel_id, mc.config,
              t.id, t.name, t.slug, t.anthropic_api_key,
              t.default_model, t.allowed_models, t.system_prompt,
              t.plan_id, t.rpm_limit, t.tpm_limit, t.monthly_token_cap,
              t.monthly_seat_fee_cents, t.active
       FROM messaging_channels mc
       JOIN tenants t ON t.id = mc.tenant_id
       WHERE mc.tenant_id = $1 AND mc.channel_type = 'whatsapp' AND mc.active = true AND t.active = true
       LIMIT 1`,
      [tenantId],
    );

    if (!channelResult.rowCount) {
      return reply.status(404).send({ error: "No active WhatsApp channel for this tenant" });
    }

    const channel = channelResult.rows[0];
    const incoming = parseWhatsAppWebhook(request.body as Record<string, unknown>);

    if (!incoming.body) {
      // Twilio sends status callbacks too; acknowledge them
      return reply.status(200).send();
    }

    try {
      const responseText = await routeMessage(
        app.pg, app.boss,
        channel as TenantRow,
        channel.channel_id,
        incoming.from,
        incoming.body,
        "whatsapp",
      );

      const channelConfig = channel.config as WhatsAppConfig;
      await sendWhatsAppMessage(incoming.from, responseText, channelConfig);
    } catch (err) {
      app.log.error({ err, tenantId }, "WhatsApp message processing failed");
    }

    // Twilio expects a 200 response
    return reply.status(200).send();
  });
}
