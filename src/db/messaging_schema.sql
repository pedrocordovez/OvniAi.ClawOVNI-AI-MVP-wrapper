-- ============================================================
-- OVNI AI — Messaging Schema (migration 004)
-- ============================================================

CREATE TABLE messaging_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram')),
  config       JSONB NOT NULL DEFAULT '{}',
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_tenant ON messaging_channels(tenant_id);

CREATE TRIGGER messaging_channels_updated_at
  BEFORE UPDATE ON messaging_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE messaging_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id       UUID NOT NULL REFERENCES messaging_channels(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  messages         JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, external_user_id)
);

CREATE INDEX idx_conversations_channel ON messaging_conversations(channel_id);
CREATE INDEX idx_conversations_tenant  ON messaging_conversations(tenant_id);

CREATE TRIGGER messaging_conversations_updated_at
  BEFORE UPDATE ON messaging_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
