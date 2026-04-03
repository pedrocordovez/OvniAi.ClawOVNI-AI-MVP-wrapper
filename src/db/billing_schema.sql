-- ============================================================
-- OVNI AI — Billing Schema (migration 002)
-- ============================================================

-- ── Billing Periods ─────────────────────────────────────────
CREATE TABLE billing_periods (
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

CREATE INDEX idx_billing_tenant ON billing_periods(tenant_id);
CREATE INDEX idx_billing_status ON billing_periods(status);

CREATE TRIGGER billing_periods_updated_at
  BEFORE UPDATE ON billing_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Invoices ────────────────────────────────────────────────
CREATE TABLE invoices (
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

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_status ON invoices(status);

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Invoice Line Items ──────────────────────────────────────
CREATE TABLE invoice_line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('token_usage', 'seat_fee', 'activation', 'messaging')),
  description      TEXT NOT NULL,
  quantity         NUMERIC NOT NULL DEFAULT 1,
  unit_price_cents INT NOT NULL DEFAULT 0,
  total_cents      INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);

-- ── Admin Users (Ovnicom staff) ─────────────────────────────
CREATE TABLE admin_users (
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

CREATE TRIGGER admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
