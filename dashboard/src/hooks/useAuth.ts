import { useState, useCallback } from "react";

const KEY = "ovni_admin_key";

export function useAuth() {
  const [key, setKeyState] = useState(() => localStorage.getItem(KEY) ?? "");

  const isAuthenticated = key.startsWith("ovni_admin_");

  const login = useCallback((adminKey: string) => {
    localStorage.setItem(KEY, adminKey);
    setKeyState(adminKey);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY);
    setKeyState("");
  }, []);

  return { key, isAuthenticated, login, logout };
}

export function getAdminKey(): string {
  return localStorage.getItem(KEY) ?? "";
}
