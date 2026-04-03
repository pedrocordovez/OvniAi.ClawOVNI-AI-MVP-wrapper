import { useState, useEffect } from "react";

interface Plan {
  id: string; name: string; monthly_fee_cents: number;
  model: string; monthly_token_cap: number; user_limit: number; rpm_limit: number;
}

interface FormData {
  company_name: string; industry: string; contact_name: string;
  contact_email: string; plan_id: string; card_number: string;
  card_name: string; expiry: string; cvv: string;
  // Software stack
  email: string; billing: string; crm: string; hr: string;
  // Channels
  channels: Record<string, boolean>;
}

const STEPS = [
  "Bienvenido", "Empresa", "Contacto", "Software", "Canales",
  "Plan", "Resumen", "Pago", "Procesando", "Listo",
];

const industries = [
  "Tecnologia", "Finanzas", "Salud", "Educacion", "Retail",
  "Legal", "Inmobiliaria", "Marketing", "Logistica", "Otro",
];

const softwareOptions = {
  email:    [{ id: "", label: "Ninguno" }, { id: "gmail", label: "Gmail" }, { id: "outlook", label: "Outlook" }],
  billing:  [{ id: "", label: "Ninguno" }, { id: "quickbooks", label: "QuickBooks" }, { id: "xero", label: "Xero" }, { id: "freshbooks", label: "FreshBooks" }],
  crm:      [{ id: "", label: "Ninguno" }, { id: "hubspot", label: "HubSpot" }, { id: "salesforce", label: "Salesforce" }, { id: "zoho", label: "Zoho CRM" }],
  hr:       [{ id: "", label: "Ninguno" }, { id: "bamboohr", label: "BambooHR" }, { id: "gusto", label: "Gusto" }],
};

const channelOptions = [
  { id: "whatsapp", label: "WhatsApp", desc: "Conecta via numero de telefono" },
  { id: "telegram", label: "Telegram", desc: "Bot de Telegram para tu equipo" },
  { id: "slack",    label: "Slack",    desc: "Integracion con tu workspace" },
  { id: "teams",    label: "Microsoft Teams", desc: "Bot para Teams" },
  { id: "webchat",  label: "Web Chat", desc: "Widget para tu sitio web" },
];

function fmtCents(n: number) { return `$${(n / 100).toFixed(2)}`; }

export default function App() {
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activationFee, setActivationFee] = useState(29900);
  const [form, setForm] = useState<FormData>({
    company_name: "", industry: "", contact_name: "",
    contact_email: "", plan_id: "pro", card_number: "",
    card_name: "", expiry: "", cvv: "",
    email: "", billing: "", crm: "", hr: "",
    channels: { webchat: true },
  });
  const [result, setResult] = useState<{ api_key: string; tenant_id: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/provision/plans")
      .then(r => r.json())
      .then(d => { setPlans(d.plans); setActivationFee(d.activation_fee_cents); })
      .catch(() => {});
  }, []);

  const set = (k: keyof FormData, v: string) => setForm({ ...form, [k]: v });
  const toggleChannel = (ch: string) => setForm({
    ...form, channels: { ...form.channels, [ch]: !form.channels[ch] },
  });
  const selectedPlan = plans.find(p => p.id === form.plan_id);
  const total = activationFee + (selectedPlan?.monthly_fee_cents ?? 0);

  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => s - 1);

  const submit = async () => {
    setStep(8); // Processing
    setError("");

    try {
      const idempotencyKey = `wiz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const activeChannels = Object.entries(form.channels)
        .filter(([, v]) => v)
        .reduce((acc, [k]) => ({ ...acc, [k]: { enabled: true } }), {});
      const softwareStack: Record<string, string> = {};
      if (form.email) softwareStack.email = form.email;
      if (form.billing) softwareStack.billing = form.billing;
      if (form.crm) softwareStack.crm = form.crm;
      if (form.hr) softwareStack.hr = form.hr;

      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          company_name: form.company_name,
          industry: form.industry,
          contact_name: form.contact_name,
          contact_email: form.contact_email,
          plan_id: form.plan_id,
          card_number: form.card_number,
          card_name: form.card_name,
          expiry: form.expiry,
          cvv: form.cvv,
          channels: activeChannels,
          software_stack: softwareStack,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult({ api_key: data.api_key, tenant_id: data.tenant_id });
        setStep(9); // Success
      } else {
        setError(data.message ?? "Error procesando la solicitud");
        setStep(7); // Back to payment
      }
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
      setStep(7);
    }
  };

  const inputClass = "w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-3 text-ovni-text placeholder-ovni-muted/50 focus:outline-none focus:border-ovni-accent";
  const selectClass = `${inputClass} appearance-none`;

  return (
    <div className="min-h-screen bg-ovni-bg flex items-center justify-center p-4">
      <div className="bg-ovni-surface border border-ovni-border rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0f0b1e] to-[#141428] p-6 text-center border-b border-ovni-border">
          <h1 className="text-xl font-bold">OVNI <span className="text-ovni-accent">AI</span></h1>
          <p className="text-xs text-ovni-muted mt-1">Activa tu agente AI</p>
        </div>

        {/* Progress */}
        {step < 9 && (
          <div className="px-6 pt-4">
            <div className="flex gap-1">
              {STEPS.slice(0, 9).map((_, i) => (
                <div key={i} className={`flex-1 h-1 rounded-full ${i <= step ? "bg-ovni-accent" : "bg-white/10"}`} />
              ))}
            </div>
            <p className="text-xs text-ovni-muted mt-2">Paso {step + 1} de 9 — {STEPS[step]}</p>
          </div>
        )}

        <div className="p-6">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold">Tu agente AI empresarial</h2>
              <p className="text-ovni-muted text-sm">Conecta Claude AI a tus canales de comunicacion y herramientas de trabajo. Sin infraestructura, sin complicaciones.</p>
              <div className="grid grid-cols-3 gap-2 text-xs text-ovni-muted">
                <div className="bg-ovni-dark rounded-lg p-3">WhatsApp</div>
                <div className="bg-ovni-dark rounded-lg p-3">Telegram</div>
                <div className="bg-ovni-dark rounded-lg p-3">Slack</div>
                <div className="bg-ovni-dark rounded-lg p-3">Teams</div>
                <div className="bg-ovni-dark rounded-lg p-3">Web Chat</div>
                <div className="bg-ovni-dark rounded-lg p-3">API</div>
              </div>
              <button onClick={next} className="w-full bg-ovni-accent hover:bg-ovni-accent/80 text-white font-medium py-3 rounded-lg">Comenzar</button>
            </div>
          )}

          {/* Step 1: Company */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Tu empresa</h2>
              <input placeholder="Nombre de la empresa" value={form.company_name} onChange={e => set("company_name", e.target.value)} className={inputClass} />
              <select value={form.industry} onChange={e => set("industry", e.target.value)} className={selectClass}>
                <option value="">Selecciona industria</option>
                {industries.map(i => <option key={i} value={i.toLowerCase()}>{i}</option>)}
              </select>
              <div className="flex gap-3">
                <button onClick={prev} className="flex-1 border border-ovni-border text-ovni-muted py-2.5 rounded-lg">Atras</button>
                <button onClick={next} disabled={!form.company_name || !form.industry}
                  className="flex-1 bg-ovni-accent disabled:opacity-50 text-white py-2.5 rounded-lg">Siguiente</button>
              </div>
            </div>
          )}

          {/* Step 2: Contact */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Datos de contacto</h2>
              <input placeholder="Nombre completo" value={form.contact_name} onChange={e => set("contact_name", e.target.value)} className={inputClass} />
              <input type="email" placeholder="Email corporativo" value={form.contact_email} onChange={e => set("contact_email", e.target.value)} className={inputClass} />
              <div className="flex gap-3">
                <button onClick={prev} className="flex-1 border border-ovni-border text-ovni-muted py-2.5 rounded-lg">Atras</button>
                <button onClick={next} disabled={!form.contact_name || !form.contact_email}
                  className="flex-1 bg-ovni-accent disabled:opacity-50 text-white py-2.5 rounded-lg">Siguiente</button>
              </div>
            </div>
          )}

          {/* Step 3: Software Stack */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Tu software empresarial</h2>
              <p className="text-xs text-ovni-muted">Selecciona las herramientas que usa tu empresa. Tu agente AI se conectara automaticamente.</p>
              {Object.entries(softwareOptions).map(([key, options]) => (
                <div key={key}>
                  <label className="text-xs text-ovni-muted uppercase tracking-wider mb-1 block">
                    {key === "email" ? "Correo" : key === "billing" ? "Facturacion" : key === "crm" ? "CRM" : "RRHH"}
                  </label>
                  <select value={(form as any)[key]} onChange={e => set(key as keyof FormData, e.target.value)} className={selectClass}>
                    {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              <div className="flex gap-3">
                <button onClick={prev} className="flex-1 border border-ovni-border text-ovni-muted py-2.5 rounded-lg">Atras</button>
                <button onClick={next} className="flex-1 bg-ovni-accent text-white py-2.5 rounded-lg">Siguiente</button>
              </div>
            </div>
          )}

          {/* Step 4: Channels */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Canales de comunicacion</h2>
              <p className="text-xs text-ovni-muted">Donde quieres que tu agente AI este disponible?</p>
              <div className="space-y-2">
                {channelOptions.map(ch => (
                  <button key={ch.id} onClick={() => toggleChannel(ch.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      form.channels[ch.id]
                        ? "border-ovni-accent bg-ovni-accent/10"
                        : "border-ovni-border hover:border-ovni-accent/50"
                    }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{ch.label}</span>
                        <p className="text-xs text-ovni-muted">{ch.desc}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        form.channels[ch.id] ? "border-ovni-accent bg-ovni-accent" : "border-ovni-border"
                      }`}>
                        {form.channels[ch.id] && <span className="text-white text-xs">&#10003;</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={prev} className="flex-1 border border-ovni-border text-ovni-muted py-2.5 rounded-lg">Atras</button>
                <button onClick={next} className="flex-1 bg-ovni-accent text-white py-2.5 rounded-lg">Siguiente</button>
              </div>
            </div>
          )}

          {/* Step 5: Plan */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Elige tu plan</h2>
              <div className="space-y-3">
                {plans.map(p => (
                  <button key={p.id} onClick={() => set("plan_id", p.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      form.plan_id === p.id ? "border-ovni-accent bg-ovni-accent/10" : "border-ovni-border hover:border-ovni-accent/50"
                    }`}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-ovni-purple font-bold">{fmtCents(p.monthly_fee_cents)}/mes</span>
                    </div>
                    <p className="text-xs text-ovni-muted mt-1">
                      {(p.monthly_token_cap / 1000).toFixed(0)}K tokens &middot; {p.user_limit} usuarios &middot; {p.rpm_limit} RPM
                    </p>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={prev} className="flex-1 border border-ovni-border text-ovni-muted py-2.5 rounded-lg">Atras</button>
                <button onClick={next} className="flex-1 bg-ovni-accent text-white py-2.5 rounded-lg">Siguiente</button>
              </div>
            </div>
          )}

          {/* Step 6: Summary */}
          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Resumen</h2>
              <div className="bg-ovni-dark rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ovni-muted">Empresa</span><span>{form.company_name}</span></div>
                <div className="flex justify-between"><span className="text-ovni-muted">Contacto</span><span>{form.contact_name}</span></div>
                <div className="flex justify-between"><span className="text-ovni-muted">Plan</span><span className="text-ovni-purple">{selectedPlan?.name}</span></div>
                <div className="flex justify-between">
                  <span className="text-ovni-muted">Canales</span>
                  <span>{Object.entries(form.channels).filter(([,v]) => v).map(([k]) => k).join(", ") || "ninguno"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ovni-muted">Software</span>
                  <span>{[form.email, form.billing, form.crm, form.hr].filter(Boolean).join(", ") || "ninguno"}</span>
                </div>
                <div className="border-t border-ovni-border my-2" />
                <div className="flex justify-between"><span className="text-ovni-muted">Primer mes</span><span>{fmtCents(selectedPlan?.monthly_fee_cents ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-ovni-muted">Activacion</span><span>{fmtCents(activationFee)}</span></div>
                <div className="flex justify-between font-bold text-lg"><span>Total hoy</span><span className="text-ovni-purple">{fmtCents(total)}</span></div>
              </div>
              <div className="flex gap-3">
                <button onClick={prev} className="flex-1 border border-ovni-border text-ovni-muted py-2.5 rounded-lg">Atras</button>
                <button onClick={next} className="flex-1 bg-ovni-accent text-white py-2.5 rounded-lg">Continuar al pago</button>
              </div>
            </div>
          )}

          {/* Step 7: Payment */}
          {step === 7 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Datos de pago</h2>
              {error && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg p-3">{error}</p>}
              <input placeholder="Numero de tarjeta" value={form.card_number} onChange={e => set("card_number", e.target.value.replace(/\D/g, "").slice(0, 16))} className={inputClass} />
              <input placeholder="Nombre en la tarjeta" value={form.card_name} onChange={e => set("card_name", e.target.value)} className={inputClass} />
              <div className="flex gap-3">
                <input placeholder="MM/YY" value={form.expiry} onChange={e => {
                  let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                  if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
                  set("expiry", v);
                }} className={`${inputClass} flex-1`} />
                <input placeholder="CVV" type="password" value={form.cvv} onChange={e => set("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))} className={`${inputClass} w-28`} />
              </div>
              <p className="text-xs text-ovni-muted">Se cobrara {fmtCents(total)} USD</p>
              <div className="flex gap-3">
                <button onClick={prev} className="flex-1 border border-ovni-border text-ovni-muted py-2.5 rounded-lg">Atras</button>
                <button onClick={submit} disabled={!form.card_number || !form.card_name || !form.expiry || !form.cvv}
                  className="flex-1 bg-ovni-accent disabled:opacity-50 text-white py-2.5 rounded-lg font-medium">Pagar y activar</button>
              </div>
            </div>
          )}

          {/* Step 8: Processing */}
          {step === 8 && (
            <div className="text-center py-8">
              <div className="animate-spin w-10 h-10 border-4 border-ovni-accent/30 border-t-ovni-accent rounded-full mx-auto mb-4" />
              <p className="text-ovni-muted">Procesando pago y provisionando tu agente AI...</p>
            </div>
          )}

          {/* Step 9: Success */}
          {step === 9 && result && (
            <div className="text-center space-y-4">
              <div className="text-4xl mb-2">&#10003;</div>
              <h2 className="text-2xl font-bold text-ovni-green">Agente AI activado!</h2>
              <p className="text-ovni-muted text-sm">Tu instancia de OpenClaw esta siendo provisionada. Los canales seleccionados se configuraran automaticamente.</p>
              <div className="bg-ovni-dark border border-ovni-accent/30 rounded-xl p-4">
                <p className="text-xs text-ovni-muted mb-2">Tu API Key:</p>
                <code className="text-ovni-purple text-sm break-all select-all">{result.api_key}</code>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(result.api_key)}
                className="w-full bg-ovni-accent/20 text-ovni-accent py-2.5 rounded-lg text-sm font-medium hover:bg-ovni-accent/30">
                Copiar API Key
              </button>
              <div className="bg-ovni-dark rounded-lg p-3 text-xs text-ovni-muted text-left space-y-1">
                <p>Proximos pasos:</p>
                <p>1. Conecta tus canales desde tu dashboard</p>
                <p>2. Personaliza el system prompt de tu agente</p>
                <p>3. Invita a tu equipo</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
