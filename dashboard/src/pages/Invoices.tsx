import { useState } from "react";
import { Link } from "react-router-dom";
import { useInvoices } from "../api/invoices";
import StatusBadge from "../components/StatusBadge";
import { formatCents, formatDate } from "../utils/format";

const statuses = ["", "draft", "finalized", "sent", "paid", "void"];

export default function Invoices() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const { data, isLoading } = useInvoices(page, statusFilter || undefined);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Facturas</h2>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-ovni-accent text-white"
                : "bg-white/5 text-ovni-muted hover:text-ovni-text"
            }`}
          >
            {s || "Todas"}
          </button>
        ))}
      </div>

      <div className="bg-ovni-surface border border-ovni-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ovni-muted text-left border-b border-ovni-border">
              <th className="px-5 py-3 font-medium">Numero</th>
              <th className="px-5 py-3 font-medium">Tenant</th>
              <th className="px-5 py-3 font-medium">Subtotal</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Estado</th>
              <th className="px-5 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-ovni-muted">Cargando...</td></tr>
            ) : data?.invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-ovni-muted">No hay facturas</td></tr>
            ) : (
              data?.invoices.map((inv: any) => (
                <tr key={inv.id} className="border-b border-ovni-border/50 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link to={`/invoices/${inv.id}`} className="text-ovni-accent hover:underline font-mono text-xs">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3">{inv.tenant_name ?? inv.tenant_slug}</td>
                  <td className="px-5 py-3">{formatCents(inv.subtotal_cents)}</td>
                  <td className="px-5 py-3 font-medium">{formatCents(inv.total_cents)}</td>
                  <td className="px-5 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-5 py-3 text-ovni-muted text-xs">{formatDate(inv.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
