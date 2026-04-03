import type { FastifyInstance } from "fastify";
import { parseTelegramUpdate, sendTelegramMessage, type TelegramConfig } from "../../services/telegram.js";
import { routeMessage } from "../../services/messageRouter.js";
import type { TenantRow } from "../../types.js";

export default async function telegramWebhookRoutes(app: FastifyInstance) {

  app.post<{ Params: { tenantId: string } }>("/webhooks/telegram/:tenantId", async (request, reply) => {
    const { tenantId } = request.params;

    // Find active Telegram channel
    const channelResult = await app.pg.query(
      `SELECT mc.*, t.*
       FROM messaging_channels mc
       JOIN tenants t ON t.id = mc.tenant_id
       WHERE mc.tenant_id = $1 AND mc.channel_type = 'telegram' AND mc.active = true AND t.active = true
       LIMIT 1`,
      [tenantId],
    );

    if (!channelResult.rowCount) {
      return reply.status(404).send({ error: "No active Telegram channel for this tenant" });
    }

    const channel = channelResult.rows[0];
    const update = parseTelegramUpdate(request.body as Record<string, unknown>);

    if (!update) {
      return reply.status(200).send({ ok: true });
    }

    try {
      const responseText = await routeMessage(
        app.pg, app.boss,
        channel as TenantRow,
        channel.id,
        String(update.chatId),
        update.text,
        "telegram",
      );

      const channelConfig = channel.config as TelegramConfig;
      await sendTelegramMessage(update.chatId, responseText, channelConfig.botToken);
    } catch (err) {
      app.log.error({ err, tenantId }, "Telegram message processing failed");
    }

    return reply.status(200).send({ ok: true });
  });
}
