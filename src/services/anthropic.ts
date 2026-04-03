import Anthropic from "@anthropic-ai/sdk";

const clientCache = new Map<string, Anthropic>();

export function getAnthropicClient(tenantId: string, apiKey: string): Anthropic {
  const existing = clientCache.get(tenantId);
  if (existing) return existing;

  const client = new Anthropic({ apiKey });
  clientCache.set(tenantId, client);
  return client;
}

export function clearAnthropicClient(tenantId: string): void {
  clientCache.delete(tenantId);
}
