import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { Pool } from "pg";

// Simple AES-256-GCM encryption for storing Anthropic keys at rest
const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY ?? "0".repeat(64); // 32 bytes hex
const ALGORITHM = "aes-256-gcm";

function encrypt(plaintext: string): string {
  const key = Buffer.from(VAULT_KEY, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encrypted] = ciphertext.split(":");
  const key = Buffer.from(VAULT_KEY, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ─── Store a new Anthropic API key ───────────────────────────────────────────

export async function storeAnthropicKey(
  pg: Pool,
  label: string,
  apiKey: string,
): Promise<string> {
  const encrypted = encrypt(apiKey);
  const result = await pg.query(
    `INSERT INTO api_key_vault (label, api_key_enc) VALUES ($1, $2) RETURNING id`,
    [label, encrypted],
  );
  return result.rows[0].id as string;
}

// ─── Retrieve and decrypt an Anthropic API key ──────────────────────────────

export async function getAnthropicKey(pg: Pool, vaultId: string): Promise<string> {
  const result = await pg.query(
    `SELECT api_key_enc FROM api_key_vault WHERE id = $1 AND active = true`,
    [vaultId],
  );
  if (!result.rowCount) throw new Error("API key not found in vault");
  return decrypt(result.rows[0].api_key_enc);
}

// ─── Assign a key to a tenant ────────────────────────────────────────────────

export async function assignKeyToTenant(
  pg: Pool,
  vaultId: string,
  tenantId: string,
): Promise<void> {
  await pg.query(
    `UPDATE api_key_vault SET assigned_to = $2 WHERE id = $1`,
    [vaultId, tenantId],
  );
}

// ─── Get the key assigned to a tenant ────────────────────────────────────────

export async function getTenantAnthropicKey(pg: Pool, tenantId: string): Promise<string> {
  const result = await pg.query(
    `SELECT api_key_enc FROM api_key_vault
     WHERE assigned_to = $1 AND active = true
     LIMIT 1`,
    [tenantId],
  );

  if (!result.rowCount) {
    // Fallback to the key stored on the tenant row
    const tenantResult = await pg.query(
      `SELECT anthropic_api_key FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (!tenantResult.rowCount) throw new Error("Tenant not found");
    return tenantResult.rows[0].anthropic_api_key;
  }

  return decrypt(result.rows[0].api_key_enc);
}

// ─── List all keys in vault ──────────────────────────────────────────────────

export async function listVaultKeys(pg: Pool): Promise<Array<{
  id: string; label: string; assigned_to: string | null; active: boolean;
}>> {
  const result = await pg.query(
    `SELECT v.id, v.label, v.assigned_to, v.active, t.name AS tenant_name
     FROM api_key_vault v
     LEFT JOIN tenants t ON t.id = v.assigned_to
     ORDER BY v.created_at DESC`,
  );
  return result.rows;
}

// ─── Rotate a key (store new, deactivate old) ────────────────────────────────

export async function rotateKey(
  pg: Pool,
  oldVaultId: string,
  newApiKey: string,
): Promise<string> {
  const oldResult = await pg.query(
    `SELECT label, assigned_to FROM api_key_vault WHERE id = $1`,
    [oldVaultId],
  );
  if (!oldResult.rowCount) throw new Error("Old key not found");

  const { label, assigned_to } = oldResult.rows[0];

  // Store new key with same label and assignment
  const newId = await storeAnthropicKey(pg, `${label} (rotated)`, newApiKey);
  if (assigned_to) {
    await assignKeyToTenant(pg, newId, assigned_to);
  }

  // Deactivate old key
  await pg.query(
    `UPDATE api_key_vault SET active = false WHERE id = $1`,
    [oldVaultId],
  );

  return newId;
}
