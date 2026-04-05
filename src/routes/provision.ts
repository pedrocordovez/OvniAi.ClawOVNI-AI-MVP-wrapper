import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { processPayment, verifyPaymentIntent } from "../services/payment.js";
import { provisionTenant } from "../services/provisioning.js";
import {
  sendWelcomeEmail,
  sendPaymentFailedEmail,
  sendOpsAlert,
} from "../services/email.js";
import { buildAgentProfile } from "../services/agentBuilder.js";
import { metrics } from "../services/cloudwatch.js";
import { createPaymentIntent } from "../services/payment.js";
import type { PlanId } from "../config.js";

// Accepts either Stripe Elements payment_intent_id (production) or
// raw card fields (mock/dev when STRIPE_SECRET_KEY is not set).
const ProvisionSchema = z.object({
  idempotency_key:   z.string().min(8).max(128),
  company_name:      z.string().min(1).max(100),
  industry:          z.string().min(1).max(50),
  contact_name:      z.string().min(1).max(100),
  contact_email:     z.string().email(),
  plan_id:           z.enum(["starter", "pro", "enterprise"]),
  // Stripe Elements (production)
  payment_intent_id: z.string().optional(),
  // Raw card fields (dev/mock only — never touch our server in production)
  card_number:       z.string().min(13).max(19).optional(),
  card_name:         z.string().optional(),
  expiry:            z.string().regex(/^\d{2}\/\d{2}$/, "Format MM/YY").optional(),
  cvv:               z.string().min(3).max(4).optional(),
  channels:          z.record(z.unknown()).optional(),
  software_stack:    z.record(z.unknown()).optional(),
  agent_config:      z.object({
    use_cases:           z.array(z.string()).optional(),
    tone:                z.string().optional(),
    languages:           z.array(z.string()).optional(),
    agent_name:          z.string().optional(),
    company_description: z.string().optional(),
    key_services:        z.string().optional(),
    faqs:                z.string().optional(),
  }).optional(),
}).refine(
  d => d.payment_intent_id || d.card_number,
  { message: "Se requiere payment_intent_id (Stripe Elements) o datos de tarjeta (dev)" },
);

export default async function provisionRoutes(app: FastifyInstance) {

  app.post("/api/provision", async (request, reply) => {
    const parsed = ProvisionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error:   "invalid_request",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const d = parsed.data;
    const plan = config.plans[d.plan_id];

    // 1. Idempotency check
    const existing = await app.pg.query(
      `SELECT id, provision_status, tenant_id, payment_status
       FROM provisioning_orders WHERE idempotency_key = $1`,
      [d.idempotency_key],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      const row = existing.rows[0];
      if (row.provision_status === "complete") {
        return reply.status(200).send({
          status:    "already_provisioned",
          tenant_id: row.tenant_id,
          message:   "Esta solicitud ya fue procesada.",
        });
      }
      if (row.provision_status === "in_progress") {
        return reply.status(202).send({ status: "in_progress", order_id: row.id });
      }
    }

    // 2. IP rate limit (3 attempts / 10 min)
    const ip = request.ip ?? "unknown";
    const ratKey = `provision:ip:${ip}`;
    const attempts = await app.redis.incr(ratKey);
    if (attempts === 1) await app.redis.expire(ratKey, 600);
    if (attempts > 3) {
      return reply.status(429).send({
        error:   "too_many_attempts",
        message: "Demasiados intentos. Espera 10 minutos.",
      });
    }

    // 3. Derive slug
    const slug = d.company_name
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

    const totalCents = config.activationFeeCents + plan.monthlyFeeCents;

    // 4. Create order (pending)
    const orderResult = await app.pg.query(
      `INSERT INTO provisioning_orders (
         company_name, company_slug, industry,
         contact_name, contact_email, plan_id,
         payment_status,
         activation_fee_cents, monthly_fee_cents, total_charged_cents,
         idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10)
       ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [d.company_name, slug, d.industry, d.contact_name, d.contact_email,
       d.plan_id, config.activationFeeCents, plan.monthlyFeeCents, totalCents, d.idempotency_key],
    );
    const orderId: string = orderResult.rows[0].id;

    // 5. Process payment
    // Production: verify PaymentIntent confirmed by Stripe Elements on the client.
    // Dev/mock: charge raw card fields via server-side Stripe call (no Stripe key = mock).
    const paymentResult = d.payment_intent_id
      ? await verifyPaymentIntent(d.payment_intent_id)
      : await processPayment({
          amountCents:  totalCents,
          currency:     "usd",
          description:  `OVNI AI — Plan ${plan.name} + Activacion (${d.company_name})`,
          email:        d.contact_email,
          cardNumber:   d.card_number ?? "",
          cardName:     d.card_name ?? "",
          expiry:       d.expiry ?? "",
          cvv:          d.cvv ?? "",
        });

    if (!paymentResult.success) {
      await app.pg.query(
        `UPDATE provisioning_orders SET payment_status='failed', error_message=$2 WHERE id=$1`,
        [orderId, paymentResult.error],
      );
      sendPaymentFailedEmail({
        to:          d.contact_email,
        contactName: d.contact_name,
        companyName: d.company_name,
        planName:    plan.name,
        orderId,
        errorMsg:    paymentResult.error ?? "Pago no aprobado",
      }).catch(err => app.log.warn({ err }, "Failed to send payment-failed email"));

      return reply.status(402).send({
        error:   "payment_failed",
        message: paymentResult.error ?? "El pago no pudo ser procesado",
      });
    }

    await app.pg.query(
      `UPDATE provisioning_orders SET payment_status='paid', payment_reference=$2 WHERE id=$1`,
      [orderId, paymentResult.reference],
    );

    // 6. Provision tenant
    // Build personalized agent based on onboarding answers
    const agentProfile = buildAgentProfile({
      companyName:   d.company_name,
      industry:      d.industry,
      contactName:   d.contact_name,
      planId:        d.plan_id,
      channels:      d.channels,
      softwareStack: d.software_stack,
      agentConfig:   d.agent_config as any,
    });

    let provisionResult;
    try {
      provisionResult = await provisionTenant(app.pg, {
        orderId,
        companyName:   d.company_name,
        companySlug:   slug,
        contactName:   d.contact_name,
        contactEmail:  d.contact_email,
        industry:      d.industry,
        planId:        d.plan_id,
        systemPrompt:  agentProfile.systemPrompt,
        channels:      d.channels,
        softwareStack: d.software_stack,
      });
    } catch (err) {
      app.log.error({ err, orderId }, "Provisioning failed after successful payment");
      sendOpsAlert({
        orderId,
        companyName: d.company_name,
        email:       d.contact_email,
        planId:      d.plan_id,
        error:       (err as Error).message,
      }).catch(() => {});

      return reply.status(500).send({
        error:    "provisioning_failed",
        order_id: orderId,
        message:  "Tu pago fue procesado pero hubo un error activando la cuenta. " +
                  "Nuestro equipo te contactara en menos de 1 hora. " +
                  `Referencia: ${orderId}`,
      });
    }

    // 7. Send welcome email (non-blocking)
    sendWelcomeEmail({
      to:           d.contact_email,
      contactName:  d.contact_name,
      companyName:  d.company_name,
      planName:     plan.name,
      apiKey:       provisionResult.apiKey,
      keyPrefix:    provisionResult.keyPrefix,
      totalCharged: totalCents,
      monthlyFee:   plan.monthlyFeeCents,
    }).catch(err => app.log.warn({ err }, "Failed to send welcome email"));

    // 8. CloudWatch metric + return success
    metrics.provisioningSuccess(d.plan_id).catch(() => {});

    return reply.status(201).send({
      status:     "provisioned",
      order_id:   orderId,
      tenant_id:  provisionResult.tenantId,
      api_key:    provisionResult.apiKey,
      key_prefix: provisionResult.keyPrefix,
      plan:       plan.name,
      agents:     agentProfile.agents.map(a => ({ name: a.name, role: a.role })),
      message:    "Cuenta activada! Guarda tu API key, no la podras ver de nuevo.",
    });
  });

  // ── POST /api/provision/payment-intent ──────────────────────────────────────
  // Creates a Stripe PaymentIntent for the wizard to confirm via Stripe Elements.
  // The card never touches our server — only the resulting intent ID does.
  app.post("/api/provision/payment-intent", async (request, reply) => {
    const body = request.body as { plan_id?: string; contact_email?: string };
    const planId = body?.plan_id as PlanId | undefined;

    if (!planId || !config.plans[planId]) {
      return reply.status(400).send({ error: "plan_id invalido" });
    }

    const plan = config.plans[planId];
    const totalCents = config.activationFeeCents + plan.monthlyFeeCents;

    const { clientSecret, stripeMode } = await createPaymentIntent(
      totalCents,
      "usd",
      `OVNI AI — Plan ${plan.name} + Activacion`,
      body.contact_email,
    );

    return {
      client_secret: clientSecret,
      amount:        totalCents,
      stripe_mode:   stripeMode,
    };
  });

  // ── GET /api/provision/plans ────────────────────────────────────────────────
  app.get("/api/provision/plans", async () => ({
    activation_fee_cents:  config.activationFeeCents,
    stripe_publishable_key: config.stripePublishableKey || null,
    plans: Object.values(config.plans).map(p => ({
      id:                p.id,
      name:              p.name,
      monthly_fee_cents: p.monthlyFeeCents,
      model:             p.model,
      monthly_token_cap: p.monthlyTokenCap,
      user_limit:        p.userLimit,
      rpm_limit:         p.rpmLimit,
    })),
  }));
}
