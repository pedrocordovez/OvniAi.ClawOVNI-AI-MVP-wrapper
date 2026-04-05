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
import adminMeteringRoutes from "./routes/admin/metering.js";
import portalRoutes from "./routes/portal.js";
import stripeWebhookRoutes from "./routes/webhooks/stripe.js";
import whatsappWebhookRoutes from "./routes/webhooks/whatsapp.js";
import telegramWebhookRoutes from "./routes/webhooks/telegram.js";
import { startBillingWorker } from "./workers/billingWorker.js";
import { startBillingCron } from "./workers/billingCron.js";
import { startHealthCheckWorker } from "./workers/healthCheckWorker.js";
import { startMeteringProxy } from "./services/meteringProxy.js";

const app = Fastify({ logger: true });

// ── Environment validation (INFRA-04) ──────────────────────
function validateEnv() {
  const required = ["DATABASE_URL", "REDIS_URL"];
  if (config.nodeEnv === "production") {
    required.push("ANTHROPIC_API_KEY", "VAULT_ENCRYPTION_KEY");
  }
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (process.env.VAULT_ENCRYPTION_KEY === "0".repeat(64)) {
    console.error("FATAL: VAULT_ENCRYPTION_KEY is set to default zeros. Generate a real key.");
    process.exit(1);
  }
}

async function main() {
  validateEnv();

  // ── Plugins ──────────────────────────────────────────────
  const corsOrigin = config.nodeEnv === "production"
    ? ["https://new.ovni.ai", "https://ovni.ai"]
    : true;
  await app.register(cors, { origin: corsOrigin });
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
  await app.register(adminMeteringRoutes, { prefix: "/admin" });

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

  // ── Metering Proxy ──────────────────────────────────────
  const meteringPort = parseInt(process.env.METERING_PROXY_PORT ?? "3001", 10);
  await startMeteringProxy(app.pg, app.boss, meteringPort);

  // ── Start ────────────────────────────────────────────────
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`OVNI AI wrapper listening on port ${config.port}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

// ── Graceful shutdown (SEC-04) ────────────────────────────────
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  });
}
