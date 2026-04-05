/**
 * Agent Builder — generates personalized agent(s) based on onboarding answers.
 * Determines if the client needs 1 general agent or multiple specialized sub-agents.
 */

export interface AgentDefinition {
  name:         string;
  role:         string;
  systemPrompt: string;
  skills:       string[];
}

export interface AgentProfile {
  agents:       AgentDefinition[];
  systemPrompt: string;  // combined prompt for the main instance
  skills:       string[];
}

export interface AgentConfig {
  use_cases:           string[];
  tone:                string;
  languages:           string[];
  agent_name:          string;
  company_description: string;
  key_services:        string;
  faqs:                string;
}

interface OnboardingData {
  companyName:    string;
  industry:       string;
  contactName:    string;
  planId:         string;
  channels?:      Record<string, unknown>;
  softwareStack?: Record<string, unknown>;
  agentConfig?:   AgentConfig;
}

// ─── Use case groupings for sub-agent determination ─────────────────────────

const EXTERNAL_FACING = ["customer_support", "sales_assistant", "onboarding", "knowledge_base"];
const INTERNAL_FACING = ["internal_helper", "data_analysis", "content_creation"];
const SCHEDULING      = ["scheduling"];

// ─── Industry context ───────────────────────────────────────────────────────

const INDUSTRY_CONTEXT: Record<string, string> = {
  tecnologia:   "empresa de tecnologia",
  finanzas:     "empresa del sector financiero",
  salud:        "empresa del sector salud",
  educacion:    "institucion educativa",
  retail:       "empresa de retail y comercio",
  legal:        "firma legal",
  inmobiliaria: "empresa inmobiliaria",
  marketing:    "agencia de marketing",
  logistica:    "empresa de logistica",
  otro:         "empresa",
};

const INDUSTRY_WARNINGS: Record<string, string> = {
  salud: "ADVERTENCIA: Nunca des diagnosticos medicos, recetes medicamentos, ni interpretes resultados de laboratorio. Siempre recomienda consultar con un profesional de salud.",
  legal: "ADVERTENCIA: Nunca des asesoramiento legal especifico. Siempre recomienda consultar con un abogado para casos particulares.",
  finanzas: "ADVERTENCIA: Nunca des consejos de inversion especificos ni manejes informacion financiera sensible directamente.",
};

const TONE_INSTRUCTIONS: Record<string, string> = {
  profesional: "Usa un tono profesional y formal. Se preciso y respetuoso.",
  amigable:    "Usa un tono amigable y cercano. Se accesible y calido, pero manteniendote profesional.",
  tecnico:     "Usa un tono tecnico y detallado. Se preciso con terminologia y datos.",
  casual:      "Usa un tono casual y conversacional. Se natural y relajado.",
};

const SOFTWARE_NAMES: Record<string, string> = {
  gmail: "Gmail", outlook: "Microsoft Outlook", quickbooks: "QuickBooks",
  xero: "Xero", freshbooks: "FreshBooks", hubspot: "HubSpot",
  salesforce: "Salesforce", zoho: "Zoho CRM", bamboohr: "BambooHR", gusto: "Gusto",
};

const USE_CASE_DESCRIPTIONS: Record<string, string> = {
  customer_support: "Atencion al cliente: responde preguntas, resuelve problemas, gestiona quejas",
  sales_assistant:  "Asistente de ventas: califica leads, responde consultas de productos, agenda demos",
  internal_helper:  "Asistente interno: ayuda a empleados con procesos y documentacion",
  scheduling:       "Agendamiento: coordina citas, reuniones, y disponibilidad",
  content_creation: "Creacion de contenido: redacta emails, propuestas, posts, documentos",
  data_analysis:    "Analisis de datos: interpreta reportes, resume informacion, genera insights",
  onboarding:       "Onboarding: guia nuevos clientes, explica servicios, configura cuentas",
  knowledge_base:   "Base de conocimiento: responde preguntas frecuentes usando info de la empresa",
};

// ─── Determine sub-agents ───────────────────────────────────────────────────

function determineAgents(data: OnboardingData): { needsMultiple: boolean; groups: Array<{ name: string; role: string; useCases: string[] }> } {
  const useCases = data.agentConfig?.use_cases ?? [];
  if (useCases.length === 0) return { needsMultiple: false, groups: [] };

  const hasExternal = useCases.some(uc => EXTERNAL_FACING.includes(uc));
  const hasInternal = useCases.some(uc => INTERNAL_FACING.includes(uc));
  const hasScheduling = useCases.some(uc => SCHEDULING.includes(uc));

  const companyName = data.companyName;
  const agentName = data.agentConfig?.agent_name || `Asistente de ${companyName}`;

  // Single agent if only one group or very few use cases
  if (useCases.length <= 2 || (!hasExternal && !hasInternal)) {
    return { needsMultiple: false, groups: [{ name: agentName, role: "Agente general", useCases }] };
  }

  // Multiple agents if both external and internal use cases
  const groups: Array<{ name: string; role: string; useCases: string[] }> = [];

  if (hasExternal) {
    const externalCases = useCases.filter(uc => EXTERNAL_FACING.includes(uc));
    if (hasScheduling) externalCases.push(...useCases.filter(uc => SCHEDULING.includes(uc)));
    groups.push({
      name: `${agentName} — Clientes`,
      role: "Atencion al cliente y ventas",
      useCases: externalCases,
    });
  }

  if (hasInternal) {
    const internalCases = useCases.filter(uc => INTERNAL_FACING.includes(uc));
    if (!hasExternal && hasScheduling) internalCases.push(...useCases.filter(uc => SCHEDULING.includes(uc)));
    groups.push({
      name: `${agentName} — Equipo`,
      role: "Asistente interno del equipo",
      useCases: internalCases,
    });
  }

  return { needsMultiple: groups.length > 1, groups };
}

// ─── Build system prompt for an agent ───────────────────────────────────────

function buildPromptForAgent(
  data: OnboardingData,
  agentName: string,
  role: string,
  useCases: string[],
): string {
  const cfg = data.agentConfig;
  const industry = data.industry.toLowerCase();
  const industryLabel = INDUSTRY_CONTEXT[industry] ?? INDUSTRY_CONTEXT.otro;
  const sections: string[] = [];

  // Identity
  sections.push(`Eres "${agentName}", el asistente de inteligencia artificial de ${data.companyName}, una ${industryLabel}.`);
  sections.push(`Tu rol principal: ${role}.`);

  // Company description
  if (cfg?.company_description) {
    sections.push(`\nSobre la empresa: ${cfg.company_description}`);
  }

  // Services/products
  if (cfg?.key_services) {
    sections.push(`\nServicios y productos principales: ${cfg.key_services}`);
  }

  // FAQs
  if (cfg?.faqs) {
    sections.push(`\nPreguntas frecuentes y respuestas:\n${cfg.faqs}`);
  }

  // Use cases
  if (useCases.length > 0) {
    sections.push("\nTus capacidades principales:");
    for (const uc of useCases) {
      const desc = USE_CASE_DESCRIPTIONS[uc];
      if (desc) sections.push(`- ${desc}`);
    }
  }

  // Tone
  const tone = TONE_INSTRUCTIONS[cfg?.tone ?? "profesional"] ?? TONE_INSTRUCTIONS.profesional;
  sections.push(`\nEstilo de comunicacion: ${tone}`);

  // Languages
  const langs = cfg?.languages ?? ["es"];
  if (langs.length === 1 && langs[0] === "es") {
    sections.push("Responde siempre en espanol a menos que el usuario te escriba en otro idioma.");
  } else if (langs.includes("es") && langs.includes("en")) {
    sections.push("Eres bilingue. Responde en el idioma en que te escriban (espanol o ingles).");
  } else {
    sections.push(`Idiomas soportados: ${langs.join(", ")}. Responde en el idioma del usuario.`);
  }

  // Software stack
  const softwareList: string[] = [];
  if (data.softwareStack) {
    for (const [, tool] of Object.entries(data.softwareStack)) {
      if (tool && typeof tool === "string" && SOFTWARE_NAMES[tool]) {
        softwareList.push(SOFTWARE_NAMES[tool]);
      }
    }
  }
  if (softwareList.length > 0) {
    sections.push(`\nLa empresa usa: ${softwareList.join(", ")}. Referencia estas herramientas cuando sea relevante.`);
  }

  // Rules
  sections.push("\nReglas importantes:");
  sections.push("- Se profesional, amable y eficiente.");
  sections.push("- Si no sabes algo, dilo honestamente. No inventes informacion.");
  sections.push("- Protege la informacion confidencial de la empresa y sus clientes.");
  sections.push("- Si te piden algo fuera de tu alcance, sugiere contactar al equipo humano.");

  // Industry warnings
  const warning = INDUSTRY_WARNINGS[industry];
  if (warning) sections.push(`\n${warning}`);

  return sections.join("\n");
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function buildAgentProfile(data: OnboardingData): AgentProfile {
  const { needsMultiple, groups } = determineAgents(data);
  const skills: string[] = [];

  if (data.softwareStack) {
    for (const [, tool] of Object.entries(data.softwareStack)) {
      if (tool && typeof tool === "string") skills.push(tool);
    }
  }

  if (!needsMultiple || groups.length <= 1) {
    // Single agent
    const group = groups[0] ?? {
      name: data.agentConfig?.agent_name || `Asistente de ${data.companyName}`,
      role: "Agente general",
      useCases: data.agentConfig?.use_cases ?? [],
    };
    const systemPrompt = buildPromptForAgent(data, group.name, group.role, group.useCases);

    return {
      agents: [{ name: group.name, role: group.role, systemPrompt, skills }],
      systemPrompt,
      skills,
    };
  }

  // Multiple sub-agents — build a combined prompt with routing instructions
  const agents: AgentDefinition[] = groups.map(g => ({
    name:         g.name,
    role:         g.role,
    systemPrompt: buildPromptForAgent(data, g.name, g.role, g.useCases),
    skills,
  }));

  // The main system prompt includes routing logic
  const agentList = agents.map((a, i) => `${i + 1}. "${a.name}" — ${a.role}`).join("\n");
  const combinedPrompt = `Eres el sistema de agentes AI de ${data.companyName}. Tienes ${agents.length} agentes especializados:\n\n${agentList}\n\n` +
    `Cuando recibes un mensaje, determina cual agente es el mas apropiado para responder segun el contexto:\n` +
    `- Si el mensaje es de un cliente externo (preguntas sobre servicios, soporte, ventas) → usa el agente de Clientes\n` +
    `- Si el mensaje es de un empleado interno (procesos, documentacion, analisis) → usa el agente de Equipo\n\n` +
    `Responde siempre como el agente apropiado, usando su nombre y tono.\n\n` +
    `--- AGENTE 1 ---\n${agents[0].systemPrompt}\n\n--- AGENTE 2 ---\n${agents[1]?.systemPrompt ?? ""}`;

  return { agents, systemPrompt: combinedPrompt, skills };
}
