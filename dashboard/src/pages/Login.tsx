import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/admin/tenants?limit=1", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) { login(key); }
      else { setError("Admin key invalida"); }
    } catch { setError("No se pudo conectar al servidor"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 bg-black rounded-[10px] flex items-center justify-center">
            <span className="text-white text-[14px] font-black">O</span>
          </div>
          <span className="text-[18px] font-bold text-gray-900">OVNI AI</span>
          <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Admin</span>
        </div>
        <div className="bg-white rounded-[20px] border border-gray-200 shadow-sm p-8">
          <h1 className="text-[24px] font-extrabold text-gray-900 text-center mb-1">Staff Console</h1>
          <p className="text-[13px] text-gray-400 text-center mb-6">Ingresa tu admin key</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Admin API Key</label>
              <input type="password" value={key} onChange={e => setKey(e.target.value)}
                placeholder="ovni_admin_..."
                className="w-full bg-white border border-gray-200 rounded-[10px] px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400" />
            </div>
            {error && <p className="text-red-500 text-[13px]">{error}</p>}
            <button type="submit" disabled={loading || !key}
              className="w-full bg-black text-white py-3 rounded-[10px] text-[14px] font-semibold hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all">
              {loading ? "Verificando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
