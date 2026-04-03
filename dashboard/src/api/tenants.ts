import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

export function useTenants(page = 1, search = "") {
  return useQuery({
    queryKey: ["tenants", page, search],
    queryFn: () => apiFetch<{ tenants: any[]; pagination: any }>(
      `/admin/tenants?page=${page}&limit=20&search=${encodeURIComponent(search)}`
    ),
  });
}

export function useTenantUsage(tenantId: string, days = 30) {
  return useQuery({
    queryKey: ["tenant-usage", tenantId, days],
    queryFn: () => apiFetch<{ usage: any[] }>(
      `/admin/tenants/${tenantId}/usage?days=${days}`
    ),
    enabled: !!tenantId,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/admin/tenants", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/admin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useGenerateKey() {
  return useMutation({
    mutationFn: ({ tenantId, label }: { tenantId: string; label?: string }) =>
      apiFetch<{ api_key: string; key_prefix: string }>(
        `/admin/tenants/${tenantId}/keys`,
        { method: "POST", body: JSON.stringify({ label }) }
      ),
  });
}
