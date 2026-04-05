import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config before importing payment
vi.mock("../config.js", () => ({
  config: {
    stripeSecretKey: "",   // mock mode (no real Stripe)
    anthropicMargin: 1.25,
    nodeEnv: "test",
  },
  ANTHROPIC_PRICING: {},
}));

import { processPayment, verifyPaymentIntent } from "../services/payment.js";

describe("processPayment (mock mode)", () => {
  it("succeeds with a valid test card", async () => {
    const result = await processPayment({
      amountCents: 44800,
      currency: "usd",
      description: "Test charge",
      email: "test@example.com",
      cardNumber: "4111111111111111",
      cardName: "Test User",
      expiry: "12/26",
      cvv: "123",
    });
    expect(result.success).toBe(true);
    expect(result.reference).toMatch(/^mock_/);
  });

  it("fails with the test decline card (4000000000000002)", async () => {
    const result = await processPayment({
      amountCents: 10000,
      currency: "usd",
      description: "Test charge",
      email: "test@example.com",
      cardNumber: "4000000000000002",
      cardName: "Test User",
      expiry: "12/26",
      cvv: "123",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("verifyPaymentIntent (mock mode)", () => {
  it("returns success for any intent ID in mock mode", async () => {
    const result = await verifyPaymentIntent("pi_test_12345");
    expect(result.success).toBe(true);
    expect(result.reference).toBe("pi_test_12345");
  });
});
