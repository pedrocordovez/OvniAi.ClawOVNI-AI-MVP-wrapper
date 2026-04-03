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
CREATE TABLE tenants (
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

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Users ───────────────────────────────────────────────────
CREATE TABLE users (
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

CREATE INDEX idx_users_tenant ON users(tenant_id);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── API Keys ────────────────────────────────────────────────
CREATE TABLE api_keys (
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

CREATE INDEX idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);

-- ── Usage Events ────────────────────────────────────────────
CREATE TABLE usage_events (
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

CREATE INDEX idx_usage_tenant    ON usage_events(tenant_id);
CREATE INDEX idx_usage_created   ON usage_events(created_at);
CREATE INDEX idx_usage_tenant_dt ON usage_events(tenant_id, created_at);
