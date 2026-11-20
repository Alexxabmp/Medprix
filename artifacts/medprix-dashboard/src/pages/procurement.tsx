import { useCallback, useEffect, useMemo, useState } from "react";
import { SourceProgress } from "@/components/custom-ui/source-state";
import { ChevronLeft, ChevronRight, Package, Plus, RefreshCw, Search } from "lucide-react";
import { SUPPLIER_TERMS_LABEL, type SupplierTerms } from "@workspace/api-zod";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { SelectField } from "@/components/custom-ui/select-field";
import { OrderPanel } from "@/components/procurement/order-panel";
import { OrderEditor, type SupplierOption } from "@/components/procurement/order-editor";
import { Callout, shortDate } from "@/components/procurement/shared";
import { procurementApi, peso, stageTone, NEXT_STEP_LABEL, type OrderSummary, type OrderStage, getProcurementCache, loadProcurementList } from "@/lib/procurement-api";
import type { ToastFn } from "@/lib/types";

/** The previous procurement screen kept statuses, notes, expiries and payments in this browser only.
 *  Those copies are not real records and could contradict the database, so they are cleared once. */
const LEGACY_PREFIXES = ["medprix_receiving_", "medprix_delivery_note_", "medprix_po_status", "medprix_po_delivery_date_", "medprix_invoice_", "medprix_procurement_"];
function clearLegacyProcurementStorage() {
  try {
    for (const key of Object.keys(localStorage)) if (LEGACY_PREFIXES.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
  } catch { /* storage unavailable: nothing to clear */ }
}

type TaskFilter = "approve" | "send" | "arriving" | "invoice" | "pay";
const PAGE_SIZE = 12;

/**
 * Procurement: organised around the job, not the records. One list of purchase orders,
 * each with its next step; everything about one order (deliveries, invoice, payments,
 * documents, history) opens in its order panel.
 */
export default function ProcurementPage({ onToast, currentRole }: { onToast: ToastFn; currentRole: string }) {
  const isAdmin = currentRole === "Admin";
  // Start from the list kept since the last visit (or prefetched at sign-in), then refresh quietly.
  const [orders, setOrders] = useState<OrderSummary[] | null>(() => getProcurementCache()?.orders ?? null);
  const [today, setToday] = useState(() => getProcurementCache()?.today ?? "");
  const [suppliers, setSuppliers] = useState<SupplierOption[]>(() => getProcurementCache()?.suppliers ?? []);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [taskFilter, setTaskFilter] = useState<TaskFilter | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await loadProcurementList();
      setOrders(fresh.orders); setToday(fresh.today); setSuppliers(fresh.suppliers);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error && e.message !== "suppliers" ? e.message : "Could not load purchase orders. Check your connection and refresh.");
    } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { clearLegacyProcurementStorage(); void load(); }, [load]);

  const counts = useMemo(() => {
    const list = orders ?? [];
    const waiting = list.filter(o => o.stage === "Sent" || o.stage === "Partly received");
    const owed = list.filter(o => Number(o.balance) > 0);
    return {
      approve: list.filter(o => o.stage === "For approval").length,
      send: list.filter(o => o.stage === "Approved").length,
      arriving: waiting.length, late: waiting.filter(o => o.late).length,
      invoice: list.filter(o => o.nextStep === "invoice" || o.nextStep === "verify").length,
      pay: owed.length, owed: owed.reduce((s, o) => s + Number(o.balance), 0),
      overdue: owed.filter(o => o.overdue).reduce((s, o) => s + Number(o.balance), 0),
    };
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders ?? []).filter(o => {
      if (q && !`${o.poNumber} ${o.supplier}`.toLowerCase().includes(q)) return false;
      if (taskFilter) {
        switch (taskFilter) {
          case "approve": if (o.stage !== "For approval" && o.stage !== "Draft") return false; break;
          case "send": if (o.stage !== "Approved") return false; break;
          case "arriving": if (o.stage !== "Sent" && o.stage !== "Partly received") return false; break;
          case "invoice": if (o.nextStep !== "invoice" && o.nextStep !== "verify") return false; break;
          case "pay": if (!(Number(o.balance) > 0)) return false; break;
        }
      } else if (statusFilter !== "all") {
        if (o.stage !== statusFilter) return false;
      }
      return true;
    });
  }, [orders, taskFilter, statusFilter, search]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const shown = visible.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const chooseTask = (next: TaskFilter) => {
    setTaskFilter(current => (current === next ? null : next));
    setStatusFilter("all");
    setPage(1);
  };

  const afterChange = (message?: string, warnings: string[] = []) => {
    if (message) onToast({ message, variant: warnings.length ? "warning" : "success" });
    for (const w of warnings) onToast({ message: w, variant: "warning" });
    void load();
  };

  const tasks: { id: TaskFilter; label: string; value: number; caption: string; tone?: string }[] = [
    { id: "approve", label: "Needs approval", value: counts.approve, caption: "Check quantities and cost", tone: counts.approve ? "warn" : "" },
    { id: "send", label: "Ready to send", value: counts.send, caption: "Approved, not yet with the supplier", tone: "success" },
    { id: "arriving", label: "Waiting for delivery", value: counts.arriving, caption: counts.late ? `${counts.late} late` : "Receive when it arrives", tone: counts.late ? "warn" : "success" },
    { id: "invoice", label: "Invoices to record", value: counts.invoice, caption: "Received, not yet billed or checked", tone: "success" },
    { id: "pay", label: "We owe", value: counts.pay, caption: counts.overdue ? `${peso(counts.overdue)} overdue` : counts.pay ? `${peso(counts.owed)} open` : "Nothing owed", tone: counts.overdue ? "danger" : "" },
  ];

  return (
    <div className="procurement-page">
      <PageHeading title="Procurement" description="Order from suppliers, receive deliveries, and keep track of what we owe."
        action={<div className="proc-heading-actions">
          <button type="button" className="button soft" onClick={() => void load()} disabled={refreshing} aria-label="Refresh orders"><RefreshCw size={14} className={refreshing ? "spin" : ""} /> Refresh</button>
          <button type="button" className="button primary-action" data-testid="button-create-po" onClick={() => setCreating(true)}><Plus size={14} /> New purchase order</button>
        </div>} />

      {loadError && <Callout tone="danger">{loadError}{orders ? " The list below may be out of date." : ""} <button type="button" className="proc-link" onClick={() => void load()}>Retry</button></Callout>}

      <div className="proc-tasks" role="group" aria-label="What needs doing">
        {tasks.map(t => (
          <button key={t.id} type="button" className={`proc-task ${t.tone ?? ""}${taskFilter === t.id ? " active" : ""}`} aria-pressed={taskFilter === t.id} onClick={() => chooseTask(t.id)}>
            <span className="proc-task-label">{t.label}</span>
            <span className="proc-task-value">{orders ? t.value : "—"}</span>
            <span className="proc-task-caption">{orders ? t.caption : "Loading…"}</span>
          </button>
        ))}
      </div>

      <section className="surface-card table-card">
        <div className="table-tools">
          <div className="search-wrap">
            <Search size={15} aria-hidden="true" />
            <input type="search" aria-label="Search purchase orders" placeholder="Search PO number or supplier" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="table-tools-right">
            <SelectField
              className="select"
              aria-label="Filter purchase orders by status"
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setTaskFilter(null);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="For approval">For approval</option>
              <option value="Approved">Approved</option>
              <option value="Sent">Sent</option>
              <option value="Partly received">Partly received</option>
              <option value="Received">Received</option>
              <option value="Closed short">Closed short</option>
              <option value="Cancelled">Cancelled</option>
            </SelectField>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table proc-orders">
            <thead><tr><th>Order</th><th>Supplier</th><th>Ordered</th><th className="num">Total</th><th>Progress</th><th>Status</th><th className="table-action-head">Next step</th></tr></thead>
            <tbody>
              {!orders && !loadError && <tr><td colSpan={7} className="proc-loading-cell"><SourceProgress label="Loading purchase orders…" /></td></tr>}
              {orders && shown.length === 0 && <tr><TableEmptyState colSpan={7} icon={Package}>{search || statusFilter !== "all" || taskFilter ? "No orders match the selected filter." : "No purchase orders yet. Create the first one."}</TableEmptyState></tr>}
              {shown.map(o => {
                const pct = o.unitsOrdered ? Math.min(100, Math.round((o.unitsReceived / o.unitsOrdered) * 100)) : 0;
                return (
                  <tr key={o.id} className="proc-row" onClick={() => setOpenId(o.id)}>
                    <td><button type="button" className="proc-row-link" onClick={e => { e.stopPropagation(); setOpenId(o.id); }}><strong>{o.poNumber}</strong></button>
                      <div className="muted proc-small">{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</div></td>
                    <td>{o.supplier}<div className="muted proc-small">{SUPPLIER_TERMS_LABEL[o.paymentTerms]}</div></td>
                    <td className="muted">{shortDate(o.orderDate)}{o.expectedDeliveryDate && ["Sent", "Approved"].includes(o.stage) && <div className={`proc-small ${o.late ? "proc-warn-text" : ""}`}>{o.late ? "Late · " : "Exp. "}{shortDate(o.expectedDeliveryDate)}</div>}</td>
                    <td className="num"><strong>{peso(o.totalOrderAmount)}</strong>{Number(o.balance) > 0 && <div className={`proc-small ${o.overdue ? "proc-danger-text" : "muted"}`}>{peso(o.balance)} owed{o.overdue ? " · overdue" : ""}</div>}</td>
                    <td>{["Draft", "For approval", "Approved", "Cancelled"].includes(o.stage) ? <span className="muted">—</span> : (
                      <div className="proc-progress" title={`${o.unitsReceived} of ${o.unitsOrdered} units received`}>
                        <div className="proc-progress-track"><span style={{ width: `${pct}%` }} /></div>
                        <span className="proc-small muted">{o.unitsReceived}/{o.unitsOrdered}</span>
                      </div>)}</td>
                    <td><span className={stageTone(o.stage)}>{o.stage}</span>{o.pendingInvoices > 0 && <div className="proc-small muted">{o.pendingInvoices} invoice pending</div>}</td>
                    <td className="table-action-cell" onClick={e => e.stopPropagation()}>
                      {o.nextStep
                        ? <button type="button" className={`button ${["approve", "receive", "pay"].includes(o.nextStep) ? "primary-action" : "soft"} proc-next`} onClick={() => setOpenId(o.id)}>{NEXT_STEP_LABEL[o.nextStep]}</button>
                        : <button type="button" className="button soft proc-next" onClick={() => setOpenId(o.id)}>View</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-pagination" role="navigation" aria-label="Purchase orders pages">
          <span className="muted">{orders ? `${visible.length} order${visible.length === 1 ? "" : "s"}${today ? ` · as of ${shortDate(today)}` : ""}` : "Loading…"}</span>
          <button type="button" className="button soft table-action-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15} /></button>
          <span className="muted">Page {Math.min(page, pages)} of {pages}</span>
          <button type="button" className="button soft table-action-btn" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={15} /></button>
        </div>
      </section>

      {creating && <OrderEditor suppliers={suppliers} onClose={() => setCreating(false)}
        onSaved={(detail, message) => { setCreating(false); afterChange(message); setOpenId(detail.order.id); }} />}
      {openId && <OrderPanel key={openId} orderId={openId} isAdmin={isAdmin} suppliers={suppliers} onClose={() => setOpenId(null)} onChanged={afterChange} />}
    </div>
  );
}
