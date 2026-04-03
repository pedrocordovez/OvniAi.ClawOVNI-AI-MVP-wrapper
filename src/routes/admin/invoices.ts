import type { FastifyInstance } from "fastify";
import { adminAuth } from "../../middleware/adminAuth.js";
import { closePeriodAndGenerateInvoice } from "../../services/billing.js";
import { sendInvoiceEmail } from "../../services/email.js";
import { generateInvoicePdf } from "../../services/pdfGenerator.js";
import { logAudit } from "../../services/auditLog.js";

export default async function adminInvoiceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", adminAuth);

  // GET /admin/invoices
  app.get("/invoices", async (request) => {
    const query = request.query as { page?: string; limit?: string; status?: string; tenant_id?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, parseInt(query.limit ?? "20", 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.status) { conditions.push(`i.status = $${idx++}`); params.push(query.status); }
    if (query.tenant_id) { conditions.push(`i.tenant_id = $${idx++}`); params.push(query.tenant_id); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    const result = await app.pg.query(
      `SELECT i.*, t.name AS tenant_name, t.slug AS tenant_slug
       FROM invoices i
       JOIN tenants t ON t.id = i.tenant_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params,
    );

    return { invoices: result.rows, pagination: { page, limit } };
  });

  // GET /admin/invoices/:id
  app.get<{ Params: { id: string } }>("/invoices/:id", async (request, reply) => {
    const { id } = request.params;

    const [invoiceResult, itemsResult] = await Promise.all([
      app.pg.query(
        `SELECT i.*, t.name AS tenant_name
         FROM invoices i JOIN tenants t ON t.id = i.tenant_id
         WHERE i.id = $1`,
        [id],
      ),
      app.pg.query(
        `SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at`,
        [id],
      ),
    ]);

    if (!invoiceResult.rowCount) return reply.status(404).send({ error: "Invoice not found" });

    return {
      ...invoiceResult.rows[0],
      line_items: itemsResult.rows,
    };
  });

  // POST /admin/invoices/:id/finalize
  app.post<{ Params: { id: string } }>("/invoices/:id/finalize", async (request, reply) => {
    const { id } = request.params;

    const result = await app.pg.query(
      `UPDATE invoices SET status = 'finalized', finalized_at = NOW()
       WHERE id = $1 AND status = 'draft' RETURNING id`,
      [id],
    );

    if (!result.rowCount) return reply.status(400).send({ error: "Invoice not in draft status" });

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "finalize_invoice",
      entityType: "invoice", entityId: id, ip: request.ip,
    });

    return { status: "finalized" };
  });

  // POST /admin/invoices/:id/send
  app.post<{ Params: { id: string } }>("/invoices/:id/send", async (request, reply) => {
    const { id } = request.params;

    const invoiceResult = await app.pg.query(
      `SELECT i.*, t.name AS tenant_name, bp.period_start, bp.period_end
       FROM invoices i
       JOIN tenants t ON t.id = i.tenant_id
       LEFT JOIN billing_periods bp ON bp.id = i.billing_period_id
       WHERE i.id = $1 AND i.status = 'finalized'`,
      [id],
    );

    if (!invoiceResult.rowCount) return reply.status(400).send({ error: "Invoice not in finalized status" });

    const inv = invoiceResult.rows[0];

    // Find tenant admin email
    const userResult = await app.pg.query(
      `SELECT email, name FROM users WHERE tenant_id = $1 AND role = 'admin' AND active = true LIMIT 1`,
      [inv.tenant_id],
    );

    if (userResult.rowCount && userResult.rowCount > 0) {
      const user = userResult.rows[0];
      const periodLabel = inv.period_start
        ? `${new Date(inv.period_start).toLocaleDateString("es")} - ${new Date(inv.period_end).toLocaleDateString("es")}`
        : "N/A";

      sendInvoiceEmail({
        to:            user.email,
        contactName:   user.name,
        companyName:   inv.tenant_name,
        invoiceNumber: inv.invoice_number,
        totalCents:    inv.total_cents,
        periodLabel,
      }).catch(err => app.log.warn({ err }, "Failed to send invoice email"));
    }

    await app.pg.query(
      `UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [id],
    );

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "send_invoice",
      entityType: "invoice", entityId: id, ip: request.ip,
    });

    return { status: "sent" };
  });

  // POST /admin/invoices/:id/mark-paid
  app.post<{ Params: { id: string } }>("/invoices/:id/mark-paid", async (request, reply) => {
    const { id } = request.params;

    const result = await app.pg.query(
      `UPDATE invoices SET status = 'paid', paid_at = NOW()
       WHERE id = $1 AND status IN ('finalized', 'sent') RETURNING id`,
      [id],
    );

    if (!result.rowCount) return reply.status(400).send({ error: "Invoice cannot be marked as paid" });

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "mark_invoice_paid",
      entityType: "invoice", entityId: id, ip: request.ip,
    });

    return { status: "paid" };
  });

  // POST /admin/invoices/:id/void
  app.post<{ Params: { id: string } }>("/invoices/:id/void", async (request, reply) => {
    const { id } = request.params;

    const result = await app.pg.query(
      `UPDATE invoices SET status = 'void'
       WHERE id = $1 AND status != 'void' RETURNING id`,
      [id],
    );

    if (!result.rowCount) return reply.status(400).send({ error: "Invoice not found or already void" });

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "void_invoice",
      entityType: "invoice", entityId: id, ip: request.ip,
    });

    return { status: "voided" };
  });

  // GET /admin/invoices/:id/pdf
  app.get<{ Params: { id: string } }>("/invoices/:id/pdf", async (request, reply) => {
    const { id } = request.params;

    const [invoiceResult, itemsResult] = await Promise.all([
      app.pg.query(
        `SELECT i.*, t.name AS tenant_name, t.slug, t.plan_id
         FROM invoices i JOIN tenants t ON t.id = i.tenant_id WHERE i.id = $1`,
        [id],
      ),
      app.pg.query(`SELECT * FROM invoice_line_items WHERE invoice_id = $1`, [id]),
    ]);

    if (!invoiceResult.rowCount) return reply.status(404).send({ error: "Invoice not found" });

    const pdf = generateInvoicePdf(
      invoiceResult.rows[0],
      itemsResult.rows,
      invoiceResult.rows[0],
    );

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${invoiceResult.rows[0].invoice_number}.pdf"`)
      .send(pdf);
  });

  // GET /admin/billing/periods
  app.get("/billing/periods", async (request) => {
    const query = request.query as { tenant_id?: string; status?: string };
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.tenant_id) { conditions.push(`bp.tenant_id = $${idx++}`); params.push(query.tenant_id); }
    if (query.status) { conditions.push(`bp.status = $${idx++}`); params.push(query.status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await app.pg.query(
      `SELECT bp.*, t.name AS tenant_name
       FROM billing_periods bp
       JOIN tenants t ON t.id = bp.tenant_id
       ${where}
       ORDER BY bp.period_start DESC
       LIMIT 100`,
      params,
    );

    return { periods: result.rows };
  });

  // POST /admin/billing/close-period
  app.post("/billing/close-period", async (request, reply) => {
    const body = request.body as { period_id: string };
    if (!body.period_id) return reply.status(400).send({ error: "period_id required" });

    const invoiceId = await closePeriodAndGenerateInvoice(app.pg, body.period_id);

    await logAudit(app.pg, {
      adminId: request.admin!.adminId, action: "close_billing_period",
      entityType: "billing_period", entityId: body.period_id, ip: request.ip,
    });

    return { status: "closed", invoice_id: invoiceId };
  });
}
