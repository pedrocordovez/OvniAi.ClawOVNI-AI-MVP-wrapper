import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

export function useInstances(status?: string) {
  const params = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: ["instances", status],
    queryFn: () => apiFetch<{ instances: any[] }>(`/admin/instances${params}`),
    refetchInterval: 15_000, // auto-refresh every 15s
  });
}

export function useInstanceDetail(id: string) {
  return useQuery({
    queryKey: ["instance", id],
    queryFn: () => apiFetch<any>(`/admin/instances/${id}`),
    enabled: !!id,
    refetchInterval: 10_000,
  });
}

export function useInstanceLogs(id: string) {
  return useQuery({
    queryKey: ["instance-logs", id],
    queryFn: () => apiFetch<{ logs: string }>(`/admin/instances/${id}/logs?tail=50`),
    enabled: !!id,
  });
}

export function useProvisionInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { tenant_id: string; channels?: Record<string, unknown>; software_stack?: Record<string, unknown> }) =>
      apiFetch("/admin/instances/provision", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}

export function useInstanceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" | "stop" | "restart" | "pause" }) =>
      apiFetch(`/admin/instances/${id}/${action}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}

export function useDestroyInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/instances/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instances"] }),
  });
}

export function useVaultKeys() {
  return useQuery({
    queryKey: ["vault-keys"],
    queryFn: () => apiFetch<{ keys: any[] }>("/admin/vault/keys"),
  });
}

export function useStoreVaultKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { label: string; api_key: string }) =>
      apiFetch("/admin/vault/keys", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vault-keys"] }),
  });
}
