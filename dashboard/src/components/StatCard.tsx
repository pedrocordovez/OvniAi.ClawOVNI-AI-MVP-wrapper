export default function StatCard({
  label, value, sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-ovni-surface border border-ovni-border rounded-xl p-5">
      <p className="text-xs text-ovni-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-ovni-text">{value}</p>
      {sub && <p className="text-xs text-ovni-muted mt-1">{sub}</p>}
    </div>
  );
}
