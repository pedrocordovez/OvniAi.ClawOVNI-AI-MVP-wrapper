import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminAuth } from "../../middleware/adminAuth.js";
import { logAudit } from "../../services/auditLog.js";
import {
  provisionInstance, stopInstance, startInstance,
  restartInstance, pauseInstance, destroyInstance,
  getInstanceLogs,
} from "../../services/instanceOrchestrator.js";
import { configureChannels, disconnectChannel, configureSoftwareStack } from "../../services/channelManager.js";
import { getTenantAnthropicKey } from "../../services/apiKeyVault.js";
import {
  storeAnthropicKey, assignKeyToTenant, listVaultKeys, rotateKey,
} from "../../services/apiKeyVault.js";

export default async function adminInstanceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", adminAuth);

  // ── GET /admin/instances — List all instances ──────────────
  app.get("/instances", async (request) => {
    const query = request.query as { status?: string };
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.status) { conditions.push(`oi.status = $${idx++}`); params.push(query.status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await app.pg.query(
      `SELECT oi.*, t.name AS tenant_name, t.slug AS tenant_slug, t.plan_id
       FROM openclaw_instances oi
       JOIN tenants t ON t.id = oi.tenant_id
       ${where}
       ORDER BY oi.created_at DESC`,
      params,
    );

    return { instances: result.rows };
  });

  // ── GET /admin/instances/:id — Instance detail ─────────────
  app.get<{ Params: { id: string } }>("/instances/:id", async (request, reply) => {
    const { id } = request.params;

    const result = await app.pg.query(
      `SELECT oi.*, t.name AS tenant_name, t.slug AS tenant_slug
       FROM openclaw_instances oi
       JOIN tenants t ON t.id = oi.tenant_id
       WHERE oi.id = $1`,
      [id],
    );

    if (!result.rowCount) return reply.status(404).send({ error: "Instance not found" });

    // Get recent health checks
    const healthLog = await app.pg.query(
      `SELECT * FROM instance_health_log
       WHERE instance_id = $1 ORDER BY checked_at DESC LIMIT 20`,
      [id],
    );

    return { ...result.rows[0], health_log: healthLog.rows };
  });

  // ── POST /admin/instances/provision — Provision new instance
  app.post("/instances/provision", async (request, reply) => {
    const schema = z.object({
      tenant_id:      z.string().uuid(),
      system_prompt:  z.string().optional(),
      channels:       z.record(z.unknown()).optional(),
      software_stack: z.record(z.unknown()).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
    }

    const d = parsed.data;

    // Get tenant info
    const tenant = await app.pg.query(
      `SELECT id, slug, default_model, system_prompt FROM tenants WHERE id = $1 AND active = true`,
      [d.tenant_id],
    );
    if (!tenant.rowCount) return reply.status(404).send({ error: "Tenant not found" });

    const t = tenant.rows[0];

    // Check if instance already exists
    const existing = await app.pg.query(
      `SELECT id, status FROM openclaw_instances WHERE tenant_id = $1`,
      [d.tenant_id],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.status(409).send({
        error: "instance_exists",
        instance_id: existing.rows[0].id,
        status: existing.rows[0].status,
      });
    }

    // Get Anthropic key for this tenant
    const anthropicKey = await getTenantAnthropicKey(app.pg, d.tenant_id);

    const instanceInfo = await provisionInstance(app.pg, {
      tenantId:      d.tenant_id,
      tenantSlug:    t.slug,
      anthropicKey,
      defaultModel:  t.default_model,
      systemPrompt:  d.system_prompt ?? t.system_prompt,
      channels:      d.channels,
      softwareStack: d.software_stack,
    });

    // Configure channels if provided
    if (d.channels && Object.keys(d.channels).length > 0) {
      configureChannels(app.pg, instanceInfo.instanceId, d.channels)
        .catch(err => app.log.warn({ err }, "Channel configuration failed (non-fatal)"));
    }

    // Configure software stack if provided
    if (d.software_stack && Object.keys(d.software_stack).length > 0) {
      configureSoftwareStack(app.pg, instanceInfo.instanceId, d.software_stack)
        .catch(err => app.log.warn({ err }, "Software stack configuration failed (non-fatal)"));
    }

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "provision_instance",
      entityType: "openclaw_instance", entityId: instanceInfo.instanceId,
      newValues: { tenant_id: d.tenant_id, port: instanceInfo.port },
      ip: request.ip,
    });

    return reply.status(201).send(instanceInfo);
  });

  // ── POST /admin/instances/:id/stop ─────────────────────────
  app.post<{ Params: { id: string } }>("/instances/:id/stop", async (request) => {
    await stopInstance(app.pg, request.params.id);
    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "stop_instance",
      entityType: "openclaw_instance", entityId: request.params.id, ip: request.ip,
    });
    return { status: "stopped" };
  });

  // ── POST /admin/instances/:id/start ────────────────────────
  app.post<{ Params: { id: string } }>("/instances/:id/start", async (request) => {
    await startInstance(app.pg, request.params.id);
    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "start_instance",
      entityType: "openclaw_instance", entityId: request.params.id, ip: request.ip,
    });
    return { status: "running" };
  });

  // ── POST /admin/instances/:id/restart ──────────────────────
  app.post<{ Params: { id: string } }>("/instances/:id/restart", async (request) => {
    await restartInstance(app.pg, request.params.id);
    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "restart_instance",
      entityType: "openclaw_instance", entityId: request.params.id, ip: request.ip,
    });
    return { status: "restarted" };
  });

  // ── POST /admin/instances/:id/pause ────────────────────────
  app.post<{ Params: { id: string } }>("/instances/:id/pause", async (request) => {
    await pauseInstance(app.pg, request.params.id);
    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "pause_instance",
      entityType: "openclaw_instance", entityId: request.params.id, ip: request.ip,
    });
    return { status: "paused" };
  });

  // ── DELETE /admin/instances/:id ────────────────────────────
  app.delete<{ Params: { id: string } }>("/instances/:id", async (request, reply) => {
    if (request.admin!.role !== "superadmin") {
      return reply.status(403).send({ error: "Only superadmins can destroy instances" });
    }

    const query = request.query as { remove_volumes?: string };
    await destroyInstance(app.pg, request.params.id, query.remove_volumes === "true");

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "destroy_instance",
      entityType: "openclaw_instance", entityId: request.params.id, ip: request.ip,
    });

    return { status: "destroyed" };
  });

  // ── GET /admin/instances/:id/logs ──────────────────────────
  app.get<{ Params: { id: string } }>("/instances/:id/logs", async (request, reply) => {
    const instance = await app.pg.query(
      `SELECT container_id FROM openclaw_instances WHERE id = $1`,
      [request.params.id],
    );
    if (!instance.rowCount) return reply.status(404).send({ error: "Instance not found" });

    const query = request.query as { tail?: string };
    const logs = await getInstanceLogs(instance.rows[0].container_id, parseInt(query.tail ?? "100", 10));
    return { logs };
  });

  // ── POST /admin/instances/:id/channels — Configure channels
  app.post<{ Params: { id: string } }>("/instances/:id/channels", async (request, reply) => {
    const channels = request.body as Record<string, unknown>;
    await configureChannels(app.pg, request.params.id, channels);

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "configure_channels",
      entityType: "openclaw_instance", entityId: request.params.id,
      newValues: channels, ip: request.ip,
    });

    return { status: "channels_configured" };
  });

  // ── DELETE /admin/instances/:id/channels/:type — Disconnect
  app.delete<{ Params: { id: string; type: string } }>(
    "/instances/:id/channels/:type",
    async (request) => {
      await disconnectChannel(app.pg, request.params.id, request.params.type);
      return { status: "disconnected" };
    },
  );

  // ── API Key Vault ──────────────────────────────────────────

  // GET /admin/vault/keys
  app.get("/vault/keys", async () => {
    const keys = await listVaultKeys(app.pg);
    return { keys };
  });

  // POST /admin/vault/keys — Store a new Anthropic key
  app.post("/vault/keys", async (request, reply) => {
    const schema = z.object({
      label:   z.string().min(1),
      api_key: z.string().min(1),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });

    const vaultId = await storeAnthropicKey(app.pg, parsed.data.label, parsed.data.api_key);

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "store_vault_key",
      entityType: "api_key_vault", entityId: vaultId,
      newValues: { label: parsed.data.label }, ip: request.ip,
    });

    return reply.status(201).send({ vault_id: vaultId });
  });

  // POST /admin/vault/keys/:id/assign — Assign to tenant
  app.post<{ Params: { id: string } }>("/vault/keys/:id/assign", async (request, reply) => {
    const body = request.body as { tenant_id: string };
    if (!body.tenant_id) return reply.status(400).send({ error: "tenant_id required" });

    await assignKeyToTenant(app.pg, request.params.id, body.tenant_id);

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "assign_vault_key",
      entityType: "api_key_vault", entityId: request.params.id,
      newValues: { tenant_id: body.tenant_id }, ip: request.ip,
    });

    return { status: "assigned" };
  });

  // POST /admin/vault/keys/:id/rotate
  app.post<{ Params: { id: string } }>("/vault/keys/:id/rotate", async (request, reply) => {
    const body = request.body as { new_api_key: string };
    if (!body.new_api_key) return reply.status(400).send({ error: "new_api_key required" });

    const newId = await rotateKey(app.pg, request.params.id, body.new_api_key);

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "rotate_vault_key",
      entityType: "api_key_vault", entityId: request.params.id,
      newValues: { new_vault_id: newId }, ip: request.ip,
    });

    return { status: "rotated", new_vault_id: newId };
  });
}
