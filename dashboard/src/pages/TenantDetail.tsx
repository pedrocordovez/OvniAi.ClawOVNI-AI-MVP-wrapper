import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTenants, useTenantUsage, useUpdateTenant, useGenerateKey } from "../api/tenants";
import { useBillingPeriods } from "../api/invoices";
import StatusBadge from "../components/StatusBadge";
import StatCard from "../components/StatCard";
import { formatNumber, formatCents, formatDate } from "../utils/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: tenantsData } = useTenants(1);
  const { data: usageData } = useTenantUsage(id!, 30);
  const { data: periodsData } = useBillingPeriods(id);
  const updateMutation = useUpdateTenant();
  const generateKeyMutation = useGenerateKey();
  const [newKey, setNewKey] = useState<string | null>(null);

  const tenant = tenantsData?.tenants.find((t: any) => t.id === id);

  if (!tenant) return <p className="text-ovni-muted">Cargando tenant...</p>;

  const usage = usageData?.usage ?? [];
  const chartData = [...usage].reverse().map((u: any) => ({
    date: u.date?.split("T")[0]?.slice(5),
    tokens: parseInt(u.input_tokens, 10) + parseInt(u.output_tokens, 10),
    cost: parseFloat(u.billed_cost),
  }));

  const handleGenerateKey = async () => {
    const result = await generateKeyMutation.mutateAsync({ tenantId: id!, label: "Dashboard generated" });
    setNewKey(result.api_key);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">{tenant.name}</h2>
      <p className="text-ovni-muted text-sm mb-6">
        {tenant.slug} &middot; <StatusBadge status={tenant.plan_id} /> &middot;
        <StatusBadge status={tenant.active ? "active" : "inactive"} />
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Usuarios" value={tenant.user_count} />
        <StatCard label="API Keys" value={tenant.key_count} />
        <StatCard label="Tokens (mes)" value={formatNumber(parseInt(tenant.tokens_this_month ?? "0", 10))} />
        <StatCard label="Token Cap" value={formatNumber(tenant.monthly_token_cap)} />
      </div>

      {/* Usage chart */}
      {chartData.length > 0 && (
        <div className="bg-ovni-surface border border-ovni-border rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Uso diario (ultimos 30 dias)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <XAxis dataKey="date" stroke="#475569" fontSize={11} />
              <YAxis stroke="#475569" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "#0d0f1a", border: "1px solid rgba(127,119,221,0.2)", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="tokens" fill="#7F77DD" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Actions */}
      <div className="bg-ovni-surface border border-ovni-border rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Acciones</h3>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleGenerateKey}
            disabled={generateKeyMutation.isPending}
            className="bg-ovni-accent/20 text-ovni-accent px-4 py-2 rounded-lg text-sm hover:bg-ovni-accent/30"
          >
            Generar API Key
          </button>
          <button
            onClick={() => updateMutation.mutate({ id: id!, active: !tenant.active })}
            className={`px-4 py-2 rounded-lg text-sm ${
              tenant.active
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            }`}
          >
            {tenant.active ? "Desactivar" : "Activar"}
          </button>
        </div>

        {newKey && (
          <div className="mt-4 bg-ovni-dark border border-ovni-accent/30 rounded-lg p-4">
            <p className="text-xs text-ovni-muted mb-2">Nueva API Key (guardala ahora):</p>
            <code className="text-ovni-purple text-sm break-all">{newKey}</code>
          </div>
        )}
      </div>

      {/* Billing periods */}
      {periodsData?.periods && periodsData.periods.length > 0 && (
        <div className="bg-ovni-surface border border-ovni-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Periodos de facturacion</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ovni-muted text-left border-b border-ovni-border">
                <th className="pb-3 font-medium">Periodo</th>
                <th className="pb-3 font-medium">Tokens</th>
                <th className="pb-3 font-medium">Costo</th>
                <th className="pb-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {periodsData.periods.map((p: any) => (
                <tr key={p.id} className="border-b border-ovni-border/50">
                  <td className="py-3">{formatDate(p.period_start)} - {formatDate(p.period_end)}</td>
                  <td className="py-3">{formatNumber(parseInt(p.total_tokens, 10))}</td>
                  <td className="py-3">{formatCents(Math.round(parseFloat(p.total_billed_cost) * 100))}</td>
                  <td className="py-3"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
