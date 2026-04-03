import type { FastifyInstance } from "fastify";
import cron from "node-cron";

export function startBillingCron(app: FastifyInstance): void {
  // Run on the 1st of every month at 00:05 UTC
  cron.schedule("5 0 1 * *", async () => {
    app.log.info("Billing cron: closing expired billing periods");

    try {
      const result = await app.pg.query(
        `SELECT id FROM billing_periods
         WHERE status = 'open' AND period_end < CURRENT_DATE`,
      );

      for (const row of result.rows) {
        await app.boss.send("billing.close_period", { periodId: row.id });
        app.log.info({ periodId: row.id }, "Enqueued billing.close_period job");
      }

      app.log.info(`Billing cron: enqueued ${result.rowCount} close_period jobs`);
    } catch (err) {
      app.log.error({ err }, "Billing cron failed");
    }
  });

  app.log.info("Billing cron scheduled (1st of each month at 00:05 UTC)");
}
