import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminAuth } from "../../middleware/adminAuth.js";
import { setTelegramWebhook } from "../../services/telegram.js";
import { logAudit } from "../../services/auditLog.js";

export default async function adminChannelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", adminAuth);

  // GET /admin/tenants/:tenantId/channels
  app.get<{ Params: { tenantId: string } }>("/tenants/:tenantId/channels", async (request) => {
    const { tenantId } = request.params;
    const result = await app.pg.query(
      `SELECT * FROM messaging_channels WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return { channels: result.rows };
  });

  // POST /admin/tenants/:tenantId/channels
  app.post<{ Params: { tenantId: string } }>("/tenants/:tenantId/channels", async (request, reply) => {
    const { tenantId } = request.params;

    const schema = z.object({
      channel_type: z.enum(["whatsapp", "telegram"]),
      config: z.record(z.unknown()),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
    }

    const result = await app.pg.query(
      `INSERT INTO messaging_channels (tenant_id, channel_type, config)
       VALUES ($1, $2, $3) RETURNING *`,
      [tenantId, parsed.data.channel_type, JSON.stringify(parsed.data.config)],
    );

    const channel = result.rows[0];

    // Auto-set Telegram webhook if bot token provided
    if (parsed.data.channel_type === "telegram" && parsed.data.config.botToken) {
      const webhookUrl = `${request.protocol}://${request.hostname}/webhooks/telegram/${tenantId}`;
      setTelegramWebhook(parsed.data.config.botToken as string, webhookUrl)
        .catch(err => app.log.warn({ err }, "Failed to set Telegram webhook"));
    }

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "create_channel",
      entityType: "messaging_channel", entityId: channel.id,
      newValues: { tenant_id: tenantId, channel_type: parsed.data.channel_type },
      ip: request.ip,
    });

    return reply.status(201).send(channel);
  });

  // DELETE /admin/tenants/:tenantId/channels/:channelId
  app.delete<{ Params: { tenantId: string; channelId: string } }>(
    "/tenants/:tenantId/channels/:channelId",
    async (request, reply) => {
      const { tenantId, channelId } = request.params;

      const result = await app.pg.query(
        `UPDATE messaging_channels SET active = false
         WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [channelId, tenantId],
      );

      if (!result.rowCount) return reply.status(404).send({ error: "Channel not found" });

      await logAudit(app.pg, {
        adminId: request.admin!.adminId, action: "deactivate_channel",
        entityType: "messaging_channel", entityId: channelId, ip: request.ip,
      });

      return { status: "deactivated" };
    },
  );
}
