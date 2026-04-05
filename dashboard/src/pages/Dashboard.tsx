import { useTenants } from "../api/tenants";
import { useInvoices } from "../api/invoices";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { formatCents, formatNumber } from "../utils/format";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { data: tenantsData } = useTenants(1);
  const { data: invoicesData } = useInvoices(1);

  const tenants = tenantsData?.tenants ?? [];
  const totalTenants = tenantsData?.pagination?.total ?? tenants.length;
  const activeTenants = tenants.filter((t: any) => t.active).length;
  const totalTokensThisMonth = tenants.reduce((sum: number, t: any) => sum + parseInt(t.tokens_this_month ?? "0", 10), 0);

  const invoices = invoicesData?.invoices ?? [];
  const paidInvoices = invoices.filter((i: any) => i.status === "paid");
  const revenue = paidInvoices.reduce((sum: number, i: any) => sum + i.total_cents, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-[28px] font-extrabold text-gray-900 tracking-tight">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tenants" value={String(totalTenants)} sub={`${activeTenants} activos`} />
        <StatCard label="Tokens este mes" value={formatNumber(totalTokensThisMonth)} />
        <StatCard label="Revenue (paid)" value={formatCents(revenue)} color="text-emerald-600" />
        <StatCard label="Facturas pendientes" value={String(invoices.filter((i: any) => i.status === "sent").length)} />
      </div>

      {/* Recent tenants */}
      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <span className="text-[14px] font-semibold text-gray-900">Tenants recientes</span>
          <Link to="/tenants" className="text-[12px] font-semibold text-black hover:underline">Ver todos</Link>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Nombre</th>
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Plan</th>
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Usuarios</th>
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Tokens (mes)</th>
              <th className="px-5 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody>
            {tenants.slice(0, 5).map((t: any) => (
              <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-3">
                  <Link to={`/tenants/${t.id}`} className="font-medium text-gray-900 hover:underline">{t.name}</Link>
                </td>
                <td className="px-5 py-3"><StatusBadge status={t.plan_id} /></td>
                <td className="px-5 py-3 text-gray-600">{t.user_count}</td>
                <td className="px-5 py-3 text-gray-600">{formatNumber(parseInt(t.tokens_this_month ?? "0", 10))}</td>
                <td className="px-5 py-3"><StatusBadge status={t.active ? "active" : "inactive"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
