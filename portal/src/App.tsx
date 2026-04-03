import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const KEY = "ovni_tenant_key";

function getKey() { return localStorage.getItem(KEY) ?? ""; }
function setKey(k: string) { localStorage.setItem(KEY, k); }

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getKey()}` } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function fmt(n: number) { return new Intl.NumberFormat("en-US").format(n); }
function fmtCents(n: number) { return `$${(n / 100).toFixed(2)}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString("es-PA", { year: "numeric", month: "short", day: "numeric" }); }

// ── Login ────────────────────────────────────────────────────
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
    <div className="min-h-screen bg-ovni-bg flex items-center justify-center">
      <div className="bg-ovni-surface border border-ovni-border rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-2">OVNI <span className="text-ovni-accent">AI</span></h1>
        <p className="text-sm text-ovni-muted text-center mb-6">Portal de Cliente</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" value={key} onChange={e => setKeyVal(e.target.value)} placeholder="ovni_sk_..."
            className="w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-3 text-ovni-text placeholder-ovni-muted/50 focus:outline-none focus:border-ovni-accent" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={!key}
            className="w-full bg-ovni-accent hover:bg-ovni-accent/80 disabled:opacity-50 text-white font-medium py-3 rounded-lg">Ingresar</button>
        </form>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────
function PortalDashboard() {
  const { data } = useQuery({ queryKey: ["portal-dash"], queryFn: () => api<any>("/portal/dashboard") });
  if (!data) return <p className="text-ovni-muted p-8">Cargando...</p>;

  const pct = data.usage.usage_percent;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-ovni-surface border border-ovni-border rounded-xl p-5">
          <p className="text-xs text-ovni-muted uppercase">Plan</p>
          <p className="text-xl font-bold text-ovni-purple mt-1">{data.tenant.plan}</p>
        </div>
        <div className="bg-ovni-surface border border-ovni-border rounded-xl p-5">
          <p className="text-xs text-ovni-muted uppercase">Tokens este mes</p>
          <p className="text-xl font-bold mt-1">{fmt(data.usage.total_tokens)}</p>
          <div className="mt-2 h-2 bg-ovni-dark rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-ovni-green"}`}
              style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="text-xs text-ovni-muted mt-1">{pct}% del cap ({fmt(data.usage.token_cap)})</p>
        </div>
        <div className="bg-ovni-surface border border-ovni-border rounded-xl p-5">
          <p className="text-xs text-ovni-muted uppercase">Requests este mes</p>
          <p className="text-xl font-bold mt-1">{fmt(data.usage.total_requests)}</p>
        </div>
      </div>
    </div>
  );
}

// ── Usage ────────────────────────────────────────────────────
function Usage() {
  const { data } = useQuery({ queryKey: ["portal-usage"], queryFn: () => api<any>("/portal/usage?days=30&limit=100") });
  const events = data?.usage ?? [];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Uso</h2>
      <div className="bg-ovni-surface border border-ovni-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ovni-muted text-left border-b border-ovni-border">
              <th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Modelo</th>
              <th className="px-5 py-3">Input</th><th className="px-5 py-3">Output</th>
              <th className="px-5 py-3">Canal</th><th className="px-5 py-3">Latencia</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e: any) => (
              <tr key={e.id} className="border-b border-ovni-border/50">
                <td className="px-5 py-2.5 text-xs text-ovni-muted">{fmtDate(e.created_at)}</td>
                <td className="px-5 py-2.5 text-xs font-mono">{e.model.split("-").slice(1, 3).join("-")}</td>
                <td className="px-5 py-2.5">{fmt(e.input_tokens)}</td>
                <td className="px-5 py-2.5">{fmt(e.output_tokens)}</td>
                <td className="px-5 py-2.5 text-ovni-muted">{e.channel}</td>
                <td className="px-5 py-2.5 text-ovni-muted">{e.latency_ms ? `${e.latency_ms}ms` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Invoices ─────────────────────────────────────────────────
function PortalInvoices() {
  const { data } = useQuery({ queryKey: ["portal-invoices"], queryFn: () => api<any>("/portal/invoices") });
  const invoices = data?.invoices ?? [];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Facturas</h2>
      <div className="bg-ovni-surface border border-ovni-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ovni-muted text-left border-b border-ovni-border">
              <th className="px-5 py-3">Numero</th><th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Estado</th><th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => (
              <tr key={inv.id} className="border-b border-ovni-border/50">
                <td className="px-5 py-3 font-mono text-xs">{inv.invoice_number}</td>
                <td className="px-5 py-3 font-medium">{fmtCents(inv.total_cents)}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inv.status === "paid" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"
                  }`}>{inv.status}</span>
                </td>
                <td className="px-5 py-3 text-ovni-muted text-xs">{fmtDate(inv.created_at)}</td>
                <td className="px-5 py-3">
                  <a href={`/portal/invoices/${inv.id}/pdf`} target="_blank" rel="noopener"
                    className="text-ovni-accent text-xs hover:underline">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Layout ───────────────────────────────────────────────────
function PortalLayout({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const location = useLocation();
  const nav = [{ path: "/", label: "Dashboard" }, { path: "/usage", label: "Uso" }, { path: "/invoices", label: "Facturas" }];

  return (
    <div className="flex h-screen bg-ovni-bg">
      <aside className="w-56 bg-ovni-surface border-r border-ovni-border flex flex-col">
        <div className="p-5 border-b border-ovni-border">
          <h1 className="text-lg font-bold">OVNI <span className="text-ovni-accent">AI</span></h1>
          <p className="text-xs text-ovni-muted">Portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(n => (
            <Link key={n.path} to={n.path}
              className={`block px-3 py-2 rounded-lg text-sm ${location.pathname === n.path ? "bg-ovni-accent/10 text-ovni-accent" : "text-ovni-muted hover:text-ovni-text"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-ovni-border">
          <button onClick={onLogout} className="text-sm text-ovni-muted hover:text-red-400">Salir</button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(!!getKey());

  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  const handleLogout = () => { localStorage.removeItem(KEY); setAuth(false); };

  return (
    <BrowserRouter>
      <PortalLayout onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<PortalDashboard />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/invoices" element={<PortalInvoices />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PortalLayout>
    </BrowserRouter>
  );
}
