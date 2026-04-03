import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { dbPlugin } from "./plugins/db.js";
import chatRoutes from "./routes/chat.js";
import provisionRoutes from "./routes/provision.js";
import adminTenantRoutes from "./routes/admin/tenants.js";
import adminUserRoutes from "./routes/admin/users.js";
import adminInvoiceRoutes from "./routes/admin/invoices.js";
import adminChannelRoutes from "./routes/admin/channels.js";
import adminInstanceRoutes from "./routes/admin/instances.js";
import portalRoutes from "./routes/portal.js";
import stripeWebhookRoutes from "./routes/webhooks/stripe.js";
import whatsappWebhookRoutes from "./routes/webhooks/whatsapp.js";
import telegramWebhookRoutes from "./routes/webhooks/telegram.js";
import { startBillingWorker } from "./workers/billingWorker.js";
import { startBillingCron } from "./workers/billingCron.js";
import { startHealthCheckWorker } from "./workers/healthCheckWorker.js";

const app = Fastify({ logger: true });

async function main() {
  // ── Plugins ──────────────────────────────────────────────
  await app.register(cors, { origin: true });
  await app.register(dbPlugin);

  // ── Health ───────────────────────────────────────────────
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // ── Public routes ────────────────────────────────────────
  await app.register(chatRoutes);
  await app.register(provisionRoutes);

  // ── Admin routes ─────────────────────────────────────────
  await app.register(adminTenantRoutes,  { prefix: "/admin" });
  await app.register(adminUserRoutes,    { prefix: "/admin" });
  await app.register(adminInvoiceRoutes, { prefix: "/admin" });
  await app.register(adminChannelRoutes,  { prefix: "/admin" });
  await app.register(adminInstanceRoutes, { prefix: "/admin" });

  // ── Portal routes ────────────────────────────────────────
  await app.register(portalRoutes);

  // ── Webhook routes ───────────────────────────────────────
  await app.register(stripeWebhookRoutes);
  await app.register(whatsappWebhookRoutes);
  await app.register(telegramWebhookRoutes);

  // ── Workers ──────────────────────────────────────────────
  startBillingWorker(app);
  startBillingCron(app);
  startHealthCheckWorker(app);

  // ── Start ────────────────────────────────────────────────
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`OVNI AI wrapper listening on port ${config.port}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
