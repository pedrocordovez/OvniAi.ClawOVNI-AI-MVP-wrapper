const colorMap: Record<string, string> = {
  active:       "bg-emerald-50 text-emerald-600",
  running:      "bg-emerald-50 text-emerald-600",
  healthy:      "bg-emerald-50 text-emerald-600",
  open:         "bg-emerald-50 text-emerald-600",
  paid:         "bg-emerald-50 text-emerald-600",
  complete:     "bg-emerald-50 text-emerald-600",
  starter:      "bg-gray-100 text-gray-600",
  pro:          "bg-blue-50 text-blue-600",
  enterprise:   "bg-violet-50 text-violet-600",
  draft:        "bg-amber-50 text-amber-600",
  pending:      "bg-amber-50 text-amber-600",
  provisioning: "bg-amber-50 text-amber-600",
  finalized:    "bg-blue-50 text-blue-600",
  sent:         "bg-blue-50 text-blue-600",
  closed:       "bg-gray-100 text-gray-500",
  stopped:      "bg-gray-100 text-gray-500",
  paused:       "bg-gray-100 text-gray-500",
  unknown:      "bg-gray-100 text-gray-400",
  void:         "bg-red-50 text-red-500",
  inactive:     "bg-red-50 text-red-500",
  error:        "bg-red-50 text-red-500",
  unhealthy:    "bg-red-50 text-red-500",
  invoiced:     "bg-violet-50 text-violet-600",
};

export default function StatusBadge({ status }: { status: string }) {
  const colors = colorMap[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${colors}`}>
      {status}
    </span>
  );
}
