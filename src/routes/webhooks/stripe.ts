import type { FastifyInstance } from "fastify";
import type StripeType from "stripe";
import { config } from "../../config.js";

export default async function stripeWebhookRoutes(app: FastifyInstance) {
  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    // Register a no-op if Stripe is not configured
    app.post("/webhooks/stripe", async (_request, reply) => {
      return reply.status(501).send({ error: "Stripe not configured" });
    });
    return;
  }

  // Raw body needed for signature verification
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/webhooks/stripe", async (request, reply) => {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(config.stripeSecretKey);

    const sig = request.headers["stripe-signature"] as string;
    if (!sig) return reply.status(400).send({ error: "Missing stripe-signature header" });

    let event: StripeType.Event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        sig,
        config.stripeWebhookSecret,
      );
    } catch (err) {
      app.log.warn({ err }, "Stripe webhook signature verification failed");
      return reply.status(400).send({ error: "Invalid signature" });
    }

    // Idempotency: skip already-processed events
    const existing = await app.pg.query(
      `SELECT 1 FROM audit_logs WHERE action = 'stripe_webhook' AND new_values->>'event_id' = $1`,
      [event.id],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.status(200).send({ received: true, duplicate: true });
    }

    // Handle events
    switch (event.type) {
      case "payment_intent.succeeded": {
        app.log.info({ eventId: event.id }, "Stripe payment succeeded");
        break;
      }
      case "payment_intent.payment_failed": {
        app.log.warn({ eventId: event.id }, "Stripe payment failed");
        break;
      }
      case "invoice.payment_failed": {
        app.log.warn({ eventId: event.id }, "Stripe invoice payment failed");
        break;
      }
      default:
        app.log.info({ type: event.type }, "Unhandled Stripe event type");
    }

    // Log the webhook for idempotency
    await app.pg.query(
      `INSERT INTO audit_logs (action, entity_type, new_values)
       VALUES ('stripe_webhook', 'stripe_event', $1)`,
      [JSON.stringify({ event_id: event.id, type: event.type })],
    );

    return reply.status(200).send({ received: true });
  });
}
