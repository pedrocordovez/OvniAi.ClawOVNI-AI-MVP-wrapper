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
    <div className="min-h-screen bg-[#fafafa]">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-black rounded-[8px] flex items-center justify-center">
                <span className="text-white text-[11px] font-black">O</span>
              </div>
              <span className="text-[15px] font-bold text-gray-900">OVNI AI</span>
              <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full ml-1">Admin</span>
            </div>
            <nav className="flex gap-1">
              {navItems.map(item => (
                <Link key={item.path} to={item.path}
                  className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-all ${
                    location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path))
                      ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  }`}>{item.label}</Link>
              ))}
            </nav>
          </div>
          <button onClick={logout}
            className="text-[13px] text-gray-400 hover:text-red-500 transition-colors">Salir</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
