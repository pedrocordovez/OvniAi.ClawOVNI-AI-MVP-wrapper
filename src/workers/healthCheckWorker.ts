import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { getContainerStatus, startInstance } from "../services/instanceOrchestrator.js";

const HEALTH_CHECK_INTERVAL = process.env.HEALTH_CHECK_INTERVAL ?? "*/30 * * * * *"; // every 30s

export function startHealthCheckWorker(app: FastifyInstance): void {
  cron.schedule(HEALTH_CHECK_INTERVAL, async () => {
    try {
      const instances = await app.pg.query(
        `SELECT id, container_id, gateway_url, tenant_id, status
         FROM openclaw_instances
         WHERE status IN ('running', 'error') AND container_id IS NOT NULL`,
      );

      for (const inst of instances.rows) {
        const startTime = Date.now();
        let healthStatus = "unhealthy";
        let errorMessage: string | null = null;

        try {
          // Check Docker container status
          const containerStatus = await getContainerStatus(inst.container_id);

          if (containerStatus === "running") {
            // Check gateway health endpoint
            const res = await fetch(`${inst.gateway_url}/health`, {
              signal: AbortSignal.timeout(5000),
            }).catch(() => null);

            if (res && res.ok) {
              healthStatus = "healthy";
            } else {
              healthStatus = "unhealthy";
              errorMessage = `Gateway not responding (container running)`;
            }
          } else if (containerStatus === "exited" || containerStatus === "not_found") {
            healthStatus = "unhealthy";
            errorMessage = `Container status: ${containerStatus}`;

            // Auto-restart if was previously running
            if (inst.status === "running") {
              app.log.warn({ instanceId: inst.id }, "Auto-restarting crashed instance");
              await startInstance(app.pg, inst.id).catch(err =>
                app.log.error({ err, instanceId: inst.id }, "Auto-restart failed"),
              );
            }
          } else {
            healthStatus = "unhealthy";
            errorMessage = `Unexpected container status: ${containerStatus}`;
          }
        } catch (err) {
          healthStatus = "unhealthy";
          errorMessage = err instanceof Error ? err.message : "Health check failed";
        }

        const responseTimeMs = Date.now() - startTime;

        // Update instance health
        await app.pg.query(
          `UPDATE openclaw_instances
           SET health_status = $2, last_health_check = NOW(),
               error_message = CASE WHEN $2 = 'healthy' THEN NULL ELSE $3 END
           WHERE id = $1`,
          [inst.id, healthStatus, errorMessage],
        );

        // Log health check
        await app.pg.query(
          `INSERT INTO instance_health_log (instance_id, status, response_time_ms, error_message)
           VALUES ($1, $2, $3, $4)`,
          [inst.id, healthStatus, responseTimeMs, errorMessage],
        );
      }
    } catch (err) {
      app.log.error({ err }, "Health check worker error");
    }
  });

  app.log.info("Health check worker started");
}
