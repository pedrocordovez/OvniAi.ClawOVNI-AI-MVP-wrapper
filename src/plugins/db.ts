import fp from "fastify-plugin";
import { Pool } from "pg";
import Redis from "ioredis";
import PgBoss from "pg-boss";
import { config } from "../config.js";
import type { FastifyInstance } from "fastify";

export const dbPlugin = fp(async (app: FastifyInstance) => {
  // ── PostgreSQL ──────────────────────────────────────────────
  const poolConfig: Record<string, unknown> = { connectionString: config.dbUrl };
  if (config.nodeEnv === "production") {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
  const pool = new Pool(poolConfig);
  await pool.query("SELECT 1"); // verify connection
  app.decorate("pg", pool);
  app.log.info("PostgreSQL connected");

  // ── Redis ───────────────────────────────────────────────────
  const redis = new Redis(config.redisUrl);
  app.decorate("redis", redis);
  app.log.info("Redis connected");

  // ── pg-boss ─────────────────────────────────────────────────
  const bossConfig: Record<string, unknown> = { connectionString: config.dbUrl };
  if (config.nodeEnv === "production") {
    bossConfig.ssl = { rejectUnauthorized: false };
  }
  const boss = new PgBoss(bossConfig);
  await boss.start();
  app.decorate("boss", boss);
  app.log.info("pg-boss started");

  // ── Graceful shutdown ───────────────────────────────────────
  app.addHook("onClose", async () => {
    await boss.stop();
    await redis.quit();
    await pool.end();
    app.log.info("Database connections closed");
  });
});
