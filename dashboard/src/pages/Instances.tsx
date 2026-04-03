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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">OpenClaw Instances</h2>
        <button onClick={() => setShowProvision(true)}
          className="bg-ovni-accent hover:bg-ovni-accent/80 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Provisionar instancia
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mb-4">
        {statusFilters.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              statusFilter === s ? "bg-ovni-accent text-white" : "bg-white/5 text-ovni-muted hover:text-ovni-text"
            }`}>
            {s || "Todas"}
          </button>
        ))}
      </div>

      {/* Instances table */}
      <div className="bg-ovni-surface border border-ovni-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ovni-muted text-left border-b border-ovni-border">
              <th className="px-5 py-3 font-medium">Tenant</th>
              <th className="px-5 py-3 font-medium">Container</th>
              <th className="px-5 py-3 font-medium">Estado</th>
              <th className="px-5 py-3 font-medium">Salud</th>
              <th className="px-5 py-3 font-medium">Canales</th>
              <th className="px-5 py-3 font-medium">Puerto</th>
              <th className="px-5 py-3 font-medium">Ultimo check</th>
              <th className="px-5 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-ovni-muted">Cargando...</td></tr>
            ) : data?.instances.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-ovni-muted">No hay instancias</td></tr>
            ) : (
              data?.instances.map((inst: any) => {
                const channels = inst.channels ? Object.keys(inst.channels) : [];
                return (
                  <tr key={inst.id} className="border-b border-ovni-border/50 hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="font-medium">{inst.tenant_name}</div>
                      <div className="text-xs text-ovni-muted">{inst.tenant_slug}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ovni-muted">
                      {inst.container_id?.slice(0, 12) ?? "-"}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={inst.status} /></td>
                    <td className="px-5 py-3"><StatusBadge status={inst.health_status} /></td>
                    <td className="px-5 py-3 text-xs">
                      {channels.length > 0 ? channels.join(", ") : <span className="text-ovni-muted">ninguno</span>}
                    </td>
                    <td className="px-5 py-3 text-ovni-muted">{inst.port ?? "-"}</td>
                    <td className="px-5 py-3 text-xs text-ovni-muted">
                      {inst.last_health_check ? formatDateTime(inst.last_health_check) : "-"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        {inst.status === "running" && (
                          <>
                            <button onClick={() => actionMutation.mutate({ id: inst.id, action: "stop" })}
                              className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">Stop</button>
                            <button onClick={() => actionMutation.mutate({ id: inst.id, action: "restart" })}
                              className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30">Restart</button>
                          </>
                        )}
                        {inst.status === "stopped" && (
                          <button onClick={() => actionMutation.mutate({ id: inst.id, action: "start" })}
                            className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">Start</button>
                        )}
                        {inst.status === "paused" && (
                          <button onClick={() => actionMutation.mutate({ id: inst.id, action: "start" })}
                            className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">Resume</button>
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

      {/* Provision modal */}
      {showProvision && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowProvision(false)}>
          <div className="bg-ovni-surface border border-ovni-border rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Provisionar Instancia OpenClaw</h3>
            <div className="space-y-3">
              <select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)}
                className="w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-2.5 text-sm text-ovni-text">
                <option value="">Seleccionar tenant...</option>
                {tenantsData?.tenants.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                ))}
              </select>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowProvision(false)}
                  className="flex-1 border border-ovni-border text-ovni-muted py-2 rounded-lg text-sm">Cancelar</button>
                <button onClick={handleProvision} disabled={!selectedTenant || provisionMutation.isPending}
                  className="flex-1 bg-ovni-accent text-white py-2 rounded-lg text-sm disabled:opacity-50">
                  {provisionMutation.isPending ? "Provisionando..." : "Provisionar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
