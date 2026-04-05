import { useState } from "react";
import { useInstances, useInstanceAction, useProvisionInstance } from "../api/instances";
import { useTenants } from "../api/tenants";
import StatusBadge from "../components/StatusBadge";
import { formatDateTime } from "../utils/format";

const statusFilters = ["", "running", "stopped", "paused", "error", "provisioning"];

export default function Instances() {
  const [statusFilter, setStatusFilter] = useState("");
  const { data, isLoading } = useInstances(statusFilter || undefined);
  const actionMutation = useInstanceAction();
  const provisionMutation = useProvisionInstance();
  const { data: tenantsData } = useTenants(1);
  const [showProvision, setShowProvision] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState("");

  const handleProvision = async () => {
    if (!selectedTenant) return;
    await provisionMutation.mutateAsync({ tenant_id: selectedTenant });
    setShowProvision(false);
    setSelectedTenant("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[28px] font-extrabold text-gray-900 tracking-tight">OpenClaw Instances</h2>
        <button onClick={() => setShowProvision(true)}
          className="bg-black text-white px-4 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-gray-800 transition-all">
          + Provisionar
        </button>
      </div>

      <div className="flex gap-2">
        {statusFilters.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              statusFilter === s ? "bg-black text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-400"
            }`}>{s || "Todas"}</button>
        ))}
      </div>

      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              {["Tenant","Container","Estado","Salud","Canales","Puerto","Ultimo check","Acciones"].map(h => (
                <th key={h} className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-300">Cargando...</td></tr>
            ) : data?.instances.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-300">Sin instancias</td></tr>
            ) : (
              data?.instances.map((inst: any) => {
                const channels = inst.channels ? Object.keys(inst.channels) : [];
                return (
                  <tr key={inst.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{inst.tenant_name}</div>
                      <div className="text-[11px] text-gray-400">{inst.tenant_slug}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-gray-400">{inst.container_id?.slice(0, 12) ?? "—"}</td>
                    <td className="px-5 py-3"><StatusBadge status={inst.status} /></td>
                    <td className="px-5 py-3"><StatusBadge status={inst.health_status} /></td>
                    <td className="px-5 py-3 text-[12px] text-gray-500">{channels.length > 0 ? channels.join(", ") : "—"}</td>
                    <td className="px-5 py-3 text-gray-400">{inst.port ?? "—"}</td>
                    <td className="px-5 py-3 text-[12px] text-gray-400">{inst.last_health_check ? formatDateTime(inst.last_health_check) : "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        {inst.status === "running" && (<>
                          <button onClick={() => actionMutation.mutate({ id: inst.id, action: "stop" })}
                            className="text-[11px] px-2.5 py-1 rounded-[6px] font-medium bg-red-50 text-red-600 hover:bg-red-100">Stop</button>
                          <button onClick={() => actionMutation.mutate({ id: inst.id, action: "restart" })}
                            className="text-[11px] px-2.5 py-1 rounded-[6px] font-medium bg-amber-50 text-amber-600 hover:bg-amber-100">Restart</button>
                        </>)}
                        {(inst.status === "stopped" || inst.status === "paused") && (
                          <button onClick={() => actionMutation.mutate({ id: inst.id, action: "start" })}
                            className="text-[11px] px-2.5 py-1 rounded-[6px] font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100">Start</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showProvision && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowProvision(false)}>
          <div className="bg-white rounded-[20px] border border-gray-200 shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-[18px] font-extrabold text-gray-900 mb-4">Provisionar Instancia</h3>
            <select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-2.5 text-[14px] text-gray-900 appearance-none focus:outline-none focus:border-gray-400">
              <option value="">Seleccionar tenant...</option>
              {tenantsData?.tenants.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
              ))}
            </select>
            <div className="flex gap-3 pt-4">
              <button onClick={() => setShowProvision(false)}
                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-gray-50">Cancelar</button>
              <button onClick={handleProvision} disabled={!selectedTenant || provisionMutation.isPending}
                className="flex-1 bg-black text-white py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400">
                {provisionMutation.isPending ? "Provisionando..." : "Provisionar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
