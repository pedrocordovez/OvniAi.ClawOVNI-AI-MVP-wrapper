import { useState, useEffect, useRef } from "react";

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

const STEPS = ["Inicio","Empresa","Contacto","Software","Canales","Agentes","Personalidad","Conocimiento","Plan","Resumen","Pago","Activando","Listo"];

const industries = ["Tecnologia","Finanzas","Salud","Educacion","Retail","Legal","Inmobiliaria","Marketing","Logistica","Otro"];

const softwareOptions = {
  email:   [{ id: "", label: "Ninguno" },{ id: "gmail", label: "Gmail" },{ id: "outlook", label: "Outlook" }],
  billing: [{ id: "", label: "Ninguno" },{ id: "quickbooks", label: "QuickBooks" },{ id: "xero", label: "Xero" },{ id: "freshbooks", label: "FreshBooks" }],
  crm:     [{ id: "", label: "Ninguno" },{ id: "hubspot", label: "HubSpot" },{ id: "salesforce", label: "Salesforce" },{ id: "zoho", label: "Zoho CRM" }],
  hr:      [{ id: "", label: "Ninguno" },{ id: "bamboohr", label: "BambooHR" },{ id: "gusto", label: "Gusto" }],
};

const channelOptions = [
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "telegram", label: "Telegram", icon: "✈️" },
  { id: "slack",    label: "Slack",    icon: "🔗" },
  { id: "teams",    label: "Teams",    icon: "👥" },
  { id: "webchat",  label: "Web Chat", icon: "🌐" },
];

const useCaseOptions = [
  { id: "customer_support", label: "Atencion al cliente",  icon: "💬", desc: "Responde preguntas y resuelve problemas" },
  { id: "sales_assistant",  label: "Ventas",               icon: "💰", desc: "Califica leads y agenda demos" },
  { id: "internal_helper",  label: "Asistente interno",    icon: "🏢", desc: "Ayuda a tu equipo con procesos" },
  { id: "scheduling",       label: "Agendamiento",         icon: "📅", desc: "Coordina citas y reuniones" },
  { id: "content_creation", label: "Contenido",            icon: "✍️", desc: "Redacta emails y documentos" },
  { id: "data_analysis",    label: "Analisis",             icon: "📊", desc: "Interpreta datos y reportes" },
  { id: "onboarding",       label: "Onboarding",           icon: "🚀", desc: "Guia a nuevos clientes" },
  { id: "knowledge_base",   label: "FAQ",                  icon: "📚", desc: "Responde preguntas frecuentes" },
];

const toneOptions = ["Profesional","Amigable","Tecnico","Casual"];

function fmt(n: number) { return `$${(n / 100).toFixed(2)}`; }

export default function App() {
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activationFee, setActivationFee] = useState(29900);
  const [form, setForm] = useState<FormData>({
    company_name: "", industry: "", contact_name: "", contact_email: "",
    plan_id: "pro", card_number: "", card_name: "", expiry: "", cvv: "",
    email: "", billing: "", crm: "", hr: "",
    channels: { webchat: true }, use_cases: {},
    tone: "profesional", languages: ["es"],
    agent_name: "", company_description: "", key_services: "", faqs: "",
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const stripeRef = useRef<any>(null);
  const cardElementRef = useRef<any>(null);
  const cardDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/provision/plans").then(r => r.json())
      .then(d => {
        setPlans(d.plans);
        setActivationFee(d.activation_fee_cents);
        setStripePublishableKey(d.stripe_publishable_key ?? "");
      }).catch(() => {});
  }, []);

  // Mount Stripe CardElement when payment step is reached
  useEffect(() => {
    if (step !== 10 || !stripePublishableKey) return;
    const w = window as any;
    if (!w.Stripe || cardElementRef.current) return;
    const stripe = w.Stripe(stripePublishableKey);
    stripeRef.current = stripe;
    const elements = stripe.elements();
    const card = elements.create("card", {
      style: { base: { fontSize: "15px", color: "#111827", "::placeholder": { color: "#d1d5db" } } },
      hidePostalCode: true,
    });
    if (cardDivRef.current) { card.mount(cardDivRef.current); cardElementRef.current = card; }
    return () => { card.unmount(); cardElementRef.current = null; stripeRef.current = null; };
  }, [step, stripePublishableKey]);

  const set = (k: keyof FormData, v: string) => setForm({ ...form, [k]: v });
  const toggle = (f: "channels"|"use_cases", id: string) => setForm({ ...form, [f]: { ...form[f], [id]: !form[f][id] } });
  const toggleLang = (l: string) => {
    const ls = form.languages.includes(l) ? form.languages.filter(x => x !== l) : [...form.languages, l];
    setForm({ ...form, languages: ls.length ? ls : ["es"] });
  };
  const plan = plans.find(p => p.id === form.plan_id);
  const total = activationFee + (plan?.monthly_fee_cents ?? 0);
  const ucs = Object.entries(form.use_cases).filter(([,v]) => v).map(([k]) => k);
  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => s - 1);

  const submit = async () => {
    setStep(11); setError("");
    try {
      let paymentIntentId: string | undefined;

      if (stripePublishableKey && stripeRef.current && cardElementRef.current) {
        // Stripe Elements flow: create PaymentIntent then confirm client-side
        const piRes = await fetch("/api/provision/payment-intent", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: form.plan_id, contact_email: form.contact_email }),
        });
        const piData = await piRes.json();
        if (piData.stripe_mode && piData.client_secret) {
          const { paymentIntent, error: stripeError } = await stripeRef.current.confirmCardPayment(
            piData.client_secret,
            { payment_method: { card: cardElementRef.current, billing_details: { name: form.card_name } } },
          );
          if (stripeError) throw new Error(stripeError.message);
          if (paymentIntent?.status !== "succeeded") throw new Error("Pago no completado");
          paymentIntentId = paymentIntent.id;
        }
      }

      const channels = Object.fromEntries(Object.entries(form.channels).filter(([,v]) => v).map(([k]) => [k, { enabled: true }]));
      const software_stack = Object.fromEntries(Object.entries({ email: form.email, billing: form.billing, crm: form.crm, hr: form.hr }).filter(([,v]) => v));
      const agent_config = { use_cases: ucs, tone: form.tone, languages: form.languages,
        agent_name: form.agent_name || `Asistente de ${form.company_name}`,
        company_description: form.company_description, key_services: form.key_services, faqs: form.faqs };

      const res = await fetch("/api/provision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `wiz_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          company_name: form.company_name, industry: form.industry,
          contact_name: form.contact_name, contact_email: form.contact_email,
          plan_id: form.plan_id,
          ...(paymentIntentId
            ? { payment_intent_id: paymentIntentId }
            : { card_number: form.card_number, card_name: form.card_name, expiry: form.expiry, cvv: form.cvv }),
          channels, software_stack, agent_config,
        }),
      });
      const data = await res.json();
      if (res.ok) { setResult(data); setStep(12); }
      else { setError(data.message ?? "Error"); setStep(10); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de pago. Intenta de nuevo.");
      setStep(10);
    }
  };

  // ── Design System ──────────────────────────────────────
  const Btn = ({ onClick, disabled, children, variant = "primary", full = false }: any) => (
    <button onClick={onClick} disabled={disabled}
      className={`${full ? "w-full" : ""} px-6 py-3 rounded-[10px] text-[14px] font-semibold transition-all duration-150 cursor-pointer ${
        variant === "primary"
          ? "bg-black text-white hover:bg-gray-800 active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          : "bg-transparent text-gray-500 hover:text-black border border-gray-200 hover:border-gray-400"
      }`}>{children}</button>
  );

  const Input = (props: any) => (
    <input {...props} className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all" />
  );

  const Select = ({ children, ...props }: any) => (
    <select {...props} className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-3 text-[15px] text-gray-900 appearance-none focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all">
      {children}
    </select>
  );

  const Textarea = (props: any) => (
    <textarea {...props} className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all resize-none" />
  );

  const Label = ({ children }: any) => (
    <label className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">{children}</label>
  );

  const Chip = ({ active, onClick, children }: any) => (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all border ${
        active ? "bg-black text-white border-black" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
      }`}>{children}</button>
  );

  const Card = ({ active, onClick, children }: any) => (
    <button onClick={onClick}
      className={`w-full text-left p-4 rounded-[14px] border-2 transition-all duration-150 ${
        active ? "bg-gray-50 border-black shadow-sm" : "bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm"
      }`}>{children}</button>
  );

  const Nav = ({ canBack = true, canNext = true, onNext = next, nextLabel = "Continuar" }: any) => (
    <div className="flex gap-3 pt-4">
      {canBack && <Btn variant="secondary" onClick={prev}>Atras</Btn>}
      <div className="flex-1" />
      <Btn onClick={onNext} disabled={!canNext}>{nextLabel}</Btn>
    </div>
  );

  const H = ({ children, sub }: any) => (
    <div className="mb-6">
      <h2 className="text-[28px] font-extrabold text-gray-900 tracking-tight">{children}</h2>
      {sub && <p className="text-[14px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
      <div className="w-full max-w-[540px]">

        {/* Logo + Progress */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-8">
            <img src="/logo.png" alt="OVNI AI" className="w-9 h-9 object-contain" />
            <span className="text-[18px] font-bold text-gray-900 tracking-tight">OVNI AI</span>
          </div>

          {step > 0 && step < 12 && (
            <div className="flex gap-1">
              {STEPS.slice(0, 12).map((_, i) => (
                <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-500 ${
                  i < step ? "bg-black" : i === step ? "bg-gray-900" : "bg-gray-200"
                }`} />
              ))}
            </div>
          )}
        </div>

        {/* Card */}
        <div className="bg-white rounded-[20px] border border-gray-200 shadow-sm p-8 animate-in">

          {/* 0: Welcome */}
          {step === 0 && (
            <div className="text-center py-4">
              <h1 className="text-[40px] font-extrabold text-gray-900 tracking-tight leading-[1.1]">
                Tu agente AI.<br/><span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Listo en minutos.</span>
              </h1>
              <p className="text-[16px] text-gray-400 mt-4 max-w-[400px] mx-auto leading-relaxed">
                Conecta inteligencia artificial a WhatsApp, Telegram, y tu sitio web. Sin codigo, sin servidores.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-8">
                {["WhatsApp","Telegram","Slack","Teams","Web Chat","API"].map(ch => (
                  <span key={ch} className="px-3.5 py-1.5 bg-gray-100 rounded-full text-[12px] font-medium text-gray-500">{ch}</span>
                ))}
              </div>
              <div className="mt-10">
                <Btn onClick={next}>Comenzar gratis</Btn>
              </div>
              <p className="text-[12px] text-gray-300 mt-4">Configuracion en 5 minutos. Sin compromisos.</p>
            </div>
          )}

          {/* 1: Company */}
          {step === 1 && (<><H>Tu empresa</H>
            <div className="space-y-4">
              <div><Label>Nombre</Label><Input placeholder="Nombre de la empresa" value={form.company_name} onChange={(e: any) => set("company_name", e.target.value)} /></div>
              <div><Label>Industria</Label>
                <Select value={form.industry} onChange={(e: any) => set("industry", e.target.value)}>
                  <option value="">Selecciona industria</option>
                  {industries.map(i => <option key={i} value={i.toLowerCase()}>{i}</option>)}
                </Select></div>
            </div>
            <Nav canNext={!!form.company_name && !!form.industry} />
          </>)}

          {/* 2: Contact */}
          {step === 2 && (<><H>Contacto</H>
            <div className="space-y-4">
              <div><Label>Nombre completo</Label><Input placeholder="Tu nombre" value={form.contact_name} onChange={(e: any) => set("contact_name", e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" placeholder="tu@empresa.com" value={form.contact_email} onChange={(e: any) => set("contact_email", e.target.value)} /></div>
            </div>
            <Nav canNext={!!form.contact_name && !!form.contact_email} />
          </>)}

          {/* 3: Software */}
          {step === 3 && (<><H sub="Tu agente se conectara a estas herramientas.">Software</H>
            <div className="space-y-4">
              {Object.entries(softwareOptions).map(([key, opts]) => (
                <div key={key}><Label>{key === "email" ? "Correo" : key === "billing" ? "Facturacion" : key === "crm" ? "CRM" : "RRHH"}</Label>
                  <Select value={(form as any)[key]} onChange={(e: any) => set(key as keyof FormData, e.target.value)}>
                    {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select></div>
              ))}
            </div><Nav /></>)}

          {/* 4: Channels */}
          {step === 4 && (<><H sub="Donde estara disponible tu agente.">Canales</H>
            <div className="grid grid-cols-2 gap-3">
              {channelOptions.map(ch => (
                <Card key={ch.id} active={form.channels[ch.id]} onClick={() => toggle("channels", ch.id)}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{ch.icon}</span>
                    <span className="text-[14px] font-semibold text-gray-700">{ch.label}</span>
                  </div>
                </Card>
              ))}
            </div><Nav /></>)}

          {/* 5: Use Cases */}
          {step === 5 && (<><H sub="Crearemos agentes especializados segun tus necesidades.">Que hara tu agente</H>
            <div className="grid grid-cols-2 gap-3 max-h-[340px] overflow-y-auto">
              {useCaseOptions.map(uc => (
                <Card key={uc.id} active={form.use_cases[uc.id]} onClick={() => toggle("use_cases", uc.id)}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2"><span>{uc.icon}</span><span className="text-[13px] font-semibold text-gray-700">{uc.label}</span></div>
                    <p className="text-[11px] text-gray-400 leading-snug">{uc.desc}</p>
                  </div>
                </Card>
              ))}
            </div><Nav canNext={ucs.length > 0} /></>)}

          {/* 6: Personality */}
          {step === 6 && (<><H>Personalidad</H>
            <div className="space-y-5">
              <div><Label>Nombre del agente</Label><Input placeholder={`Ej: Asistente de ${form.company_name}`} value={form.agent_name} onChange={(e: any) => set("agent_name", e.target.value)} /></div>
              <div><Label>Tono</Label>
                <div className="flex flex-wrap gap-2">
                  {toneOptions.map(t => <Chip key={t} active={form.tone === t.toLowerCase()} onClick={() => set("tone", t.toLowerCase())}>{t}</Chip>)}
                </div></div>
              <div><Label>Idiomas</Label>
                <div className="flex gap-2">
                  {[{id:"es",label:"Espanol"},{id:"en",label:"Ingles"},{id:"pt",label:"Portugues"}].map(l => (
                    <Chip key={l.id} active={form.languages.includes(l.id)} onClick={() => toggleLang(l.id)}>{l.label}</Chip>
                  ))}
                </div></div>
            </div><Nav /></>)}

          {/* 7: Knowledge */}
          {step === 7 && (<><H sub="Mientras mas sepa tu agente, mejor atendera.">Conocimiento</H>
            <div className="space-y-4">
              <div><Label>Sobre la empresa</Label><Textarea rows={3} placeholder="Describe tu empresa..." value={form.company_description} onChange={(e: any) => set("company_description", e.target.value)} /></div>
              <div><Label>Servicios</Label><Textarea rows={2} placeholder="Tus servicios principales..." value={form.key_services} onChange={(e: any) => set("key_services", e.target.value)} /></div>
              <div><Label>Preguntas frecuentes</Label><Textarea rows={2} placeholder="P: Horario? R: Lun-Vie 8am-6pm..." value={form.faqs} onChange={(e: any) => set("faqs", e.target.value)} /></div>
            </div><Nav /></>)}

          {/* 8: Plan */}
          {step === 8 && (<><H>Tu plan</H>
            <div className="space-y-3">
              {plans.map(p => (
                <Card key={p.id} active={form.plan_id === p.id} onClick={() => set("plan_id", p.id)}>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[16px] font-bold text-gray-900">{p.name}</span>
                      <p className="text-[12px] text-gray-400 mt-0.5">{(p.monthly_token_cap / 1000).toFixed(0)}K tokens · {p.user_limit} usuarios</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[20px] font-extrabold text-gray-900">{fmt(p.monthly_fee_cents)}</span>
                      <span className="text-[12px] text-gray-400">/mes</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div><Nav /></>)}

          {/* 9: Summary */}
          {step === 9 && (<><H>Resumen</H>
            <div className="rounded-[14px] border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {[["Empresa", form.company_name],["Industria", form.industry],["Plan", plan?.name],
                ["Canales", Object.entries(form.channels).filter(([,v]) => v).map(([k]) => k).join(", ")],
                ["Agentes", `${ucs.length} casos de uso`],["Tono", form.tone],
              ].map(([l,v], i) => (
                <div key={i} className="flex justify-between px-5 py-3">
                  <span className="text-[13px] text-gray-400">{l}</span>
                  <span className="text-[13px] font-medium text-gray-700">{v}</span>
                </div>
              ))}
              <div className="px-5 py-4 bg-gray-50">
                <div className="flex justify-between text-[13px]"><span className="text-gray-400">Primer mes</span><span className="text-gray-600">{fmt(plan?.monthly_fee_cents ?? 0)}</span></div>
                <div className="flex justify-between text-[13px] mt-1"><span className="text-gray-400">Activacion</span><span className="text-gray-600">{fmt(activationFee)}</span></div>
                <div className="flex justify-between mt-3 pt-3 border-t border-gray-200">
                  <span className="text-[15px] font-bold text-gray-900">Total</span>
                  <span className="text-[22px] font-extrabold text-gray-900">{fmt(total)}</span>
                </div>
              </div>
            </div><Nav nextLabel="Ir al pago" /></>)}

          {/* 10: Payment */}
          {step === 10 && (<><H>Pago</H>
            {error && <div className="bg-red-50 border border-red-200 rounded-[10px] px-4 py-3 text-[13px] text-red-600 mb-4">{error}</div>}
            <div className="space-y-4">
              <div><Label>Nombre en la tarjeta</Label><Input placeholder="Como aparece en la tarjeta" value={form.card_name} onChange={(e: any) => set("card_name", e.target.value)} /></div>
              {stripePublishableKey ? (
                <div>
                  <Label>Datos de tarjeta</Label>
                  <div ref={cardDivRef} className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-3.5 min-h-[50px]" />
                  <p className="text-[11px] text-gray-400 mt-1.5">🔒 Pago seguro — tus datos van directamente a Stripe, nunca pasan por nuestros servidores.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div><Label>Numero de tarjeta</Label><Input placeholder="4111 1111 1111 1111" value={form.card_number} onChange={(e: any) => set("card_number", e.target.value.replace(/\D/g, "").slice(0, 16))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Vencimiento</Label><Input placeholder="MM/YY" value={form.expiry} onChange={(e: any) => { let v = e.target.value.replace(/\D/g, "").slice(0, 4); if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2); set("expiry", v); }} /></div>
                    <div><Label>CVV</Label><Input type="password" placeholder="123" value={form.cvv} onChange={(e: any) => set("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
                  </div>
                </div>
              )}
            </div>
            <Nav canNext={stripePublishableKey ? !!form.card_name : !!form.card_number && !!form.card_name && !!form.expiry && !!form.cvv} onNext={submit} nextLabel={`Pagar ${fmt(total)}`} /></>)}

          {/* 11: Processing */}
          {step === 11 && (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-[3px] border-gray-200 border-t-black rounded-full animate-spin mx-auto mb-6" />
              <p className="text-[16px] font-semibold text-gray-900">Creando tus agentes AI</p>
              <p className="text-[13px] text-gray-400 mt-1">Esto toma unos segundos...</p>
            </div>
          )}

          {/* 12: Success */}
          {step === 12 && result && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-[24px] font-extrabold text-gray-900">Listo!</h2>
                <p className="text-[14px] text-gray-400 mt-1">Tus agentes estan activos.</p>
              </div>

              {result.agents?.length > 0 && (
                <div className="space-y-2">
                  {result.agents.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 border border-gray-200 rounded-[12px] px-4 py-3">
                      <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full" />
                      <span className="text-[14px] font-semibold text-gray-700">{a.name}</span>
                      <span className="text-[12px] text-gray-400">{a.role}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-[14px] p-5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Tu API Key</p>
                <code className="text-[13px] text-gray-900 break-all select-all font-mono leading-relaxed block">{result.api_key}</code>
              </div>

              <Btn full onClick={() => navigator.clipboard.writeText(result.api_key)}>Copiar API Key</Btn>

              <div className="rounded-[12px] border border-gray-100 px-5 py-4 space-y-2">
                <p className="text-[12px] font-semibold text-gray-500">Proximos pasos</p>
                {["Conecta tus canales desde el dashboard","Prueba tu agente enviando un mensaje","Invita a tu equipo"].map((s,i) => (
                  <p key={i} className="text-[13px] text-gray-400">{i+1}. {s}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-300 mt-6">OVNI AI · Operado por Ovnicom · Panama</p>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fadeIn 0.25s ease-out; }
      `}</style>
    </div>
  );
}
