-- ============================================================
-- OVNI AI — Provisioning Schema (migration 003)
-- ============================================================

CREATE TABLE provisioning_orders (
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

CREATE INDEX idx_provision_orders_email  ON provisioning_orders(contact_email);
CREATE INDEX idx_provision_orders_status ON provisioning_orders(provision_status);
CREATE INDEX idx_provision_orders_tenant ON provisioning_orders(tenant_id);

CREATE TRIGGER provisioning_orders_updated_at
  BEFORE UPDATE ON provisioning_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
