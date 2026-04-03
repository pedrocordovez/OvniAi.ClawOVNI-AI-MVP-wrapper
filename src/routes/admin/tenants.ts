import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminAuth } from "../../middleware/adminAuth.js";
import { logAudit } from "../../services/auditLog.js";
import { clearAnthropicClient } from "../../services/anthropic.js";

export default async function adminTenantRoutes(app: FastifyInstance) {
  app.addHook("preHandler", adminAuth);

  // GET /admin/tenants
  app.get("/tenants", async (request) => {
    const query = request.query as { page?: string; limit?: string; search?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10)));
    const offset = (page - 1) * limit;
    const search = query.search ?? "";

    let whereClause = "";
    const params: unknown[] = [limit, offset];

    if (search) {
      whereClause = "WHERE t.name ILIKE $3 OR t.slug ILIKE $3 OR t.plan_id ILIKE $3";
      params.push(`%${search}%`);
    }

    const [tenantsResult, countResult] = await Promise.all([
      app.pg.query(
        `SELECT t.*,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.active = true) AS user_count,
           (SELECT COUNT(*) FROM api_keys ak WHERE ak.tenant_id = t.id AND ak.active = true) AS key_count,
           (SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM usage_events ue
            WHERE ue.tenant_id = t.id AND ue.created_at >= date_trunc('month', NOW())) AS tokens_this_month
         FROM tenants t ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT $1 OFFSET $2`,
        params,
      ),
      app.pg.query(
        `SELECT COUNT(*) AS total FROM tenants t ${whereClause}`,
        search ? [`%${search}%`] : [],
      ),
    ]);

    return {
      tenants: tenantsResult.rows,
      pagination: {
        page, limit,
        total: parseInt(countResult.rows[0].total, 10),
        pages: Math.ceil(parseInt(countResult.rows[0].total, 10) / limit),
      },
    };
  });

  // POST /admin/tenants
  app.post("/tenants", async (request, reply) => {
    const schema = z.object({
      name:             z.string().min(1).max(100),
      slug:             z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
      anthropic_api_key: z.string().min(1),
      plan_id:          z.enum(["starter", "pro", "enterprise"]),
      default_model:    z.string().optional(),
      system_prompt:    z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
    }
    const d = parsed.data;

    const result = await app.pg.query(
      `INSERT INTO tenants (name, slug, anthropic_api_key, plan_id, default_model, system_prompt,
         rpm_limit, tpm_limit, monthly_token_cap)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [d.name, d.slug, d.anthropic_api_key, d.plan_id,
       d.default_model ?? "claude-sonnet-4-20250514", d.system_prompt ?? null,
       30, 100000, 500000],
    );

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "create_tenant",
      entityType: "tenant", entityId: result.rows[0].id,
      newValues: { name: d.name, slug: d.slug, plan_id: d.plan_id },
      ip: request.ip,
    });

    return reply.status(201).send(result.rows[0]);
  });

  // PATCH /admin/tenants/:id
  app.patch<{ Params: { id: string } }>("/tenants/:id", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as Record<string, unknown>;

    // Fetch current state for audit
    const current = await app.pg.query(`SELECT * FROM tenants WHERE id = $1`, [id]);
    if (!current.rowCount) return reply.status(404).send({ error: "Tenant not found" });

    const allowed = ["name", "anthropic_api_key", "default_model", "allowed_models",
      "system_prompt", "rpm_limit", "tpm_limit", "monthly_token_cap", "plan_id", "active"];
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (key in body) {
        sets.push(`${key} = $${idx}`);
        values.push(body[key]);
        idx++;
      }
    }

    if (sets.length === 0) return reply.status(400).send({ error: "No valid fields to update" });

    values.push(id);
    const result = await app.pg.query(
      `UPDATE tenants SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );

    // Clear cached Anthropic client if key changed
    if ("anthropic_api_key" in body) {
      clearAnthropicClient(id);
    }

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "update_tenant",
      entityType: "tenant", entityId: id,
      oldValues: current.rows[0], newValues: body,
      ip: request.ip,
    });

    return result.rows[0];
  });

  // DELETE /admin/tenants/:id (soft deactivate — superadmin only)
  app.delete<{ Params: { id: string } }>("/tenants/:id", async (request, reply) => {
    if (request.admin!.role !== "superadmin") {
      return reply.status(403).send({ error: "Only superadmins can deactivate tenants" });
    }

    const { id } = request.params;
    await app.pg.query(`UPDATE tenants SET active = false WHERE id = $1`, [id]);

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "deactivate_tenant",
      entityType: "tenant", entityId: id, ip: request.ip,
    });

    return { status: "deactivated" };
  });

  // GET /admin/tenants/:id/usage
  app.get<{ Params: { id: string } }>("/tenants/:id/usage", async (request) => {
    const { id } = request.params;
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? "30", 10);

    const result = await app.pg.query(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*) AS requests,
         SUM(input_tokens) AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         SUM(anthropic_cost::NUMERIC) AS anthropic_cost,
         SUM(billed_cost::NUMERIC) AS billed_cost
       FROM usage_events
       WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [id, days],
    );

    return { tenant_id: id, days, usage: result.rows };
  });
}
