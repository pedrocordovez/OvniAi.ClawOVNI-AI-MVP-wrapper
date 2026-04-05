-- Baseline migration: consolidates all 7 schema files
-- Idempotent: safe to run on existing databases


-- ============================================================
-- 001: Core schema (src/db/schema.sql)
-- ============================================================

-- ============================================================
-- OVNI AI — Core Schema (migration 001)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Trigger helper ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Tenants ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  anthropic_api_key   TEXT NOT NULL,
  default_model       TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  allowed_models      TEXT[] DEFAULT '{}',
  system_prompt       TEXT,
  plan_id             TEXT NOT NULL DEFAULT 'starter',
  rpm_limit           INT NOT NULL DEFAULT 30,
  tpm_limit           INT NOT NULL DEFAULT 100000,
  monthly_token_cap   BIGINT NOT NULL DEFAULT 500000,
  monthly_seat_fee_cents INT NOT NULL DEFAULT 0,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS tenants_updated_at ON tenants;
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── API Keys ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  key_hash     TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  label        TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

-- ── Usage Events ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  model           TEXT NOT NULL,
  input_tokens    INT NOT NULL DEFAULT 0,
  output_tokens   INT NOT NULL DEFAULT 0,
  anthropic_cost  NUMERIC(12,6) NOT NULL DEFAULT 0,
  billed_cost     NUMERIC(12,6) NOT NULL DEFAULT 0,
  latency_ms      INT,
  status          TEXT NOT NULL DEFAULT 'success',
  channel         TEXT DEFAULT 'api',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant    ON usage_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_created   ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_dt ON usage_events(tenant_id, created_at);


-- ============================================================
-- 002: Billing schema (src/db/billing_schema.sql)
-- ============================================================

-- ============================================================
-- OVNI AI — Billing Schema (migration 002)
-- ============================================================

-- ── Billing Periods ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_periods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  total_tokens      BIGINT NOT NULL DEFAULT 0,
  total_billed_cost NUMERIC(12,6) NOT NULL DEFAULT 0,
  active_user_count INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed', 'invoiced')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_billing_tenant ON billing_periods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_status ON billing_periods(status);

DROP TRIGGER IF EXISTS billing_periods_updated_at ON billing_periods;
CREATE TRIGGER billing_periods_updated_at
  BEFORE UPDATE ON billing_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Invoices ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_period_id  UUID REFERENCES billing_periods(id),
  invoice_number     TEXT NOT NULL UNIQUE,
  subtotal_cents     INT NOT NULL DEFAULT 0,
  tax_cents          INT NOT NULL DEFAULT 0,
  total_cents        INT NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'finalized', 'sent', 'paid', 'void')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at       TIMESTAMPTZ,
  sent_at            TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Invoice Line Items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('token_usage', 'seat_fee', 'activation', 'messaging')),
  description      TEXT NOT NULL,
  quantity         NUMERIC NOT NULL DEFAULT 1,
  unit_price_cents INT NOT NULL DEFAULT 0,
  total_cents      INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id);

-- ── Admin Users (Ovnicom staff) ─────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('superadmin', 'staff')),
  key_hash      TEXT NOT NULL,
  totp_secret   TEXT,
  totp_enabled  BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS admin_users_updated_at ON admin_users;
CREATE TRIGGER admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 003: Provisioning schema (src/db/provisioning_schema.sql)
-- ============================================================

-- ============================================================
-- OVNI AI — Provisioning Schema (migration 003)
-- ============================================================

CREATE TABLE IF NOT EXISTS provisioning_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name          TEXT NOT NULL,
  company_slug          TEXT NOT NULL,
  industry              TEXT,
  contact_name          TEXT NOT NULL,
  contact_email         TEXT NOT NULL,
  plan_id               TEXT NOT NULL,
  payment_status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method        TEXT,
  payment_reference     TEXT,
  activation_fee_cents  INT NOT NULL,
  monthly_fee_cents     INT NOT NULL,
  total_charged_cents   INT NOT NULL,
  provision_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (provision_status IN ('pending', 'in_progress', 'complete', 'failed')),
  tenant_id             UUID REFERENCES tenants(id),
  error_message         TEXT,
  idempotency_key       TEXT UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provision_orders_email  ON provisioning_orders(contact_email);
CREATE INDEX IF NOT EXISTS idx_provision_orders_status ON provisioning_orders(provision_status);
CREATE INDEX IF NOT EXISTS idx_provision_orders_tenant ON provisioning_orders(tenant_id);

DROP TRIGGER IF EXISTS provisioning_orders_updated_at ON provisioning_orders;
CREATE TRIGGER provisioning_orders_updated_at
  BEFORE UPDATE ON provisioning_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 004: Messaging schema (src/db/messaging_schema.sql)
-- ============================================================

-- ============================================================
-- OVNI AI — Messaging Schema (migration 004)
-- ============================================================

CREATE TABLE IF NOT EXISTS messaging_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram')),
  config       JSONB NOT NULL DEFAULT '{}',
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_tenant ON messaging_channels(tenant_id);

DROP TRIGGER IF EXISTS messaging_channels_updated_at ON messaging_channels;
CREATE TRIGGER messaging_channels_updated_at
  BEFORE UPDATE ON messaging_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS messaging_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id       UUID NOT NULL REFERENCES messaging_channels(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  messages         JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, external_user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_channel ON messaging_conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant  ON messaging_conversations(tenant_id);

DROP TRIGGER IF EXISTS messaging_conversations_updated_at ON messaging_conversations;
CREATE TRIGGER messaging_conversations_updated_at
  BEFORE UPDATE ON messaging_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 005: Audit schema (src/db/audit_schema.sql)
-- ============================================================

-- ============================================================
-- OVNI AI — Audit Schema (migration 005)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id),
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  old_values    JSONB,
  new_values    JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin    ON audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity   ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at);


-- ============================================================
-- 006: Webhooks schema (src/db/webhooks_schema.sql)
-- ============================================================

-- ============================================================
-- OVNI AI — Webhooks Schema (migration 006)
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  events     TEXT[] NOT NULL DEFAULT '{}',
  secret     TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON webhook_endpoints(tenant_id);

DROP TRIGGER IF EXISTS webhook_endpoints_updated_at ON webhook_endpoints;
CREATE TRIGGER webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status_code INT,
  response    TEXT,
  success     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created  ON webhook_deliveries(created_at);


-- ============================================================
-- 007: OpenClaw schema (src/db/openclaw_schema.sql)
-- ============================================================

-- ============================================================
-- OVNI AI — OpenClaw Instances Schema (migration 007)
-- ============================================================

-- ── OpenClaw Instances (one container per tenant) ───────────
CREATE TABLE IF NOT EXISTS openclaw_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  container_id          TEXT,
  container_name        TEXT,
  host                  TEXT DEFAULT 'localhost',
  port                  INT,
  status                TEXT NOT NULL DEFAULT 'provisioning'
                        CHECK (status IN ('provisioning', 'running', 'paused', 'stopped', 'error', 'destroying')),
  openclaw_version      TEXT DEFAULT 'latest',
  config_volume_path    TEXT,
  workspace_volume_path TEXT,
  anthropic_api_key_ref TEXT,
  gateway_token         TEXT,
  gateway_url           TEXT,
  channels              JSONB NOT NULL DEFAULT '{}',
  software_stack        JSONB NOT NULL DEFAULT '{}',
  agent_config          JSONB NOT NULL DEFAULT '{}',
  health_status         TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
  last_health_check     TIMESTAMPTZ,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_openclaw_instances_tenant ON openclaw_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_instances_status ON openclaw_instances(status);

DROP TRIGGER IF EXISTS openclaw_instances_updated_at ON openclaw_instances;
CREATE TRIGGER openclaw_instances_updated_at
  BEFORE UPDATE ON openclaw_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Health Check Log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instance_health_log (
  id            BIGSERIAL PRIMARY KEY,
  instance_id   UUID NOT NULL REFERENCES openclaw_instances(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  response_time_ms INT,
  error_message TEXT,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_log_instance ON instance_health_log(instance_id);
CREATE INDEX IF NOT EXISTS idx_health_log_checked  ON instance_health_log(checked_at);

-- ── API Key Vault (Anthropic keys managed by Ovnicom) ───────
CREATE TABLE IF NOT EXISTS api_key_vault (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  api_key_enc   TEXT NOT NULL,
  assigned_to   UUID REFERENCES tenants(id),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_assigned ON api_key_vault(assigned_to);

DROP TRIGGER IF EXISTS api_key_vault_updated_at ON api_key_vault;
CREATE TRIGGER api_key_vault_updated_at
  BEFORE UPDATE ON api_key_vault
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
