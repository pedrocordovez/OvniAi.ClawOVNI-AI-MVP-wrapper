import { randomUUID } from "crypto";
import { config } from "../config.js";

export interface PaymentRequest {
  amountCents: number;
  currency:    string;
  description: string;
  email:       string;
  cardNumber:  string;
  cardName:    string;
  expiry:      string;
  cvv:         string;
}

export interface PaymentResult {
  success:    boolean;
  reference?: string;
  error?:     string;
}

export async function processPayment(req: PaymentRequest): Promise<PaymentResult> {
  // ── Stripe (if configured) ──────────────────────────────────
  if (config.stripeSecretKey) {
    return processStripePayment(req);
  }

  // ── Mock (development) ──────────────────────────────────────
  return processMockPayment(req);
}

// ─── Mock Implementation ─────────────────────────────────────────────────────

async function processMockPayment(req: PaymentRequest): Promise<PaymentResult> {
  console.log(`💳 [MOCK PAYMENT] $${(req.amountCents / 100).toFixed(2)} ${req.currency.toUpperCase()}`);
  console.log(`   Card: ****${req.cardNumber.slice(-4)} · ${req.cardName}`);
  console.log(`   ${req.description}`);

  // Simulate failure for specific test card
  if (req.cardNumber.replace(/\s/g, "") === "4000000000000002") {
    return { success: false, error: "Card declined (test failure card)" };
  }

  return {
    success:   true,
    reference: `mock_${randomUUID()}`,
  };
}

// ─── Stripe Implementation ───────────────────────────────────────────────────

async function processStripePayment(req: PaymentRequest): Promise<PaymentResult> {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(config.stripeSecretKey);

  try {
    const [expMonth, expYear] = req.expiry.split("/").map(Number);

    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        number:    req.cardNumber.replace(/\s/g, ""),
        exp_month: expMonth,
        exp_year:  expYear < 100 ? 2000 + expYear : expYear,
        cvc:       req.cvv,
      },
      billing_details: { name: req.cardName, email: req.email },
    });

    const intent = await stripe.paymentIntents.create({
      amount:         req.amountCents,
      currency:       req.currency,
      payment_method: paymentMethod.id,
      confirm:        true,
      description:    req.description,
      receipt_email:  req.email,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    if (intent.status === "succeeded") {
      return { success: true, reference: intent.id };
    }

    return {
      success: false,
      error:   `Payment status: ${intent.status}. Please try again.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment processing failed";
    return { success: false, error: message };
  }
}
