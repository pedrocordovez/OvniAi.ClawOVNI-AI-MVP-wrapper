import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

const KEY = "ovni_tenant_key";
function getKey() { return localStorage.getItem(KEY) ?? ""; }
function setKey(k: string) { localStorage.setItem(KEY, k); }

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getKey()}` } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function fmt(n: number) { return new Intl.NumberFormat("en-US").format(n); }
function fmtUSD(n: number) { return `$${(n / 100).toFixed(2)}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString("es-PA", { year: "numeric", month: "short", day: "numeric" }); }
function fmtTime(d: string) { return new Date(d).toLocaleString("es-PA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

// ── Login ────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: () => void }) {
  const [key, setKeyVal] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/portal/dashboard", { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) { setKey(key); onLogin(); }
      else setError("API key invalida");
    } catch { setError("No se pudo conectar"); }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 bg-black rounded-[10px] flex items-center justify-center">
            <span className="text-white text-[14px] font-black">O</span>
          </div>
          <span className="text-[18px] font-bold text-gray-900">OVNI AI</span>
        </div>
        <div className="bg-white rounded-[20px] border border-gray-200 shadow-sm p-8">
          <h1 className="text-[24px] font-extrabold text-gray-900 text-center mb-1">Portal de Cliente</h1>
          <p className="text-[13px] text-gray-400 text-center mb-6">Ingresa tu API key para acceder</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="password" value={key} onChange={e => setKeyVal(e.target.value)}
              placeholder="ovni_sk_..."
              className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400" />
            {error && <p className="text-red-500 text-[13px]">{error}</p>}
            <button type="submit" disabled={!key}
              className="w-full bg-black text-white py-3 rounded-[10px] text-[14px] font-semibold hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all">
              Ingresar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────
function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-[14px] border border-gray-200 p-5">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-[28px] font-extrabold mt-1 tracking-tight ${color ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-[12px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────
function Dashboard() {
  const { data } = useQuery({ queryKey: ["portal-dash"], queryFn: () => api<any>("/portal/dashboard") });
  if (!data) return <Loading />;

  const pct = data.usage.usage_percent;
  const credit = data.credit;

  return (
    <div className="space-y-6">
      <h2 className="text-[28px] font-extrabold text-gray-900 tracking-tight">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Credito disponible" value={fmtUSD(credit?.balance_cents ?? 0)}
          sub={credit?.auto_recharge ? "Auto-recarga activa" : "Sin auto-recarga"}
          color={credit?.balance_cents > 1000 ? "text-emerald-600" : credit?.balance_cents > 0 ? "text-amber-600" : "text-red-600"} />
        <Stat label="Plan" value={data.tenant.plan.toUpperCase()} sub={data.tenant.model.split("-").slice(1,3).join(" ")} />
        <Stat label="Tokens este mes" value={fmt(data.usage.total_tokens)} sub={`${pct}% del cap (${fmt(parseInt(data.usage.token_cap))})`} />
        <Stat label="Requests" value={fmt(data.usage.total_requests)} />
      </div>

      {/* Credit bar */}
      {credit && (
        <div className="bg-white rounded-[14px] border border-gray-200 p-5">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[13px] font-semibold text-gray-700">Credito API</span>
            <span className="text-[13px] font-bold text-gray-900">{fmtUSD(credit.balance_cents)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${
              credit.balance_cents > 2000 ? "bg-emerald-500" : credit.balance_cents > 500 ? "bg-amber-500" : "bg-red-500"
            }`} style={{ width: `${Math.min(100, Math.max(5, (credit.balance_cents / (credit.recharge_amount_cents || 5000)) * 100))}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[11px] text-gray-400">
            <span>{credit.suspended ? "Servicio suspendido" : credit.auto_recharge ? `Auto-recarga: ${fmtUSD(credit.recharge_amount_cents)} cuando baje de ${fmtUSD(credit.recharge_threshold_cents)}` : "Auto-recarga desactivada"}</span>
          </div>
        </div>
      )}

      {/* Token usage bar */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[13px] font-semibold text-gray-700">Uso de tokens</span>
          <span className="text-[13px] text-gray-500">{pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      {/* Instance status */}
      {data.instance && (
        <div className="bg-white rounded-[14px] border border-gray-200 p-5">
          <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Agente AI</h3>
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${data.instance.health === "healthy" ? "bg-emerald-400" : data.instance.status === "running" ? "bg-amber-400" : "bg-red-400"}`} />
            <span className="text-[14px] text-gray-600 capitalize">{data.instance.status}</span>
            <span className="text-[12px] text-gray-400">· {data.instance.health}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Usage ────────────────────────────────────────────────
function Usage() {
  const { data } = useQuery({ queryKey: ["portal-usage"], queryFn: () => api<any>("/portal/usage?days=30&limit=100") });
  const events = data?.usage ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-[28px] font-extrabold text-gray-900 tracking-tight">Uso</h2>
      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Fecha</th>
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Modelo</th>
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Input</th>
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Output</th>
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Canal</th>
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Latencia</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-300">Sin datos de uso</td></tr>}
            {events.map((e: any) => (
              <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-3 text-gray-400">{fmtTime(e.created_at)}</td>
                <td className="px-5 py-3 font-mono text-[12px] text-gray-500">{e.model.split("-").slice(1, 3).join("-")}</td>
                <td className="px-5 py-3 text-gray-700 font-medium">{fmt(e.input_tokens)}</td>
                <td className="px-5 py-3 text-gray-700 font-medium">{fmt(e.output_tokens)}</td>
                <td className="px-5 py-3 text-gray-400">{e.channel}</td>
                <td className="px-5 py-3 text-gray-400">{e.latency_ms ? `${e.latency_ms}ms` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Credit ───────────────────────────────────────────────
function Credit() {
  const { data } = useQuery({ queryKey: ["portal-credit"], queryFn: () => api<any>("/portal/credit") });
  if (!data) return <Loading />;

  const { credit, transactions } = data;

  return (
    <div className="space-y-6">
      <h2 className="text-[28px] font-extrabold text-gray-900 tracking-tight">Credito</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Balance actual" value={fmtUSD(credit.credit_balance_cents)}
          color={credit.credit_balance_cents > 1000 ? "text-emerald-600" : credit.credit_balance_cents > 0 ? "text-amber-600" : "text-red-600"} />
        <Stat label="Auto-recarga" value={credit.auto_recharge ? "Activa" : "Inactiva"}
          sub={credit.auto_recharge ? `${fmtUSD(credit.recharge_amount_cents)} cuando < ${fmtUSD(credit.recharge_threshold_cents)}` : "Riesgo de suspension"} />
        <Stat label="Estado" value={credit.suspended ? "Suspendido" : "Activo"}
          color={credit.suspended ? "text-red-600" : "text-emerald-600"} />
      </div>

      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <span className="text-[13px] font-semibold text-gray-700">Historial de transacciones</span>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Fecha</th>
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Tipo</th>
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Monto</th>
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Balance</th>
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Descripcion</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-300">Sin transacciones</td></tr>}
            {transactions.map((tx: any) => (
              <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-2.5 text-gray-400">{fmtTime(tx.created_at)}</td>
                <td className="px-5 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    tx.type === "usage_deduction" ? "bg-gray-100 text-gray-500" :
                    tx.type === "recharge" || tx.type === "initial_credit" ? "bg-emerald-50 text-emerald-600" :
                    tx.type === "monthly_fee" ? "bg-blue-50 text-blue-600" :
                    "bg-gray-100 text-gray-500"
                  }`}>{tx.type.replace(/_/g, " ")}</span>
                </td>
                <td className={`px-5 py-2.5 font-semibold ${tx.amount_cents >= 0 ? "text-emerald-600" : "text-gray-700"}`}>
                  {tx.amount_cents >= 0 ? "+" : ""}{fmtUSD(tx.amount_cents)}
                </td>
                <td className="px-5 py-2.5 text-gray-500 font-medium">{fmtUSD(tx.balance_after)}</td>
                <td className="px-5 py-2.5 text-gray-400 text-[12px] max-w-[200px] truncate">{tx.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Invoices ─────────────────────────────────────────────
function Invoices() {
  const { data } = useQuery({ queryKey: ["portal-invoices"], queryFn: () => api<any>("/portal/invoices") });
  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-[28px] font-extrabold text-gray-900 tracking-tight">Facturas</h2>
      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Numero</th>
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Total</th>
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Estado</th>
              <th className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Fecha</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-300">Sin facturas</td></tr>}
            {invoices.map((inv: any) => (
              <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-3 font-mono text-[12px] text-gray-600">{inv.invoice_number}</td>
                <td className="px-5 py-3 font-semibold text-gray-900">{fmtUSD(inv.total_cents)}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                    inv.status === "paid" ? "bg-emerald-50 text-emerald-600" :
                    inv.status === "sent" ? "bg-blue-50 text-blue-600" :
                    inv.status === "void" ? "bg-gray-100 text-gray-400" :
                    "bg-amber-50 text-amber-600"
                  }`}>{inv.status}</span>
                </td>
                <td className="px-5 py-3 text-gray-400">{fmtDate(inv.created_at)}</td>
                <td className="px-5 py-3">
                  <a href={`/portal/invoices/${inv.id}/pdf`} target="_blank" rel="noopener"
                    className="text-[12px] font-semibold text-black hover:underline">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Loading ──────────────────────────────────────────────
function Loading() {
  return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-[3px] border-gray-200 border-t-black rounded-full animate-spin" /></div>;
}

// ── Layout ───────────────────────────────────────────────
function Layout({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const location = useLocation();
  const nav = [
    { path: "/", label: "Dashboard", icon: "◻" },
    { path: "/usage", label: "Uso", icon: "◈" },
    { path: "/credit", label: "Credito", icon: "◉" },
    { path: "/invoices", label: "Facturas", icon: "◇" },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-black rounded-[8px] flex items-center justify-center">
                <span className="text-white text-[11px] font-black">O</span>
              </div>
              <span className="text-[15px] font-bold text-gray-900">OVNI AI</span>
            </div>
            <nav className="flex gap-1">
              {nav.map(n => (
                <Link key={n.path} to={n.path}
                  className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-all ${
                    location.pathname === n.path ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  }`}>{n.label}</Link>
              ))}
            </nav>
          </div>
          <button onClick={onLogout} className="text-[13px] text-gray-400 hover:text-red-500 transition-colors">Salir</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(!!getKey());
  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  const handleLogout = () => { localStorage.removeItem(KEY); setAuth(false); };

  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/credit" element={<Credit />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
