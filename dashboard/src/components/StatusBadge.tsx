const colorMap: Record<string, string> = {
  active:    "bg-green-500/15 text-green-400 border-green-500/20",
  open:      "bg-green-500/15 text-green-400 border-green-500/20",
  paid:      "bg-green-500/15 text-green-400 border-green-500/20",
  draft:     "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  pending:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  finalized: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  sent:      "bg-blue-500/15 text-blue-400 border-blue-500/20",
  closed:    "bg-ovni-muted/15 text-ovni-muted border-ovni-muted/20",
  void:      "bg-red-500/15 text-red-400 border-red-500/20",
  inactive:  "bg-red-500/15 text-red-400 border-red-500/20",
  invoiced:  "bg-purple-500/15 text-purple-400 border-purple-500/20",
};

export default function StatusBadge({ status }: { status: string }) {
  const colors = colorMap[status] ?? "bg-white/10 text-ovni-muted border-white/10";
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors}`}>
      {status}
    </span>
  );
}
