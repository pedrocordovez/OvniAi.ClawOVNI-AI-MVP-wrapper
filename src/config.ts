// ─── Environment ─────────────────────────────────────────────────────────────

export const config = {
  port:      parseInt(process.env.PORT ?? "3000", 10),
  nodeEnv:   process.env.NODE_ENV ?? "development",
  dbUrl:     process.env.DATABASE_URL ?? "postgres://ovni:ovni_secret@localhost:5432/ovni_wrapper",
  redisUrl:  process.env.REDIS_URL ?? "redis://localhost:6379",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicMargin: parseFloat(process.env.ANTHROPIC_MARGIN ?? "1.25"),

  resendApiKey:   process.env.RESEND_API_KEY ?? "",
  smtpFrom:       process.env.SMTP_FROM ?? "noreply@ovni.ai",
  opsAlertEmail:  process.env.OPS_ALERT_EMAIL ?? "ops@ovni.ai",

  stripeSecretKey:     process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",

  twilioAccountSid:    process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken:     process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioWhatsAppFrom:  process.env.TWILIO_WHATSAPP_FROM ?? "",

  activationFeeCents: 29900,

  plans: {
    starter: {
      id:              "starter" as const,
      name:            "Starter",
      monthlyFeeCents: 14900,
      model:           "claude-haiku-4-5-20251001",
      monthlyTokenCap: 500_000,
      userLimit:       5,
      rpmLimit:        30,
      tpmLimit:        100_000,
    },
    pro: {
      id:              "pro" as const,
      name:            "Pro",
      monthlyFeeCents: 39900,
      model:           "claude-sonnet-4-20250514",
      monthlyTokenCap: 2_000_000,
      userLimit:       25,
      rpmLimit:        60,
      tpmLimit:        400_000,
    },
    enterprise: {
      id:              "enterprise" as const,
      name:            "Enterprise",
      monthlyFeeCents: 99900,
      model:           "claude-opus-4-20250514",
      monthlyTokenCap: 10_000_000,
      userLimit:       100,
      rpmLimit:        120,
      tpmLimit:        1_000_000,
    },
  } as const,
} as const;

export type PlanId = keyof typeof config.plans;
export type PlanConfig = typeof config.plans[PlanId];

// ─── Anthropic Pricing (per million tokens) ──────────────────────────────────

export interface ModelPricing {
  inputPerMillion:  number;
  outputPerMillion: number;
}

export const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001":  { inputPerMillion: 0.80,  outputPerMillion: 4.00  },
  "claude-sonnet-4-20250514":   { inputPerMillion: 3.00,  outputPerMillion: 15.00 },
  "claude-opus-4-20250514":     { inputPerMillion: 15.00, outputPerMillion: 75.00 },
};
