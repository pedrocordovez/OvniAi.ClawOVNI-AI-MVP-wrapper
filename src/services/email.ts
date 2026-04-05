import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { config } from "../config.js";

let ses: SESClient | null = null;
function getSES(): SESClient {
  if (!ses) {
    ses = new SESClient({ region: process.env.AWS_SES_REGION ?? "us-east-1" });
  }
  return ses;
}

async function sendEmail(to: string, subject: string, html: string, from?: string): Promise<void> {
  const sender = from ?? `OVNI AI <${config.smtpFrom}>`;

  if (config.nodeEnv !== "production") {
    console.log(`\n[EMAIL -- dev mode, not sent]`);
    console.log(`  To: ${to} | Subject: ${subject}`);
    console.log("---------------------------------------------\n");
    return;
  }

  const cmd = new SendEmailCommand({
    Source: sender,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" } },
    },
  });

  await getSES().send(cmd);
}

export interface WelcomeEmailData {
  to:           string;
  contactName:  string;
  companyName:  string;
  planName:     string;
  apiKey:       string;
  keyPrefix:    string;
  totalCharged: number;
  monthlyFee:   number;
}

export interface PaymentFailedEmailData {
  to:          string;
  contactName: string;
  companyName: string;
  planName:    string;
  orderId:     string;
  errorMsg:    string;
}

// ─── Send welcome + API key email ────────────────────────────────────────────

export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
  const totalUSD   = (data.totalCharged / 100).toFixed(2);
  const monthlyUSD = (data.monthlyFee / 100).toFixed(2);

  const html = welcomeTemplate({
    contactName: data.contactName,
    companyName: data.companyName,
    planName:    data.planName,
    apiKey:      data.apiKey,
    keyPrefix:   data.keyPrefix,
    totalUSD,
    monthlyUSD,
  });

  await sendEmail(
    data.to,
    `Bienvenido a OVNI AI, ${data.companyName}! Tu cuenta esta activa`,
    html,
  );
}

// ─── Send payment failed notification ────────────────────────────────────────

export async function sendPaymentFailedEmail(data: PaymentFailedEmailData): Promise<void> {
  await sendEmail(
    data.to,
    `No pudimos procesar tu pago — OVNI AI`,
    paymentFailedTemplate(data),
  );
}

// ─── Send internal ops alert ─────────────────────────────────────────────────

export async function sendOpsAlert(data: {
  orderId:     string;
  companyName: string;
  email:       string;
  planId:      string;
  error:       string;
}): Promise<void> {
  await sendEmail(
    config.opsAlertEmail,
    `Provisioning failed: ${data.companyName} (${data.orderId})`,
    `
      <h2>Provisioning failed after successful payment</h2>
      <table style="border-collapse:collapse">
        <tr><td><strong>Order ID</strong></td><td>${data.orderId}</td></tr>
        <tr><td><strong>Company</strong></td><td>${data.companyName}</td></tr>
        <tr><td><strong>Email</strong></td><td>${data.email}</td></tr>
        <tr><td><strong>Plan</strong></td><td>${data.planId}</td></tr>
        <tr><td><strong>Error</strong></td><td style="color:red">${data.error}</td></tr>
      </table>
      <p>Payment was charged. Manually provision or refund.</p>
    `,
    `OVNI AI Alerts <alerts@ovni.ai>`,
  );
}

// ─── Send invoice email ──────────────────────────────────────────────────────

export async function sendInvoiceEmail(data: {
  to:            string;
  contactName:   string;
  companyName:   string;
  invoiceNumber: string;
  totalCents:    number;
  periodLabel:   string;
}): Promise<void> {
  await sendEmail(
    data.to,
    `Tu factura OVNI AI ${data.invoiceNumber} esta lista`,
    `
      <h2>Factura ${data.invoiceNumber}</h2>
      <p>Hola ${data.contactName},</p>
      <p>Tu factura por el periodo ${data.periodLabel} esta lista.</p>
      <p><strong>Total: $${(data.totalCents / 100).toFixed(2)} USD</strong></p>
      <p>Puedes verla en tu portal de cliente.</p>
      <p>— Equipo OVNI AI</p>
    `,
  );
}

// ─── Send credit depleted notification (account suspended) ──────────────────

export async function sendCreditDepletedEmail(data: {
  to: string; contactName: string; companyName: string;
}): Promise<void> {
  await sendEmail(
    data.to,
    `Servicio suspendido — Credito agotado — OVNI AI`,
    `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Credito agotado</title></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:'Helvetica Neue',Arial,sans-serif;color:#e2e8f0">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a12;padding:40px 0">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#0d0f1a;border-radius:16px;border:1px solid rgba(239,68,68,0.2);overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,#0f0b1e,#141428);padding:24px 40px;text-align:center;border-bottom:1px solid rgba(127,119,221,0.15)">
    <div style="font-size:20px;font-weight:700">OVNI <span style="color:#7F77DD">AI</span></div>
  </td></tr>
  <tr><td style="padding:32px 40px;text-align:center">
    <div style="font-size:32px;margin-bottom:16px">&#9888;</div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f1f5f9">Tu servicio ha sido suspendido</h1>
    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6">
      Hola ${data.contactName}, el credito de API de <strong style="color:#c4b5fd">${data.companyName}</strong> se ha agotado
      y tu servicio de inteligencia artificial ha sido suspendido temporalmente.
    </p>
  </td></tr>
  <tr><td style="padding:0 40px 24px">
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:16px 20px;font-size:13px;color:#f87171">
      <strong>Que significa esto:</strong><br>
      - Tu agente AI no podra responder mensajes<br>
      - Las llamadas a la API retornaran error 402<br>
      - Tus datos y configuracion estan seguros
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 28px">
    <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:16px 20px;font-size:13px;color:#4ade80">
      <strong>Como reactivar:</strong><br>
      1. Ingresa a tu portal: <a href="https://new.ovni.ai/portal-app/" style="color:#7F77DD">new.ovni.ai/portal-app</a><br>
      2. Recarga tu credito de API<br>
      3. Tu servicio se reactivara automaticamente<br><br>
      <em>Tip: Activa la recarga automatica para que esto no vuelva a pasar.</em>
    </div>
  </td></tr>
  <tr><td style="background:#080810;padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)">
    <p style="margin:0;font-size:11px;color:#334155">Necesitas ayuda? soporte@ovni.ai</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
  );
}

// ─── Send credit low warning ────────────────────────────────────────────────

export async function sendCreditLowEmail(data: {
  to: string; contactName: string; companyName: string;
  balanceCents: number; thresholdCents: number;
}): Promise<void> {
  const balance = (data.balanceCents / 100).toFixed(2);
  await sendEmail(
    data.to,
    `Credito bajo — $${balance} restante — OVNI AI`,
    `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Credito bajo</title></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:'Helvetica Neue',Arial,sans-serif;color:#e2e8f0">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a12;padding:40px 0">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#0d0f1a;border-radius:16px;border:1px solid rgba(234,179,8,0.2);overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,#0f0b1e,#141428);padding:24px 40px;text-align:center;border-bottom:1px solid rgba(127,119,221,0.15)">
    <div style="font-size:20px;font-weight:700">OVNI <span style="color:#7F77DD">AI</span></div>
  </td></tr>
  <tr><td style="padding:32px 40px;text-align:center">
    <div style="font-size:32px;margin-bottom:16px">&#9888;</div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f1f5f9">Tu credito esta bajo</h1>
    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6">
      Hola ${data.contactName}, el credito de API de <strong style="color:#c4b5fd">${data.companyName}</strong>
      esta por agotarse.
    </p>
  </td></tr>
  <tr><td style="padding:0 40px 24px;text-align:center">
    <div style="background:#080810;border:1px solid rgba(234,179,8,0.25);border-radius:12px;padding:20px;display:inline-block">
      <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Balance actual</div>
      <div style="font-size:28px;font-weight:700;color:#eab308">$${balance} USD</div>
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 28px">
    <div style="background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.2);border-radius:10px;padding:16px 20px;font-size:13px;color:#eab308">
      Si tu credito llega a $0, tu servicio se suspenderah automaticamente.<br><br>
      <strong>Recomendacion:</strong> Activa la recarga automatica desde tu portal para evitar interrupciones.
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 28px;text-align:center">
    <a href="https://new.ovni.ai/portal-app/" style="display:inline-block;background:#7F77DD;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600">Recargar credito</a>
  </td></tr>
  <tr><td style="background:#080810;padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)">
    <p style="margin:0;font-size:11px;color:#334155">Necesitas ayuda? soporte@ovni.ai</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
  );
}

// ─── HTML Templates ──────────────────────────────────────────────────────────

function welcomeTemplate(d: {
  contactName: string; companyName: string; planName: string;
  apiKey: string; keyPrefix: string; totalUSD: string; monthlyUSD: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bienvenido a OVNI AI</title></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:'Helvetica Neue',Arial,sans-serif;color:#e2e8f0">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a12;padding:40px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#0d0f1a;border-radius:16px;border:1px solid rgba(127,119,221,0.2);overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,#0f0b1e,#141428);padding:32px 40px;text-align:center;border-bottom:1px solid rgba(127,119,221,0.15)">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px">OVNI <span style="color:#7F77DD">AI</span></div>
  </td></tr>
  <tr><td style="padding:36px 40px 24px;text-align:center">
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#f1f5f9">Tu cuenta esta activa, ${d.contactName}!</h1>
    <p style="margin:0;font-size:15px;color:#64748b;line-height:1.6">
      <strong style="color:#c4b5fd">${d.companyName}</strong> ya tiene acceso a Claude AI a traves de OVNI AI. Plan <strong>${d.planName}</strong>.
    </p>
  </td></tr>
  <tr><td style="padding:0 40px 28px">
    <div style="background:#080810;border:1px solid rgba(127,119,221,0.25);border-radius:12px;padding:20px 24px">
      <div style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Tu API Key — guardala ahora</div>
      <div style="background:#000;border-radius:8px;padding:14px 16px;font-family:'Courier New',monospace;font-size:13px;color:#c4b5fd;word-break:break-all;letter-spacing:0.5px;margin-bottom:12px">${d.apiKey}</div>
      <div style="font-size:12px;color:#ef4444;font-weight:500">Este es el unico momento en que se mostrara tu API key completa.</div>
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 28px">
    <div style="font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Primer request en 30 segundos</div>
    <div style="background:#080810;border-radius:8px;padding:16px;font-family:'Courier New',monospace;font-size:12px;color:#64748b;line-height:1.8">
      <span style="color:#475569">curl</span> -X POST https://new.ovni.ai/v1/chat \\<br>
      &nbsp;&nbsp;-H <span style="color:#9FE1CB">"Authorization: Bearer ${d.keyPrefix}..."</span> \\<br>
      &nbsp;&nbsp;-H <span style="color:#9FE1CB">"Content-Type: application/json"</span> \\<br>
      &nbsp;&nbsp;-d <span style="color:#9FE1CB">'{"messages":[{"role":"user","content":"Hola"}]}'</span>
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 36px">
    <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:20px">
      <div style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Confirmacion de pago</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">
        <tr><td style="color:#64748b;padding-bottom:6px">Plan ${d.planName} — primer mes</td><td align="right" style="color:#94a3b8;padding-bottom:6px">incluido</td></tr>
        <tr><td style="color:#64748b;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06)">Activacion unica</td><td align="right" style="color:#94a3b8;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06)">$299.00</td></tr>
        <tr><td style="color:#e2e8f0;padding-top:10px;font-weight:600">Total cobrado</td><td align="right" style="color:#c4b5fd;padding-top:10px;font-weight:700;font-size:15px">$${d.totalUSD} USD</td></tr>
      </table>
      <div style="margin-top:10px;font-size:11px;color:#334155">Proximo cobro: $${d.monthlyUSD}/mes</div>
    </div>
  </td></tr>
  <tr><td style="background:#080810;padding:20px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)">
    <p style="margin:0;font-size:11px;color:#334155;line-height:1.8">OVNI AI &middot; Operado por Ovnicom<br>Preguntas? soporte@ovni.ai</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function paymentFailedTemplate(d: {
  contactName: string; companyName: string;
  planName: string; orderId: string; errorMsg: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Problema con tu pago</title></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:'Helvetica Neue',Arial,sans-serif;color:#e2e8f0">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a12;padding:40px 0">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#0d0f1a;border-radius:16px;border:1px solid rgba(239,68,68,0.2);overflow:hidden">
  <tr><td style="padding:32px 40px;text-align:center">
    <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#f1f5f9">No pudimos procesar tu pago</h1>
    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6">
      Hola ${d.contactName}, intentamos activar tu cuenta <strong style="color:#c4b5fd">${d.companyName}</strong>
      en el Plan ${d.planName}, pero el pago no fue aprobado.
    </p>
  </td></tr>
  <tr><td style="padding:0 40px 28px">
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:16px 20px;font-size:13px;color:#f87171">
      Motivo: ${d.errorMsg}
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 32px;text-align:center">
    <p style="margin:14px 0 0;font-size:11px;color:#334155">Referencia: ${d.orderId}</p>
  </td></tr>
  <tr><td style="background:#080810;padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)">
    <p style="margin:0;font-size:11px;color:#334155">Necesitas ayuda? soporte@ovni.ai</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
