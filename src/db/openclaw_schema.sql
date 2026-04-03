-- ============================================================
-- OVNI AI — OpenClaw Instances Schema (migration 007)
-- ============================================================

-- ── OpenClaw Instances (one container per tenant) ───────────
CREATE TABLE openclaw_instances (
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

CREATE INDEX idx_openclaw_instances_tenant ON openclaw_instances(tenant_id);
CREATE INDEX idx_openclaw_instances_status ON openclaw_instances(status);

CREATE TRIGGER openclaw_instances_updated_at
  BEFORE UPDATE ON openclaw_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Health Check Log ────────────────────────────────────────
CREATE TABLE instance_health_log (
  id            BIGSERIAL PRIMARY KEY,
  instance_id   UUID NOT NULL REFERENCES openclaw_instances(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  response_time_ms INT,
  error_message TEXT,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_log_instance ON instance_health_log(instance_id);
CREATE INDEX idx_health_log_checked  ON instance_health_log(checked_at);

-- ── API Key Vault (Anthropic keys managed by Ovnicom) ───────
CREATE TABLE api_key_vault (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  api_key_enc   TEXT NOT NULL,
  assigned_to   UUID REFERENCES tenants(id),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vault_assigned ON api_key_vault(assigned_to);

CREATE TRIGGER api_key_vault_updated_at
  BEFORE UPDATE ON api_key_vault
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
