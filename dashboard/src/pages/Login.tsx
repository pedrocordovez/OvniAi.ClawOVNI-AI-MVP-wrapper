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
      // Validate by calling admin endpoint
      const res = await fetch("/admin/tenants?limit=1", {
        headers: { Authorization: `Bearer ${key}` },
      });

      if (res.ok) {
        login(key);
      } else {
        setError("Admin key invalida");
      }
    } catch {
      setError("No se pudo conectar al servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ovni-bg flex items-center justify-center">
      <div className="bg-ovni-surface border border-ovni-border rounded-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-ovni-text">
            OVNI <span className="text-ovni-accent">AI</span>
          </h1>
          <p className="text-sm text-ovni-muted mt-2">Staff Console</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-ovni-muted mb-2">Admin API Key</label>
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="ovni_admin_..."
              className="w-full bg-ovni-dark border border-ovni-border rounded-lg px-4 py-3 text-ovni-text placeholder-ovni-muted/50 focus:outline-none focus:border-ovni-accent"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key}
            className="w-full bg-ovni-accent hover:bg-ovni-accent/80 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? "Verificando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
