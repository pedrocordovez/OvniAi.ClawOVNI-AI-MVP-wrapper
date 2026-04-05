import { useState } from "react";
import { Link } from "react-router-dom";
import { useTenants, useCreateTenant } from "../api/tenants";
import StatusBadge from "../components/StatusBadge";
import { formatNumber, formatDate } from "../utils/format";

export default function Tenants() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useTenants(page, search);
  const createMutation = useCreateTenant();

  const [form, setForm] = useState({ name: "", slug: "", anthropic_api_key: "", plan_id: "starter" });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync(form);
    setShowCreate(false);
    setForm({ name: "", slug: "", anthropic_api_key: "", plan_id: "starter" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[28px] font-extrabold text-gray-900 tracking-tight">Tenants</h2>
        <button onClick={() => setShowCreate(true)}
          className="bg-black text-white px-4 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-gray-800 transition-all">
          + Crear tenant
        </button>
      </div>

      <input type="text" placeholder="Buscar por nombre, slug o plan..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400" />

      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              {["Nombre","Slug","Plan","Usuarios","Keys","Tokens (mes)","Estado","Creado"].map(h => (
                <th key={h} className="px-5 py-3 font-semibold text-gray-400 text-[11px] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-300">Cargando...</td></tr>
            ) : data?.tenants.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-300">Sin tenants</td></tr>
            ) : (
              data?.tenants.map((t: any) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3"><Link to={`/tenants/${t.id}`} className="font-medium text-gray-900 hover:underline">{t.name}</Link></td>
                  <td className="px-5 py-3 font-mono text-[11px] text-gray-400">{t.slug}</td>
                  <td className="px-5 py-3"><StatusBadge status={t.plan_id} /></td>
                  <td className="px-5 py-3 text-gray-600">{t.user_count}</td>
                  <td className="px-5 py-3 text-gray-600">{t.key_count}</td>
                  <td className="px-5 py-3 text-gray-600">{formatNumber(parseInt(t.tokens_this_month ?? "0", 10))}</td>
                  <td className="px-5 py-3"><StatusBadge status={t.active ? "active" : "inactive"} /></td>
                  <td className="px-5 py-3 text-gray-400 text-[12px]">{formatDate(t.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.pages > 1 && (
        <div className="flex gap-1 justify-center">
          {Array.from({ length: data.pagination.pages }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)}
              className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium ${
                page === i + 1 ? "bg-black text-white" : "text-gray-400 hover:bg-gray-100"
              }`}>{i + 1}</button>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-[20px] border border-gray-200 shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-[18px] font-extrabold text-gray-900 mb-4">Crear Tenant</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input placeholder="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400" />
              <input placeholder="Slug" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400" />
              <input placeholder="Anthropic API Key" value={form.anthropic_api_key} onChange={e => setForm({ ...form, anthropic_api_key: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-400" />
              <select value={form.plan_id} onChange={e => setForm({ ...form, plan_id: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-2.5 text-[14px] text-gray-900 appearance-none focus:outline-none focus:border-gray-400">
                <option value="starter">Starter ($149/mes)</option>
                <option value="pro">Pro ($399/mes)</option>
                <option value="enterprise">Enterprise ($999/mes)</option>
              </select>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={createMutation.isPending}
                  className="flex-1 bg-black text-white py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400">
                  {createMutation.isPending ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
