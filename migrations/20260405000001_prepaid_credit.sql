-- Prepaid credit system for OVNI AI
-- Monthly fee + prepaid API credit with auto-recharge

-- Add credit/billing columns to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS credit_balance_cents INT NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_recharge BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS recharge_amount_cents INT NOT NULL DEFAULT 5000;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS recharge_threshold_cents INT NOT NULL DEFAULT 500;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- Credit transactions log
CREATE TABLE IF NOT EXISTS credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN (
    'initial_credit',    -- credit from first payment
    'recharge',          -- manual or auto recharge
    'usage_deduction',   -- API usage deduction
    'monthly_fee',       -- monthly subscription charge
    'refund',            -- credit refund
    'adjustment'         -- manual admin adjustment
  )),
  amount_cents    INT NOT NULL,                -- positive = credit added, negative = deducted
  balance_after   INT NOT NULL,                -- balance after this transaction
  description     TEXT,
  stripe_charge_id TEXT,                       -- Stripe payment reference if applicable
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_tenant ON credit_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions(type);
