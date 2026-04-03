import { config } from "../config.js";

export interface WhatsAppConfig {
  twilioPhoneNumber: string;
}

export interface IncomingWhatsApp {
  from:       string;
  body:       string;
  profileName: string;
}

export function parseWhatsAppWebhook(body: Record<string, unknown>): IncomingWhatsApp {
  return {
    from:        (body.From as string) ?? "",
    body:        (body.Body as string) ?? "",
    profileName: (body.ProfileName as string) ?? "User",
  };
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  channelConfig: WhatsAppConfig,
): Promise<void> {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    console.log(`[WHATSAPP -- mock] To: ${to}, Body: ${body.slice(0, 100)}...`);
    return;
  }

  const { Twilio } = await import("twilio");
  const client = new Twilio(config.twilioAccountSid, config.twilioAuthToken);

  await client.messages.create({
    from: `whatsapp:${channelConfig.twilioPhoneNumber}`,
    to,
    body,
  });
}

// WhatsApp messages via Twilio have a per-message cost
// We apply a 35% markup
export const WHATSAPP_MARKUP = 1.35;
