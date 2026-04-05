import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror the ProvisionSchema for unit testing without importing the full route
const ProvisionSchema = z.object({
  idempotency_key:   z.string().min(8).max(128),
  company_name:      z.string().min(1).max(100),
  industry:          z.string().min(1).max(50),
  contact_name:      z.string().min(1).max(100),
  contact_email:     z.string().email(),
  plan_id:           z.enum(["starter", "pro", "enterprise"]),
  payment_intent_id: z.string().optional(),
  card_number:       z.string().min(13).max(19).optional(),
  card_name:         z.string().optional(),
  expiry:            z.string().regex(/^\d{2}\/\d{2}$/).optional(),
  cvv:               z.string().min(3).max(4).optional(),
  channels:          z.record(z.unknown()).optional(),
  software_stack:    z.record(z.unknown()).optional(),
  agent_config:      z.object({
    use_cases:    z.array(z.string()).optional(),
    tone:         z.string().optional(),
    languages:    z.array(z.string()).optional(),
    agent_name:   z.string().optional(),
  }).optional(),
}).refine(
  d => d.payment_intent_id || d.card_number,
  { message: "payment_intent_id or card_number required" },
);

const validBase = {
  idempotency_key: "wiz_test_12345678",
  company_name: "Acme Corp",
  industry: "tecnologia",
  contact_name: "Juan Perez",
  contact_email: "juan@acme.com",
  plan_id: "pro" as const,
};

describe("ProvisionSchema", () => {
  it("accepts payment_intent_id (Stripe Elements flow)", () => {
    const result = ProvisionSchema.safeParse({
      ...validBase,
      payment_intent_id: "pi_3abc123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts card_number (mock/dev flow)", () => {
    const result = ProvisionSchema.safeParse({
      ...validBase,
      card_number: "4111111111111111",
      card_name: "Juan Perez",
      expiry: "12/26",
      cvv: "123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither payment_intent_id nor card_number is provided", () => {
    const result = ProvisionSchema.safeParse({ ...validBase });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = ProvisionSchema.safeParse({
      ...validBase,
      contact_email: "not-an-email",
      payment_intent_id: "pi_test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid plan_id", () => {
    const result = ProvisionSchema.safeParse({
      ...validBase,
      plan_id: "ultra" as any,
      payment_intent_id: "pi_test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects expiry with wrong format", () => {
    const result = ProvisionSchema.safeParse({
      ...validBase,
      card_number: "4111111111111111",
      expiry: "2026/12",
    });
    expect(result.success).toBe(false);
  });

  it("rejects idempotency_key shorter than 8 chars", () => {
    const result = ProvisionSchema.safeParse({
      ...validBase,
      idempotency_key: "short",
      payment_intent_id: "pi_test",
    });
    expect(result.success).toBe(false);
  });
});
