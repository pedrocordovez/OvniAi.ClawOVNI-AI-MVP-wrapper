import { useState, useEffect } from "react";

interface Plan {
  id: string; name: string; monthly_fee_cents: number;
  model: string; monthly_token_cap: number; user_limit: number; rpm_limit: number;
}

interface FormData {
  company_name: string; industry: string; contact_name: string;
  contact_email: string; plan_id: string; card_number: string;
  card_name: string; expiry: string; cvv: string;
  email: string; billing: string; crm: string; hr: string;
  channels: Record<string, boolean>;
  use_cases: Record<string, boolean>;
  tone: string; languages: string[]; agent_name: string;
  company_description: string; key_services: string; faqs: string;
}

const STEPS = [
  { id: "welcome",    label: "Inicio" },
  { id: "company",    label: "Empresa" },
  { id: "contact",    label: "Contacto" },
  { id: "software",   label: "Software" },
  { id: "channels",   label: "Canales" },
  { id: "usecases",   label: "Agentes" },
  { id: "personality", label: "Personalidad" },
  { id: "knowledge",  label: "Conocimiento" },
  { id: "plan",       label: "Plan" },
  { id: "summary",    label: "Resumen" },
  { id: "payment",    label: "Pago" },
  { id: "processing", label: "Activando" },
  { id: "success",    label: "Listo" },
];

const industries = [
  "Tecnologia", "Finanzas", "Salud", "Educacion", "Retail",
  "Legal", "Inmobiliaria", "Marketing", "Logistica", "Otro",
];

const softwareOptions = {
  email:   [{ id: "", label: "Ninguno" }, { id: "gmail", label: "Gmail" }, { id: "outlook", label: "Outlook" }],
  billing: [{ id: "", label: "Ninguno" }, { id: "quickbooks", label: "QuickBooks" }, { id: "xero", label: "Xero" }, { id: "freshbooks", label: "FreshBooks" }],
  crm:     [{ id: "", label: "Ninguno" }, { id: "hubspot", label: "HubSpot" }, { id: "salesforce", label: "Salesforce" }, { id: "zoho", label: "Zoho CRM" }],
  hr:      [{ id: "", label: "Ninguno" }, { id: "bamboohr", label: "BambooHR" }, { id: "gusto", label: "Gusto" }],
};

const channelOptions = [
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "telegram", label: "Telegram", icon: "✈️" },
  { id: "slack",    label: "Slack",    icon: "🔗" },
  { id: "teams",    label: "Teams",    icon: "👥" },
  { id: "webchat",  label: "Web Chat", icon: "🌐" },
];

const useCaseOptions = [
  { id: "customer_support", label: "Atencion al cliente",    icon: "💬", desc: "Responde preguntas y resuelve problemas" },
  { id: "sales_assistant",  label: "Ventas",                 icon: "💰", desc: "Califica leads y agenda demos" },
  { id: "internal_helper",  label: "Asistente interno",      icon: "🏢", desc: "Ayuda a tu equipo con procesos" },
  { id: "scheduling",       label: "Agendamiento",           icon: "📅", desc: "Coordina citas y reuniones" },
  { id: "content_creation", label: "Contenido",              icon: "✍️", desc: "Redacta emails y documentos" },
  { id: "data_analysis",    label: "Analisis",               icon: "📊", desc: "Interpreta datos y reportes" },
  { id: "onboarding",       label: "Onboarding",             icon: "🚀", desc: "Guia a nuevos clientes" },
  { id: "knowledge_base",   label: "FAQ / Base de datos",    icon: "📚", desc: "Responde preguntas frecuentes" },
];

const toneOptions = [
  { id: "profesional", label: "Profesional" },
  { id: "amigable",    label: "Amigable" },
  { id: "tecnico",     label: "Tecnico" },
  { id: "casual",      label: "Casual" },
];

function fmt(n: number) { return `$${(n / 100).toFixed(2)}`; }

export default function App() {
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activationFee, setActivationFee] = useState(29900);
  const [form, setForm] = useState<FormData>({
    company_name: "", industry: "", contact_name: "", contact_email: "",
    plan_id: "pro", card_number: "", card_name: "", expiry: "", cvv: "",
    email: "", billing: "", crm: "", hr: "",
    channels: { webchat: true },
    use_cases: {}, tone: "profesional", languages: ["es"],
    agent_name: "", company_description: "", key_services: "", faqs: "",
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/provision/plans").then(r => r.json())
      .then(d => { setPlans(d.plans); setActivationFee(d.activation_fee_cents); }).catch(() => {});
  }, []);

  const set = (k: keyof FormData, v: string) => setForm({ ...form, [k]: v });
  const toggle = (field: "channels" | "use_cases", id: string) =>
    setForm({ ...form, [field]: { ...form[field], [id]: !form[field][id] } });
  const toggleLang = (l: string) => {
    const langs = form.languages.includes(l) ? form.languages.filter(x => x !== l) : [...form.languages, l];
    setForm({ ...form, languages: langs.length ? langs : ["es"] });
  };

  const plan = plans.find(p => p.id === form.plan_id);
  const total = activationFee + (plan?.monthly_fee_cents ?? 0);
  const useCases = Object.entries(form.use_cases).filter(([,v]) => v).map(([k]) => k);
  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => s - 1);

  const submit = async () => {
    setStep(11); setError("");
    try {
      const res = await fetch("/api/provision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `wiz_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          company_name: form.company_name, industry: form.industry,
          contact_name: form.contact_name, contact_email: form.contact_email,
          plan_id: form.plan_id, card_number: form.card_number,
          card_name: form.card_name, expiry: form.expiry, cvv: form.cvv,
          channels: Object.fromEntries(Object.entries(form.channels).filter(([,v]) => v).map(([k]) => [k, { enabled: true }])),
          software_stack: Object.fromEntries(Object.entries({ email: form.email, billing: form.billing, crm: form.crm, hr: form.hr }).filter(([,v]) => v)),
          agent_config: {
            use_cases: useCases, tone: form.tone, languages: form.languages,
            agent_name: form.agent_name || `Asistente de ${form.company_name}`,
            company_description: form.company_description, key_services: form.key_services, faqs: form.faqs,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) { setResult(data); setStep(12); }
      else { setError(data.message ?? "Error"); setStep(10); }
    } catch { setError("Error de conexion."); setStep(10); }
  };

  // ── Shared components ───────────────────────────────────
  const Btn = ({ onClick, disabled, children, variant = "primary" }: any) => (
    <button onClick={onClick} disabled={disabled}
      className={`px-6 py-3 rounded-xl text-[15px] font-semibold transition-all duration-200 ${
        variant === "primary"
          ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 disabled:opacity-40 disabled:shadow-none disabled:translate-y-0"
          : "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80 border border-white/[0.08]"
      }`}>{children}</button>
  );

  const Input = ({ ...props }: any) => (
    <input {...props} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.06] transition-all" />
  );

  const Select = ({ children, ...props }: any) => (
    <select {...props} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-[15px] text-white appearance-none focus:outline-none focus:border-violet-500/50 transition-all">
      {children}
    </select>
  );

  const Textarea = ({ ...props }: any) => (
    <textarea {...props} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.06] transition-all resize-none" />
  );

  const Label = ({ children }: any) => (
    <label className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-1.5 block">{children}</label>
  );

  const Chip = ({ active, onClick, children }: any) => (
    <button onClick={onClick}
      className={`px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all border ${
        active ? "bg-violet-500/15 border-violet-500/40 text-violet-300" : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white/60"
      }`}>{children}</button>
  );

  const Card = ({ active, onClick, children }: any) => (
    <button onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
        active ? "bg-violet-500/[0.08] border-violet-500/30 shadow-lg shadow-violet-500/5" : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12]"
      }`}>{children}</button>
  );

  const Nav = ({ canBack = true, canNext = true, onNext = next, nextLabel = "Continuar" }: any) => (
    <div className="flex gap-3 pt-2">
      {canBack && <Btn variant="secondary" onClick={prev}>Atras</Btn>}
      <div className="flex-1" />
      <Btn onClick={onNext} disabled={!canNext}>{nextLabel}</Btn>
    </div>
  );

  const Section = ({ title, subtitle, children }: any) => (
    <div className="space-y-6 animate-in">
      <div>
        <h2 className="text-[22px] font-bold text-white tracking-tight">{title}</h2>
        {subtitle && <p className="text-[14px] text-white/40 mt-1.5 leading-relaxed">{subtitle}</p>}
      </div>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-40%] left-[-20%] w-[80%] h-[80%] bg-violet-900/20 rounded-full blur-[128px]" />
        <div className="absolute bottom-[-30%] right-[-10%] w-[60%] h-[60%] bg-indigo-900/15 rounded-full blur-[128px]" />
      </div>

      <div className="relative w-full max-w-[520px]">
        {/* Card */}
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] rounded-3xl overflow-hidden shadow-2xl shadow-black/40">

          {/* Header */}
          <div className="px-8 pt-8 pb-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-[13px] font-black">O</span>
              </div>
              <span className="text-[17px] font-bold text-white tracking-tight">OVNI <span className="text-violet-400">AI</span></span>
            </div>

            {/* Progress */}
            {step < 12 && (
              <div>
                <div className="flex gap-[3px]">
                  {STEPS.slice(0, 12).map((_, i) => (
                    <div key={i} className={`flex-1 h-[3px] rounded-full transition-all duration-500 ${
                      i < step ? "bg-violet-500" : i === step ? "bg-violet-400" : "bg-white/[0.06]"
                    }`} />
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[11px] text-white/20">{STEPS[step].label}</span>
                  <span className="text-[11px] text-white/20">{step + 1}/12</span>
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="px-8 pb-8">

            {/* 0: Welcome */}
            {step === 0 && (
              <div className="text-center space-y-8">
                <div>
                  <h1 className="text-[32px] font-bold text-white tracking-tight leading-tight">
                    Inteligencia artificial<br/>para tu empresa
                  </h1>
                  <p className="text-[15px] text-white/40 mt-3 leading-relaxed max-w-[380px] mx-auto">
                    Un agente AI personalizado conectado a tus canales de comunicacion. Sin infraestructura, sin complicaciones.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {["WhatsApp", "Telegram", "Slack", "Teams", "Web Chat", "API"].map(ch => (
                    <span key={ch} className="px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-[12px] text-white/30">{ch}</span>
                  ))}
                </div>
                <Btn onClick={next}>Comenzar</Btn>
              </div>
            )}

            {/* 1: Company */}
            {step === 1 && (
              <Section title="Tu empresa">
                <div className="space-y-4">
                  <div><Label>Nombre</Label><Input placeholder="Nombre de la empresa" value={form.company_name} onChange={(e: any) => set("company_name", e.target.value)} /></div>
                  <div><Label>Industria</Label>
                    <Select value={form.industry} onChange={(e: any) => set("industry", e.target.value)}>
                      <option value="">Selecciona</option>
                      {industries.map(i => <option key={i} value={i.toLowerCase()}>{i}</option>)}
                    </Select>
                  </div>
                </div>
                <Nav canBack={true} canNext={!!form.company_name && !!form.industry} />
              </Section>
            )}

            {/* 2: Contact */}
            {step === 2 && (
              <Section title="Datos de contacto">
                <div className="space-y-4">
                  <div><Label>Nombre completo</Label><Input placeholder="Tu nombre" value={form.contact_name} onChange={(e: any) => set("contact_name", e.target.value)} /></div>
                  <div><Label>Email corporativo</Label><Input type="email" placeholder="tu@empresa.com" value={form.contact_email} onChange={(e: any) => set("contact_email", e.target.value)} /></div>
                </div>
                <Nav canNext={!!form.contact_name && !!form.contact_email} />
              </Section>
            )}

            {/* 3: Software */}
            {step === 3 && (
              <Section title="Software empresarial" subtitle="Tu agente se conectara a estas herramientas.">
                <div className="space-y-4">
                  {Object.entries(softwareOptions).map(([key, opts]) => (
                    <div key={key}>
                      <Label>{key === "email" ? "Correo" : key === "billing" ? "Facturacion" : key === "crm" ? "CRM" : "RRHH"}</Label>
                      <Select value={(form as any)[key]} onChange={(e: any) => set(key as keyof FormData, e.target.value)}>
                        {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </Select>
                    </div>
                  ))}
                </div>
                <Nav />
              </Section>
            )}

            {/* 4: Channels */}
            {step === 4 && (
              <Section title="Canales" subtitle="Donde estara disponible tu agente.">
                <div className="grid grid-cols-2 gap-2">
                  {channelOptions.map(ch => (
                    <Card key={ch.id} active={form.channels[ch.id]} onClick={() => toggle("channels", ch.id)}>
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{ch.icon}</span>
                        <span className="text-[13px] font-medium text-white/80">{ch.label}</span>
                      </div>
                    </Card>
                  ))}
                </div>
                <Nav />
              </Section>
            )}

            {/* 5: Use Cases */}
            {step === 5 && (
              <Section title="Que hara tu agente" subtitle="Selecciona los casos de uso. Crearemos agentes especializados.">
                <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
                  {useCaseOptions.map(uc => (
                    <Card key={uc.id} active={form.use_cases[uc.id]} onClick={() => toggle("use_cases", uc.id)}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{uc.icon}</span>
                          <span className="text-[12px] font-semibold text-white/80">{uc.label}</span>
                        </div>
                        <p className="text-[11px] text-white/30 leading-snug">{uc.desc}</p>
                      </div>
                    </Card>
                  ))}
                </div>
                <Nav canNext={useCases.length > 0} />
              </Section>
            )}

            {/* 6: Personality */}
            {step === 6 && (
              <Section title="Personalidad">
                <div className="space-y-5">
                  <div><Label>Nombre del agente</Label><Input placeholder={`Ej: Asistente de ${form.company_name}`} value={form.agent_name} onChange={(e: any) => set("agent_name", e.target.value)} /></div>
                  <div>
                    <Label>Tono</Label>
                    <div className="flex flex-wrap gap-2">
                      {toneOptions.map(t => <Chip key={t.id} active={form.tone === t.id} onClick={() => set("tone", t.id)}>{t.label}</Chip>)}
                    </div>
                  </div>
                  <div>
                    <Label>Idiomas</Label>
                    <div className="flex gap-2">
                      {[{id:"es",label:"Espanol"},{id:"en",label:"Ingles"},{id:"pt",label:"Portugues"}].map(l => (
                        <Chip key={l.id} active={form.languages.includes(l.id)} onClick={() => toggleLang(l.id)}>{l.label}</Chip>
                      ))}
                    </div>
                  </div>
                </div>
                <Nav />
              </Section>
            )}

            {/* 7: Knowledge */}
            {step === 7 && (
              <Section title="Conocimiento" subtitle="Mientras mas sepa tu agente, mejor atendera.">
                <div className="space-y-4">
                  <div><Label>Sobre la empresa</Label><Textarea rows={3} placeholder="Describe tu empresa en 2-3 oraciones..." value={form.company_description} onChange={(e: any) => set("company_description", e.target.value)} /></div>
                  <div><Label>Servicios o productos</Label><Textarea rows={2} placeholder="Lista tus servicios principales..." value={form.key_services} onChange={(e: any) => set("key_services", e.target.value)} /></div>
                  <div><Label>Preguntas frecuentes (opcional)</Label><Textarea rows={2} placeholder="P: Cual es el horario? R: Lunes a viernes 8am-6pm..." value={form.faqs} onChange={(e: any) => set("faqs", e.target.value)} /></div>
                </div>
                <Nav />
              </Section>
            )}

            {/* 8: Plan */}
            {step === 8 && (
              <Section title="Elige tu plan">
                <div className="space-y-3">
                  {plans.map(p => (
                    <Card key={p.id} active={form.plan_id === p.id} onClick={() => set("plan_id", p.id)}>
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[15px] font-semibold text-white">{p.name}</span>
                          <p className="text-[12px] text-white/30 mt-0.5">
                            {(p.monthly_token_cap / 1000).toFixed(0)}K tokens · {p.user_limit} usuarios · {p.rpm_limit} RPM
                          </p>
                        </div>
                        <span className="text-[17px] font-bold text-violet-400">{fmt(p.monthly_fee_cents)}<span className="text-[12px] text-white/30 font-normal">/mes</span></span>
                      </div>
                    </Card>
                  ))}
                </div>
                <Nav />
              </Section>
            )}

            {/* 9: Summary */}
            {step === 9 && (
              <Section title="Resumen">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl divide-y divide-white/[0.06]">
                  {[
                    ["Empresa", form.company_name],
                    ["Industria", form.industry],
                    ["Plan", <span className="text-violet-400 font-semibold">{plan?.name}</span>],
                    ["Canales", Object.entries(form.channels).filter(([,v]) => v).map(([k]) => k).join(", ")],
                    ["Agentes", `${useCases.length} casos de uso`],
                    ["Tono", form.tone],
                  ].map(([label, val], i) => (
                    <div key={i} className="flex justify-between px-4 py-3">
                      <span className="text-[13px] text-white/30">{label}</span>
                      <span className="text-[13px] text-white/70">{val}</span>
                    </div>
                  ))}
                  <div className="px-4 py-4">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/30">Primer mes</span><span className="text-white/50">{fmt(plan?.monthly_fee_cents ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-[13px] mt-1">
                      <span className="text-white/30">Activacion</span><span className="text-white/50">{fmt(activationFee)}</span>
                    </div>
                    <div className="flex justify-between mt-3 pt-3 border-t border-white/[0.06]">
                      <span className="text-[15px] font-semibold text-white">Total hoy</span>
                      <span className="text-[20px] font-bold text-violet-400">{fmt(total)}</span>
                    </div>
                  </div>
                </div>
                <Nav nextLabel="Continuar al pago" />
              </Section>
            )}

            {/* 10: Payment */}
            {step === 10 && (
              <Section title="Datos de pago">
                {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-[13px] text-red-400">{error}</div>}
                <div className="space-y-4">
                  <div><Label>Numero de tarjeta</Label><Input placeholder="4111 1111 1111 1111" value={form.card_number} onChange={(e: any) => set("card_number", e.target.value.replace(/\D/g, "").slice(0, 16))} /></div>
                  <div><Label>Nombre en la tarjeta</Label><Input placeholder="Como aparece en la tarjeta" value={form.card_name} onChange={(e: any) => set("card_name", e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Vencimiento</Label><Input placeholder="MM/YY" value={form.expiry} onChange={(e: any) => { let v = e.target.value.replace(/\D/g, "").slice(0, 4); if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2); set("expiry", v); }} /></div>
                    <div><Label>CVV</Label><Input type="password" placeholder="123" value={form.cvv} onChange={(e: any) => set("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
                  </div>
                </div>
                <p className="text-[12px] text-white/20 mt-2">Se cobrara {fmt(total)} USD</p>
                <Nav canNext={!!form.card_number && !!form.card_name && !!form.expiry && !!form.cvv} onNext={submit} nextLabel={`Pagar ${fmt(total)}`} />
              </Section>
            )}

            {/* 11: Processing */}
            {step === 11 && (
              <div className="text-center py-12 space-y-4">
                <div className="w-12 h-12 border-[3px] border-violet-500/20 border-t-violet-500 rounded-full animate-spin mx-auto" />
                <div>
                  <p className="text-[15px] text-white/60">Creando tus agentes AI...</p>
                  <p className="text-[12px] text-white/25 mt-1">Esto puede tomar unos segundos</p>
                </div>
              </div>
            )}

            {/* 12: Success */}
            {step === 12 && result && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h2 className="text-[22px] font-bold text-white">Agentes activados</h2>
                  <p className="text-[13px] text-white/40 mt-1">Tu inteligencia artificial esta lista.</p>
                </div>

                {result.agents?.length > 0 && (
                  <div className="space-y-2">
                    {result.agents.map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                        <div>
                          <span className="text-[13px] font-medium text-white/80">{a.name}</span>
                          <span className="text-[12px] text-white/30 ml-2">{a.role}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-white/[0.03] border border-violet-500/20 rounded-2xl p-5">
                  <p className="text-[11px] text-white/30 uppercase tracking-wider mb-3">Tu API Key</p>
                  <code className="text-violet-400 text-[13px] break-all select-all leading-relaxed block">{result.api_key}</code>
                </div>

                <button onClick={() => navigator.clipboard.writeText(result.api_key)}
                  className="w-full bg-violet-500/10 border border-violet-500/20 text-violet-400 py-3 rounded-xl text-[14px] font-semibold hover:bg-violet-500/15 transition-all">
                  Copiar API Key
                </button>

                <div className="bg-white/[0.02] rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-[12px] text-white/30 font-semibold">Proximos pasos:</p>
                  <p className="text-[12px] text-white/25">1. Conecta tus canales desde el dashboard</p>
                  <p className="text-[12px] text-white/25">2. Prueba tu agente enviando un mensaje</p>
                  <p className="text-[12px] text-white/25">3. Invita a tu equipo</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-white/15 mt-6">OVNI AI · Operado por Ovnicom · Panama</p>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fadeIn 0.3s ease-out; }
      `}</style>
    </div>
  );
}
