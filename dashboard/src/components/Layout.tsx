import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { ReactNode } from "react";

const navItems = [
  { path: "/",          label: "Dashboard" },
  { path: "/tenants",   label: "Tenants" },
  { path: "/instances", label: "Instances" },
  { path: "/invoices",  label: "Invoices" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div className="flex h-screen bg-ovni-bg">
      {/* Sidebar */}
      <aside className="w-64 bg-ovni-surface border-r border-ovni-border flex flex-col">
        <div className="p-6 border-b border-ovni-border">
          <h1 className="text-xl font-bold">
            OVNI <span className="text-ovni-accent">AI</span>
          </h1>
          <p className="text-xs text-ovni-muted mt-1">Staff Console</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-4 py-2.5 rounded-lg text-sm transition-colors ${
                location.pathname === item.path
                  ? "bg-ovni-accent/10 text-ovni-accent font-medium"
                  : "text-ovni-muted hover:text-ovni-text hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-ovni-border">
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-sm text-ovni-muted hover:text-red-400 transition-colors text-left"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}
