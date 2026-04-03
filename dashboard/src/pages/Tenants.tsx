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

  const [form, setForm] = useState({
    name: "", slug: "", anthropic_api_key: "", plan_id: "starter",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync(form);
    setShowCreate(false);
    setForm({ name: "", slug: "", anthropic_api_key: "", plan_id: "starter" });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Tenants</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-ovni-accent hover:bg-ovni-accent/80 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Crear tenant
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar por nombre, slug o plan..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-2.5 text-sm text-ovni-text placeholder-ovni-muted/50 focus:outline-none focus:border-ovni-accent mb-4"
      />

      {/* Table */}
      <div className="bg-ovni-surface border border-ovni-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ovni-muted text-left border-b border-ovni-border">
              <th className="px-5 py-3 font-medium">Nombre</th>
              <th className="px-5 py-3 font-medium">Slug</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 font-medium">Usuarios</th>
              <th className="px-5 py-3 font-medium">Keys</th>
              <th className="px-5 py-3 font-medium">Tokens (mes)</th>
              <th className="px-5 py-3 font-medium">Estado</th>
              <th className="px-5 py-3 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-ovni-muted">Cargando...</td></tr>
            ) : (
              data?.tenants.map((t: any) => (
                <tr key={t.id} className="border-b border-ovni-border/50 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link to={`/tenants/${t.id}`} className="text-ovni-accent hover:underline">{t.name}</Link>
                  </td>
                  <td className="px-5 py-3 text-ovni-muted font-mono text-xs">{t.slug}</td>
                  <td className="px-5 py-3"><StatusBadge status={t.plan_id} /></td>
                  <td className="px-5 py-3">{t.user_count}</td>
                  <td className="px-5 py-3">{t.key_count}</td>
                  <td className="px-5 py-3">{formatNumber(parseInt(t.tokens_this_month ?? "0", 10))}</td>
                  <td className="px-5 py-3"><StatusBadge status={t.active ? "active" : "inactive"} /></td>
                  <td className="px-5 py-3 text-ovni-muted text-xs">{formatDate(t.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.pages > 1 && (
        <div className="flex gap-2 mt-4 justify-center">
          {Array.from({ length: data.pagination.pages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`px-3 py-1 rounded text-sm ${page === i + 1 ? "bg-ovni-accent text-white" : "text-ovni-muted hover:text-ovni-text"}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-ovni-surface border border-ovni-border rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Crear Tenant</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input placeholder="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-2.5 text-sm text-ovni-text" />
              <input placeholder="Slug" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })}
                className="w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-2.5 text-sm text-ovni-text" />
              <input placeholder="Anthropic API Key" value={form.anthropic_api_key} onChange={e => setForm({ ...form, anthropic_api_key: e.target.value })}
                className="w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-2.5 text-sm text-ovni-text" />
              <select value={form.plan_id} onChange={e => setForm({ ...form, plan_id: e.target.value })}
                className="w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-2.5 text-sm text-ovni-text">
                <option value="starter">Starter ($149/mes)</option>
                <option value="pro">Pro ($399/mes)</option>
                <option value="enterprise">Enterprise ($999/mes)</option>
              </select>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 border border-ovni-border text-ovni-muted py-2 rounded-lg text-sm hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={createMutation.isPending}
                  className="flex-1 bg-ovni-accent text-white py-2 rounded-lg text-sm hover:bg-ovni-accent/80 disabled:opacity-50">
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
