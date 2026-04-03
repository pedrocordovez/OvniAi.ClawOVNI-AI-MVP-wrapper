import type { FastifyRequest, FastifyReply } from "fastify";
import { hashKey } from "../services/keyGenerator.js";
import type { AdminContext } from "../types.js";

export async function adminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7);
  if (!token.startsWith("ovni_admin_")) {
    reply.status(401).send({ error: "Invalid admin key format" });
    return;
  }

  const keyHash = hashKey(token);

  const result = await request.server.pg.query(
    `SELECT id, email, name, role
     FROM admin_users
     WHERE key_hash = $1 AND active = true`,
    [keyHash],
  );

  if (!result.rowCount || result.rowCount === 0) {
    reply.status(401).send({ error: "Invalid or revoked admin key" });
    return;
  }

  const row = result.rows[0];

  request.admin = {
    adminId: row.id,
    email:   row.email,
    name:    row.name,
    role:    row.role,
  };
}
