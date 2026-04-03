import type { Pool, PoolClient } from "pg";
import type { Redis } from "ioredis";
import type PgBoss from "pg-boss";

// ─── Database Row Types ──────────────────────────────────────────────────────

export interface TenantRow {
  id:                     string;
  name:                   string;
  slug:                   string;
  anthropic_api_key:      string;
  default_model:          string;
  allowed_models:         string[];
  system_prompt:          string | null;
  plan_id:                string;
  rpm_limit:              number;
  tpm_limit:              number;
  monthly_token_cap:      number;
  monthly_seat_fee_cents: number;
  stripe_customer_id:     string | null;
  stripe_subscription_id: string | null;
  active:                 boolean;
  created_at:             Date;
  updated_at:             Date;
}

export interface UserRow {
  id:         string;
  tenant_id:  string;
  email:      string;
  name:       string;
  role:       "admin" | "user";
  active:     boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ApiKeyRow {
  id:           string;
  tenant_id:    string;
  user_id:      string | null;
  key_hash:     string;
  key_prefix:   string;
  label:        string | null;
  active:       boolean;
  last_used_at: Date | null;
  created_at:   Date;
}

export interface UsageEventRow {
  id:             string;
  tenant_id:      string;
  user_id:        string | null;
  model:          string;
  input_tokens:   number;
  output_tokens:  number;
  anthropic_cost: string; // NUMERIC comes as string from pg
  billed_cost:    string;
  latency_ms:     number | null;
  status:         string;
  channel:        string;
  created_at:     Date;
}

export interface BillingPeriodRow {
  id:                string;
  tenant_id:         string;
  period_start:      Date;
  period_end:        Date;
  total_tokens:      number;
  total_billed_cost: string;
  active_user_count: number;
  status:            "open" | "closed" | "invoiced";
  created_at:        Date;
  updated_at:        Date;
}

export interface InvoiceRow {
  id:                string;
  tenant_id:         string;
  billing_period_id: string | null;
  invoice_number:    string;
  subtotal_cents:    number;
  tax_cents:         number;
  total_cents:       number;
  status:            "draft" | "finalized" | "sent" | "paid" | "void";
  created_at:        Date;
  finalized_at:      Date | null;
  sent_at:           Date | null;
  paid_at:           Date | null;
  updated_at:        Date;
}

export interface InvoiceLineItemRow {
  id:               string;
  invoice_id:       string;
  type:             "token_usage" | "seat_fee" | "activation" | "messaging";
  description:      string;
  quantity:          string;
  unit_price_cents: number;
  total_cents:      number;
  created_at:       Date;
}

export interface AdminUserRow {
  id:           string;
  email:        string;
  name:         string;
  role:         "superadmin" | "staff";
  key_hash:     string;
  totp_secret:  string | null;
  totp_enabled: boolean;
  active:       boolean;
  created_at:   Date;
  updated_at:   Date;
}

export interface ProvisioningOrderRow {
  id:                   string;
  company_name:         string;
  company_slug:         string;
  industry:             string | null;
  contact_name:         string;
  contact_email:        string;
  plan_id:              string;
  payment_status:       "pending" | "paid" | "failed" | "refunded";
  payment_method:       string | null;
  payment_reference:    string | null;
  activation_fee_cents: number;
  monthly_fee_cents:    number;
  total_charged_cents:  number;
  provision_status:     "pending" | "in_progress" | "complete" | "failed";
  tenant_id:            string | null;
  error_message:        string | null;
  idempotency_key:      string | null;
  created_at:           Date;
  updated_at:           Date;
}

// ─── OpenClaw Instance Types ─────────────────────────────────────────────────

export type InstanceStatus = "provisioning" | "running" | "paused" | "stopped" | "error" | "destroying";
export type HealthStatus = "healthy" | "unhealthy" | "unknown";

export interface OpenClawInstanceRow {
  id:                    string;
  tenant_id:             string;
  container_id:          string | null;
  container_name:        string | null;
  host:                  string;
  port:                  number | null;
  status:                InstanceStatus;
  openclaw_version:      string;
  config_volume_path:    string | null;
  workspace_volume_path: string | null;
  anthropic_api_key_ref: string | null;
  gateway_token:         string | null;
  gateway_url:           string | null;
  channels:              Record<string, unknown>;
  software_stack:        Record<string, unknown>;
  agent_config:          Record<string, unknown>;
  health_status:         HealthStatus;
  last_health_check:     Date | null;
  error_message:         string | null;
  created_at:            Date;
  updated_at:            Date;
}

export interface ApiKeyVaultRow {
  id:          string;
  label:       string;
  api_key_enc: string;
  assigned_to: string | null;
  active:      boolean;
  created_at:  Date;
  updated_at:  Date;
}

export interface InstanceHealthLogRow {
  id:               number;
  instance_id:      string;
  status:           string;
  response_time_ms: number | null;
  error_message:    string | null;
  checked_at:       Date;
}

// ─── Request Context Types ───────────────────────────────────────────────────

export interface TenantContext {
  tenantId:        string;
  userId:          string | null;
  anthropicApiKey: string;
  defaultModel:    string;
  allowedModels:   string[];
  systemPrompt:    string | null;
  rpmLimit:        number;
  tpmLimit:        number;
  monthlyTokenCap: number;
  planId:          string;
}

export interface AdminContext {
  adminId: string;
  email:   string;
  name:    string;
  role:    "superadmin" | "staff";
}

// ─── Fastify Augmentation ────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    pg:    Pool;
    redis: Redis;
    boss:  PgBoss;
  }
  interface FastifyRequest {
    tenant?: TenantContext;
    admin?:  AdminContext;
  }
}
