import type { Pool } from "pg";

export interface AuditEntry {
  adminId:    string;
  action:     string;
  entityType: string;
  entityId:   string | null;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ip:         string;
}

export async function logAudit(pg: Pool, entry: AuditEntry): Promise<void> {
  await pg.query(
    `INSERT INTO audit_logs
       (admin_user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.adminId, entry.action, entry.entityType, entry.entityId,
      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      entry.newValues ? JSON.stringify(entry.newValues) : null,
      entry.ip,
    ],
  );
}
