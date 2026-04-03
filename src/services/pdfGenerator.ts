import PDFDocument from "pdfkit";
import type { InvoiceRow, InvoiceLineItemRow, TenantRow } from "../types.js";

export function generateInvoicePdf(
  invoice: InvoiceRow,
  lineItems: InvoiceLineItemRow[],
  tenant: TenantRow,
): Buffer {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Uint8Array[] = [];

  doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));

  // Header
  doc.fontSize(24).font("Helvetica-Bold").text("OVNI AI", 50, 50);
  doc.fontSize(10).font("Helvetica").text("Operado por Ovnicom", 50, 78);
  doc.moveDown(2);

  // Invoice info
  doc.fontSize(18).font("Helvetica-Bold").text(`Factura ${invoice.invoice_number}`);
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica");
  doc.text(`Fecha: ${invoice.created_at.toISOString().split("T")[0]}`);
  doc.text(`Estado: ${invoice.status}`);
  doc.moveDown(1);

  // Client info
  doc.fontSize(12).font("Helvetica-Bold").text("Cliente");
  doc.fontSize(10).font("Helvetica");
  doc.text(tenant.name);
  doc.text(`Plan: ${tenant.plan_id}`);
  doc.moveDown(1.5);

  // Table header
  const tableTop = doc.y;
  const col1 = 50;
  const col2 = 300;
  const col3 = 400;
  const col4 = 480;

  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Descripcion", col1, tableTop);
  doc.text("Cantidad", col2, tableTop);
  doc.text("Precio Unit.", col3, tableTop);
  doc.text("Total", col4, tableTop);

  doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();

  // Line items
  let y = tableTop + 25;
  doc.font("Helvetica").fontSize(9);

  for (const item of lineItems) {
    doc.text(item.description, col1, y, { width: 240 });
    doc.text(String(item.quantity), col2, y);
    doc.text(`$${(item.unit_price_cents / 100).toFixed(2)}`, col3, y);
    doc.text(`$${(item.total_cents / 100).toFixed(2)}`, col4, y);
    y += 20;
  }

  // Totals
  y += 10;
  doc.moveTo(col3, y).lineTo(550, y).stroke();
  y += 10;

  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Subtotal:", col3, y);
  doc.text(`$${(invoice.subtotal_cents / 100).toFixed(2)}`, col4, y);
  y += 18;

  if (invoice.tax_cents > 0) {
    doc.text("Impuestos:", col3, y);
    doc.text(`$${(invoice.tax_cents / 100).toFixed(2)}`, col4, y);
    y += 18;
  }

  doc.fontSize(12);
  doc.text("Total:", col3, y);
  doc.text(`$${(invoice.total_cents / 100).toFixed(2)}`, col4, y);

  // Footer
  doc.fontSize(8).font("Helvetica").fillColor("#666666");
  doc.text(
    "OVNI AI · Operado por Ovnicom · soporte@ovni.ai",
    50, 750, { align: "center", width: 500 },
  );

  doc.end();

  return Buffer.concat(chunks);
}
