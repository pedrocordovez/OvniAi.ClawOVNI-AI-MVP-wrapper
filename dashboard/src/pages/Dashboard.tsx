import { useTenants } from "../api/tenants";
import { useInvoices } from "../api/invoices";
import StatCard from "../components/StatCard";
import { formatCents, formatNumber } from "../utils/format";

export default function Dashboard() {
  const { data: tenantsData } = useTenants(1);
  const { data: invoicesData } = useInvoices(1);

  const tenants = tenantsData?.tenants ?? [];
  const totalTenants = tenantsData?.pagination?.total ?? 0;
  const activeTenants = tenants.filter((t: any) => t.active).length;
  const totalTokensThisMonth = tenants.reduce((sum: number, t: any) => sum + parseInt(t.tokens_this_month ?? "0", 10), 0);

  const invoices = invoicesData?.invoices ?? [];
  const paidInvoices = invoices.filter((i: any) => i.status === "paid");
  const revenue = paidInvoices.reduce((sum: number, i: any) => sum + i.total_cents, 0);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Tenants" value={String(totalTenants)} sub={`${activeTenants} activos`} />
        <StatCard label="Tokens este mes" value={formatNumber(totalTokensThisMonth)} />
        <StatCard label="Revenue (paid)" value={formatCents(revenue)} />
        <StatCard label="Facturas pendientes" value={String(invoices.filter((i: any) => i.status === "sent").length)} />
      </div>

      {/* Recent tenants */}
      <div className="bg-ovni-surface border border-ovni-border rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Tenants recientes</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ovni-muted text-left border-b border-ovni-border">
              <th className="pb-3 font-medium">Nombre</th>
              <th className="pb-3 font-medium">Plan</th>
              <th className="pb-3 font-medium">Usuarios</th>
              <th className="pb-3 font-medium">Tokens (mes)</th>
              <th className="pb-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {tenants.slice(0, 5).map((t: any) => (
              <tr key={t.id} className="border-b border-ovni-border/50 hover:bg-white/[0.02]">
                <td className="py-3 text-ovni-text">{t.name}</td>
                <td className="py-3 text-ovni-purple">{t.plan_id}</td>
                <td className="py-3">{t.user_count}</td>
                <td className="py-3">{formatNumber(parseInt(t.tokens_this_month ?? "0", 10))}</td>
                <td className="py-3">
                  <span className={`text-xs ${t.active ? "text-green-400" : "text-red-400"}`}>
                    {t.active ? "activo" : "inactivo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
