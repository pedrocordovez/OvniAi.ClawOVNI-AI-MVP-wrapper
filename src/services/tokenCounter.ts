import { ANTHROPIC_PRICING, config } from "../config.js";

export interface CostResult {
  anthropicCost: number;
  billedCost:    number;
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostResult {
  const pricing = ANTHROPIC_PRICING[model];
  if (!pricing) {
    // Fallback to Sonnet pricing for unknown models
    const fallback = ANTHROPIC_PRICING["claude-sonnet-4-20250514"];
    return calculateWithPricing(fallback.inputPerMillion, fallback.outputPerMillion, inputTokens, outputTokens);
  }
  return calculateWithPricing(pricing.inputPerMillion, pricing.outputPerMillion, inputTokens, outputTokens);
}

function calculateWithPricing(
  inputPerMillion: number,
  outputPerMillion: number,
  inputTokens: number,
  outputTokens: number,
): CostResult {
  const anthropicCost =
    (inputTokens / 1_000_000) * inputPerMillion +
    (outputTokens / 1_000_000) * outputPerMillion;

  const billedCost = anthropicCost * config.anthropicMargin;

  return { anthropicCost, billedCost };
}
