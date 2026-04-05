import { describe, it, expect } from "vitest";
import { calculateCost } from "../services/tokenCounter.js";

describe("calculateCost", () => {
  it("calculates Haiku cost correctly", () => {
    // Haiku: $0.80/1M input, $4.00/1M output, 1.25 margin
    const result = calculateCost("claude-haiku-4-5-20251001", 1_000_000, 1_000_000);
    expect(result.anthropicCost).toBeCloseTo(0.80 + 4.00, 5);
    expect(result.billedCost).toBeCloseTo((0.80 + 4.00) * 1.25, 5);
  });

  it("calculates Sonnet cost correctly", () => {
    // Sonnet: $3.00/1M input, $15.00/1M output
    const result = calculateCost("claude-sonnet-4-20250514", 500_000, 200_000);
    const expected = (500_000 / 1_000_000) * 3.00 + (200_000 / 1_000_000) * 15.00;
    expect(result.anthropicCost).toBeCloseTo(expected, 5);
    expect(result.billedCost).toBeCloseTo(expected * 1.25, 5);
  });

  it("calculates Opus cost correctly", () => {
    // Opus: $15.00/1M input, $75.00/1M output
    const result = calculateCost("claude-opus-4-20250514", 100_000, 50_000);
    const expected = (100_000 / 1_000_000) * 15.00 + (50_000 / 1_000_000) * 75.00;
    expect(result.anthropicCost).toBeCloseTo(expected, 5);
  });

  it("falls back to Sonnet pricing for unknown models", () => {
    const known = calculateCost("claude-sonnet-4-20250514", 1_000, 1_000);
    const unknown = calculateCost("claude-unknown-model", 1_000, 1_000);
    expect(unknown.anthropicCost).toBeCloseTo(known.anthropicCost, 8);
  });

  it("returns zero cost for zero tokens", () => {
    const result = calculateCost("claude-haiku-4-5-20251001", 0, 0);
    expect(result.anthropicCost).toBe(0);
    expect(result.billedCost).toBe(0);
  });

  it("billedCost is always >= anthropicCost (margin >= 1)", () => {
    const result = calculateCost("claude-sonnet-4-20250514", 10_000, 5_000);
    expect(result.billedCost).toBeGreaterThanOrEqual(result.anthropicCost);
  });
});
