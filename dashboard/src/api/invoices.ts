import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

export function useInvoices(page = 1, status?: string) {
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) params.set("status", status);

  return useQuery({
    queryKey: ["invoices", page, status],
    queryFn: () => apiFetch<{ invoices: any[] }>(`/admin/invoices?${params}`),
  });
}

export function useInvoiceDetail(id: string) {
  return useQuery({
    queryKey: ["invoice", id],
    queryFn: () => apiFetch<any>(`/admin/invoices/${id}`),
    enabled: !!id,
  });
}

export function useBillingPeriods(tenantId?: string) {
  const params = tenantId ? `?tenant_id=${tenantId}` : "";
  return useQuery({
    queryKey: ["billing-periods", tenantId],
    queryFn: () => apiFetch<{ periods: any[] }>(`/admin/billing/periods${params}`),
  });
}

export function useFinalizeInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/invoices/${id}/finalize`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useSendInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/invoices/${id}/send`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/invoices/${id}/mark-paid`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/invoices/${id}/void`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}
