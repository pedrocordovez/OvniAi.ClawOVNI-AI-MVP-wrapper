export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("es-PA", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString("es-PA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
