import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminAuth } from "../../middleware/adminAuth.js";
import { generateTenantKey } from "../../services/keyGenerator.js";
import { logAudit } from "../../services/auditLog.js";

export default async function adminUserRoutes(app: FastifyInstance) {
  app.addHook("preHandler", adminAuth);

  // POST /admin/tenants/:tenantId/users
  app.post<{ Params: { tenantId: string } }>("/tenants/:tenantId/users", async (request, reply) => {
    const { tenantId } = request.params;
    const schema = z.object({
      email: z.string().email(),
      name:  z.string().min(1).max(100),
      role:  z.enum(["admin", "user"]).default("user"),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
    }

    const result = await app.pg.query(
      `INSERT INTO users (tenant_id, email, name, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, parsed.data.email, parsed.data.name, parsed.data.role],
    );

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "create_user",
      entityType: "user", entityId: result.rows[0].id,
      newValues: { email: parsed.data.email, tenant_id: tenantId },
      ip: request.ip,
    });

    return reply.status(201).send(result.rows[0]);
  });

  // DELETE /admin/tenants/:tenantId/users/:userId
  app.delete<{ Params: { tenantId: string; userId: string } }>(
    "/tenants/:tenantId/users/:userId",
    async (request, reply) => {
      const { tenantId, userId } = request.params;

      const result = await app.pg.query(
        `UPDATE users SET active = false WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [userId, tenantId],
      );

      if (!result.rowCount) return reply.status(404).send({ error: "User not found" });

      await logAudit(app.pg, {
        adminId: request.admin!.adminId, action: "deactivate_user",
        entityType: "user", entityId: userId, ip: request.ip,
      });

      return { status: "deactivated" };
    },
  );

  // POST /admin/tenants/:tenantId/keys — Generate new API key (returns raw key ONCE)
  app.post<{ Params: { tenantId: string } }>("/tenants/:tenantId/keys", async (request, reply) => {
    const { tenantId } = request.params;
    const body = request.body as { user_id?: string; label?: string };

    const key = generateTenantKey();

    await app.pg.query(
      `INSERT INTO api_keys (tenant_id, user_id, key_hash, key_prefix, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, body.user_id ?? null, key.hash, key.prefix, body.label ?? "Generated key"],
    );

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "generate_key",
      entityType: "api_key", entityId: null,
      newValues: { tenant_id: tenantId, prefix: key.prefix },
      ip: request.ip,
    });

    return reply.status(201).send({
      api_key:    key.raw,
      key_prefix: key.prefix,
      message:    "Guarda esta key ahora. No la podras ver de nuevo.",
    });
  });

  // DELETE /admin/tenants/:tenantId/keys/:keyId
  app.delete<{ Params: { tenantId: string; keyId: string } }>(
    "/tenants/:tenantId/keys/:keyId",
    async (request, reply) => {
      const { tenantId, keyId } = request.params;

      const result = await app.pg.query(
        `UPDATE api_keys SET active = false WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [keyId, tenantId],
      );

      if (!result.rowCount) return reply.status(404).send({ error: "Key not found" });

      await logAudit(app.pg, {
        adminId: request.admin!.adminId, action: "revoke_key",
        entityType: "api_key", entityId: keyId, ip: request.ip,
      });

      return { status: "revoked" };
    },
  );
}
