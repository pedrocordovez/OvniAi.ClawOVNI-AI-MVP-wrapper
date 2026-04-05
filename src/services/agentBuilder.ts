/**
 * Agent Builder — generates a personalized system prompt and agent config
 * based on the client's onboarding answers (industry, software stack, channels).
 */

export interface AgentProfile {
  systemPrompt: string;
  agentName:    string;
  skills:       string[];
}

interface OnboardingData {
  companyName:    string;
  industry:       string;
  contactName:    string;
  planId:         string;
  channels?:      Record<string, unknown>;
  softwareStack?: Record<string, unknown>;
}

const INDUSTRY_CONTEXT: Record<string, string> = {
  tecnologia:   "empresa de tecnologia. Ayuda con soporte tecnico, documentacion, onboarding de clientes, y respuestas sobre productos de software.",
  finanzas:     "empresa del sector financiero. Ayuda con consultas sobre servicios financieros, regulaciones, atencion al cliente, y analisis de datos.",
  salud:        "empresa del sector salud. Ayuda con informacion de servicios medicos, citas, preguntas frecuentes de pacientes, y coordinacion interna. Nunca des diagnosticos medicos.",
  educacion:    "institucion educativa. Ayuda con informacion academica, admisiones, soporte a estudiantes, y material de estudio.",
  retail:       "empresa de retail/comercio. Ayuda con catalogo de productos, atencion al cliente, seguimiento de pedidos, y recomendaciones de compra.",
  legal:        "firma legal. Ayuda con consultas generales de servicios legales, agendamiento de citas, y organizacion de documentos. Nunca des asesoramiento legal especifico.",
  inmobiliaria: "empresa inmobiliaria. Ayuda con informacion de propiedades, agendamiento de visitas, consultas de precios, y seguimiento de clientes.",
  marketing:    "agencia de marketing. Ayuda con brainstorming creativo, copywriting, analisis de campanas, y coordinacion de proyectos.",
  logistica:    "empresa de logistica. Ayuda con tracking de envios, coordinacion de entregas, consultas de clientes, y optimizacion de rutas.",
  otro:         "empresa. Ayuda con atencion al cliente, consultas internas, y tareas de productividad.",
};

const SOFTWARE_DESCRIPTIONS: Record<string, string> = {
  gmail:       "Gmail para correo electronico",
  outlook:     "Microsoft Outlook para correo electronico",
  quickbooks:  "QuickBooks para facturacion y contabilidad",
  xero:        "Xero para facturacion y contabilidad",
  freshbooks:  "FreshBooks para facturacion",
  hubspot:     "HubSpot como CRM",
  salesforce:  "Salesforce como CRM",
  zoho:        "Zoho CRM",
  bamboohr:    "BambooHR para recursos humanos",
  gusto:       "Gusto para recursos humanos y nomina",
};

const CHANNEL_INSTRUCTIONS: Record<string, string> = {
  whatsapp:  "Cuando respondas por WhatsApp, se conciso (max 300 palabras). Usa formato simple sin markdown complejo.",
  telegram:  "Cuando respondas por Telegram, puedes usar formato Markdown. Se claro y directo.",
  webchat:   "Cuando respondas por Web Chat, se amigable y conversacional. Puedes usar listas y formato.",
  slack:     "Cuando respondas por Slack, usa formato de Slack (bold con *, listas con -).",
  teams:     "Cuando respondas por Microsoft Teams, usa formato compatible.",
};

export function buildAgentProfile(data: OnboardingData): AgentProfile {
  const industry = data.industry.toLowerCase();
  const industryContext = INDUSTRY_CONTEXT[industry] ?? INDUSTRY_CONTEXT.otro;

  // Build software context
  const softwareList: string[] = [];
  const skills: string[] = [];
  if (data.softwareStack) {
    for (const [category, tool] of Object.entries(data.softwareStack)) {
      if (!tool || typeof tool !== "string") continue;
      const desc = SOFTWARE_DESCRIPTIONS[tool];
      if (desc) {
        softwareList.push(desc);
        skills.push(tool);
      }
    }
  }

  // Build channel instructions
  const channelParts: string[] = [];
  if (data.channels) {
    for (const [ch, active] of Object.entries(data.channels)) {
      if (!active) continue;
      const instruction = CHANNEL_INSTRUCTIONS[ch];
      if (instruction) channelParts.push(instruction);
    }
  }

  // Agent name
  const agentName = `Asistente IA de ${data.companyName}`;

  // Build system prompt
  const sections: string[] = [];

  sections.push(`Eres el asistente de inteligencia artificial de ${data.companyName}, una ${industryContext}`);
  sections.push(`Tu nombre es "${agentName}". Responde siempre en espanol a menos que el usuario te escriba en otro idioma.`);

  sections.push("\nReglas importantes:");
  sections.push("- Se profesional, amable y eficiente.");
  sections.push("- Si no sabes algo, dilo honestamente. No inventes informacion.");
  sections.push("- Protege la informacion confidencial de la empresa y sus clientes.");
  sections.push("- Si te piden algo fuera de tu alcance, sugiere contactar al equipo humano.");

  if (softwareList.length > 0) {
    sections.push(`\nLa empresa usa las siguientes herramientas: ${softwareList.join(", ")}. Cuando sea relevante, referencia estas herramientas en tus respuestas y sugiere como usarlas para resolver problemas.`);
  }

  if (channelParts.length > 0) {
    sections.push("\nInstrucciones por canal de comunicacion:");
    for (const part of channelParts) {
      sections.push(`- ${part}`);
    }
  }

  // Industry-specific additions
  if (industry === "salud") {
    sections.push("\nADVERTENCIA: Nunca des diagnosticos medicos, recetes medicamentos, ni interpretes resultados de laboratorio. Siempre recomienda consultar con un profesional de salud.");
  }
  if (industry === "legal") {
    sections.push("\nADVERTENCIA: Nunca des asesoramiento legal especifico. Siempre recomienda consultar con un abogado para casos particulares.");
  }
  if (industry === "finanzas") {
    sections.push("\nADVERTENCIA: Nunca des consejos de inversion especificos ni manejes informacion financiera sensible directamente.");
  }

  return {
    systemPrompt: sections.join("\n"),
    agentName,
    skills,
  };
}
