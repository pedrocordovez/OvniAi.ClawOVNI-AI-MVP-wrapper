export interface TelegramConfig {
  botToken: string;
}

export interface IncomingTelegram {
  chatId: number;
  text:   string;
  from:   string;
}

export function parseTelegramUpdate(body: Record<string, unknown>): IncomingTelegram | null {
  const message = body.message as Record<string, unknown> | undefined;
  if (!message || !message.text) return null;

  const chat = message.chat as Record<string, unknown>;
  const from = message.from as Record<string, unknown> | undefined;

  return {
    chatId: chat.id as number,
    text:   message.text as string,
    from:   from ? `${from.first_name ?? ""} ${from.last_name ?? ""}`.trim() : "User",
  };
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  botToken: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${errorText}`);
  }
}

export async function setTelegramWebhook(botToken: string, webhookUrl: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set Telegram webhook: ${response.status}`);
  }
}
