import { Pool } from "pg";
import { config } from "../config.js";
import { generateTenantKey, generateAdminKey } from "../services/keyGenerator.js";

async function seed() {
  const pool = new Pool({ connectionString: config.dbUrl });

  try {
    console.log("\n=== OVNI AI — Seed Script ===\n");

    // ── Admin user ──────────────────────────────────────────
    const adminKey = generateAdminKey();
    await pool.query(
      `INSERT INTO admin_users (email, name, role, key_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      ["admin@ovni.ai", "Admin Principal", "superadmin", adminKey.hash],
    );
    console.log("Admin user created:");
    console.log(`  Email: admin@ovni.ai`);
    console.log(`  Key:   ${adminKey.raw}`);
    console.log(`  (Save this key — it will NOT be shown again)\n`);

    // ── Tenant 1: Demo Starter ──────────────────────────────
    const key1 = generateTenantKey();
    const t1 = await pool.query(
      `INSERT INTO tenants (name, slug, anthropic_api_key, plan_id, default_model,
         rpm_limit, tpm_limit, monthly_token_cap)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      ["Demo Starter Co", "demo-starter", config.anthropicApiKey,
       "starter", "claude-haiku-4-5-20251001", 30, 100000, 500000],
    );
    const t1Id = t1.rows[0].id;

    const u1 = await pool.query(
      `INSERT INTO users (tenant_id, email, name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (tenant_id, email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [t1Id, "demo@starter.com", "Demo User"],
    );

    await pool.query(
      `INSERT INTO api_keys (tenant_id, user_id, key_hash, key_prefix, label)
       VALUES ($1, $2, $3, $4, 'Seed key')
       ON CONFLICT DO NOTHING`,
      [t1Id, u1.rows[0].id, key1.hash, key1.prefix],
    );

    // Create billing period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    await pool.query(
      `INSERT INTO billing_periods (tenant_id, period_start, period_end, status)
       VALUES ($1, $2, $3, 'open')
       ON CONFLICT (tenant_id, period_start) DO NOTHING`,
      [t1Id, periodStart, periodEnd],
    );

    console.log("Tenant 1 (Starter) created:");
    console.log(`  Name:  Demo Starter Co`);
    console.log(`  Key:   ${key1.raw}\n`);

    // ── Tenant 2: Demo Pro ──────────────────────────────────
    const key2 = generateTenantKey();
    const t2 = await pool.query(
      `INSERT INTO tenants (name, slug, anthropic_api_key, plan_id, default_model,
         rpm_limit, tpm_limit, monthly_token_cap)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      ["Demo Pro Corp", "demo-pro", config.anthropicApiKey,
       "pro", "claude-sonnet-4-20250514", 60, 400000, 2000000],
    );
    const t2Id = t2.rows[0].id;

    const u2 = await pool.query(
      `INSERT INTO users (tenant_id, email, name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (tenant_id, email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [t2Id, "demo@procorp.com", "Pro User"],
    );

    await pool.query(
      `INSERT INTO api_keys (tenant_id, user_id, key_hash, key_prefix, label)
       VALUES ($1, $2, $3, $4, 'Seed key')
       ON CONFLICT DO NOTHING`,
      [t2Id, u2.rows[0].id, key2.hash, key2.prefix],
    );

    await pool.query(
      `INSERT INTO billing_periods (tenant_id, period_start, period_end, status)
       VALUES ($1, $2, $3, 'open')
       ON CONFLICT (tenant_id, period_start) DO NOTHING`,
      [t2Id, periodStart, periodEnd],
    );

    console.log("Tenant 2 (Pro) created:");
    console.log(`  Name:  Demo Pro Corp`);
    console.log(`  Key:   ${key2.raw}\n`);

    // ── Example curl commands ───────────────────────────────
    console.log("=== Test Commands ===\n");
    console.log(`# Chat (sync):`);
    console.log(`curl -X POST http://localhost:3000/v1/chat \\`);
    console.log(`  -H "Authorization: Bearer ${key1.raw}" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"messages":[{"role":"user","content":"Hola!"}]}'\n`);

    console.log(`# Chat (streaming):`);
    console.log(`curl -X POST http://localhost:3000/v1/chat --no-buffer \\`);
    console.log(`  -H "Authorization: Bearer ${key2.raw}" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"messages":[{"role":"user","content":"Hola!"}],"stream":true}'\n`);

    console.log(`# List tenants (admin):`);
    console.log(`curl http://localhost:3000/admin/tenants \\`);
    console.log(`  -H "Authorization: Bearer ${adminKey.raw}"\n`);

    console.log(`# Plans:`);
    console.log(`curl http://localhost:3000/api/provision/plans\n`);

    console.log("=== Seed complete ===\n");
  } finally {
    await pool.end();
  }
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
