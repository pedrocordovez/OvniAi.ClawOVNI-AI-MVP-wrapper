import { randomBytes, createHash } from "crypto";

export interface GeneratedKey {
  raw:    string;
  hash:   string;
  prefix: string;
}

export function generateTenantKey(): GeneratedKey {
  const hex = randomBytes(24).toString("hex"); // 48 hex chars
  const raw = `ovni_sk_${hex}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 16);
  return { raw, hash, prefix };
}

export function generateAdminKey(): GeneratedKey {
  const hex = randomBytes(24).toString("hex");
  const raw = `ovni_admin_${hex}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 20);
  return { raw, hash, prefix };
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
