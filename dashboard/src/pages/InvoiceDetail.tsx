import { useParams } from "react-router-dom";
import { useInvoiceDetail, useFinalizeInvoice, useSendInvoice, useMarkPaid, useVoidInvoice } from "../api/invoices";
import StatusBadge from "../components/StatusBadge";
import { formatCents, formatDate } from "../utils/format";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading } = useInvoiceDetail(id!);
  const finalizeMutation = useFinalizeInvoice();
  const sendMutation = useSendInvoice();
  const markPaidMutation = useMarkPaid();
  const voidMutation = useVoidInvoice();

  if (isLoading) return <p className="text-ovni-muted">Cargando factura...</p>;
  if (!invoice) return <p className="text-red-400">Factura no encontrada</p>;

  const actions: Record<string, { label: string; action: () => void; color: string }> = {
    draft:     { label: "Finalizar", action: () => finalizeMutation.mutate(id!), color: "bg-blue-500/20 text-blue-400" },
    finalized: { label: "Enviar",    action: () => sendMutation.mutate(id!),     color: "bg-ovni-accent/20 text-ovni-accent" },
    sent:      { label: "Marcar pagada", action: () => markPaidMutation.mutate(id!), color: "bg-green-500/20 text-green-400" },
  };

  const currentAction = actions[invoice.status];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold font-mono">{invoice.invoice_number}</h2>
          <p className="text-ovni-muted text-sm mt-1">{invoice.tenant_name} &middot; {formatDate(invoice.created_at)}</p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      {/* Line items */}
      <div className="bg-ovni-surface border border-ovni-border rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Items</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ovni-muted text-left border-b border-ovni-border">
              <th className="pb-3 font-medium">Descripcion</th>
              <th className="pb-3 font-medium">Tipo</th>
              <th className="pb-3 font-medium text-right">Cantidad</th>
              <th className="pb-3 font-medium text-right">Precio Unit.</th>
              <th className="pb-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items?.map((item: any) => (
              <tr key={item.id} className="border-b border-ovni-border/50">
                <td className="py-3">{item.description}</td>
                <td className="py-3"><StatusBadge status={item.type} /></td>
                <td className="py-3 text-right">{item.quantity}</td>
                <td className="py-3 text-right">{formatCents(item.unit_price_cents)}</td>
                <td className="py-3 text-right font-medium">{formatCents(item.total_cents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ovni-border">
              <td colSpan={4} className="py-3 text-right font-medium">Subtotal</td>
              <td className="py-3 text-right">{formatCents(invoice.subtotal_cents)}</td>
            </tr>
            {invoice.tax_cents > 0 && (
              <tr>
                <td colSpan={4} className="py-1 text-right text-ovni-muted">Impuestos</td>
                <td className="py-1 text-right">{formatCents(invoice.tax_cents)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={4} className="py-3 text-right text-lg font-bold">Total</td>
              <td className="py-3 text-right text-lg font-bold text-ovni-purple">{formatCents(invoice.total_cents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {currentAction && (
          <button
            onClick={currentAction.action}
            className={`${currentAction.color} px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-80`}
          >
            {currentAction.label}
          </button>
        )}
        {invoice.status !== "void" && invoice.status !== "paid" && (
          <button
            onClick={() => voidMutation.mutate(id!)}
            className="bg-red-500/20 text-red-400 px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-80"
          >
            Anular
          </button>
        )}
        <a
          href={`/admin/invoices/${id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/5 text-ovni-muted px-5 py-2.5 rounded-lg text-sm font-medium hover:text-ovni-text"
        >
          Descargar PDF
        </a>
      </div>
    </div>
  );
}
