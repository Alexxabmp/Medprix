import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SUPPLIER_TERMS_LABEL, type SupplierTerms } from "@workspace/api-zod";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { SelectField } from "@/components/custom-ui/select-field";
import { DateField } from "@/components/custom-ui/date-field";
import { fetchInventoryData } from "@/lib/pharmacy-store";
import type { ProductItem } from "@/lib/types";
import { procurementApi, peso, type OrderDetail } from "@/lib/procurement-api";
import { Callout, Field, moneyInput, todayManila, useSave } from "./shared";

export type SupplierOption = { id: string; name: string; paymentTerms: SupplierTerms };
type Line = { key: string; productId: string; quantity: string; unitCost: string };
const blankLine = (): Line => ({ key: crypto.randomUUID(), productId: "", quantity: "", unitCost: "0.00" });

/** Create a purchase order, or edit one that hasn't been sent yet. */
export function OrderEditor({ suppliers, existing, onClose, onSaved }: {
  suppliers: SupplierOption[]; existing?: OrderDetail | null; onClose: () => void; onSaved: (detail: OrderDetail, message: string) => void;
}) {
  const editing = Boolean(existing);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productsError, setProductsError] = useState("");
  const [supplierId, setSupplierId] = useState(existing?.order.supplier.id ?? "");
  const [lines, setLines] = useState<Line[]>(existing
    ? existing.lines.map(l => ({
        key: l.productId,
        productId: l.productId,
        quantity: String(l.quantityOrdered),
        unitCost: Number.isNaN(Number(l.unitCost)) ? "0.00" : Number(l.unitCost).toFixed(2),
      }))
    : [blankLine()]);
  const [expected, setExpected] = useState(existing?.order.expectedDeliveryDate ?? "");
  const [notes, setNotes] = useState(existing?.order.notes ?? "");
  const [attempted, setAttempted] = useState(false);
  const save = useSave();

  const loadProducts = () => {
    setProductsError("");
    fetchInventoryData(true).then(list => setProducts(list ?? [])).catch(() => setProductsError("Could not load medicines. Try again."));
  };
  useEffect(loadProducts, []);

  const supplier = suppliers.find(s => s.id === supplierId);
  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const lineProblems = lines.map((l, i) => {
    if (!l.productId) return "Choose a medicine.";
    if (lines.findIndex(x => x.productId === l.productId) !== i) return "This medicine is already on the order.";
    if (!/^\d+$/.test(l.quantity) || Number(l.quantity) < 1) return "Enter a quantity of at least 1.";
    if (!/^\d+(\.\d{1,2})?$/.test(l.unitCost) || Number.isNaN(Number(l.unitCost))) return "Enter the unit cost.";
    return "";
  });
  const valid = Boolean(supplierId) && lineProblems.every(p => !p) && (!expected || expected >= todayManila() || editing);
  const original = existing ? existing.lines.map(l => `${l.productId}:${l.quantityOrdered}:${(Number(l.unitCost) || 0).toFixed(2)}`).sort().join("|") : "";
  const changedLines = existing ? lines.map(l => `${l.productId}:${Number(l.quantity)}:${(Number(l.unitCost) || 0).toFixed(2)}`).sort().join("|") !== original : true;
  const needsReapproval = existing?.order.status === "Approved" && changedLines;

  const productChoices = useMemo(() => products.map(p => ({
    id: p.id,
    label: `${p.name} (${p.sku})`,
    cost: p.cost && !Number.isNaN(Number(p.cost)) ? Number(p.cost).toFixed(2) : "0.00",
  })), [products]);

  function setLine(index: number, patch: Partial<Line>) {
    setLines(current => current.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, ...patch };
      if (patch.productId) {
        const rawCost = productChoices.find(p => p.id === patch.productId)?.cost;
        const parsed = Number(rawCost);
        next.unitCost = (rawCost && !Number.isNaN(parsed) && parsed > 0) ? parsed.toFixed(2) : "0.00";
      }
      if (next.unitCost === "NaN" || !next.unitCost) {
        next.unitCost = "0.00";
      }
      return next;
    }));
  }

  async function submit(submitForApproval: boolean) {
    setAttempted(true);
    if (!valid) return;
    const items = lines.map(l => ({ productId: l.productId, quantityOrdered: Number(l.quantity), unitCost: l.unitCost }));
    const detail = await save.run(() => existing
      ? procurementApi.updateOrder(existing.order.id, { items, expectedDeliveryDate: expected || null, notes })
      : procurementApi.createOrder({ supplierId, items, expectedDeliveryDate: expected || null, notes, submit: submitForApproval }));
    if (!detail) return;
    onSaved(detail, existing
      ? needsReapproval ? `${detail.order.poNumber} saved. It needs approval again because the lines changed.` : `${detail.order.poNumber} saved.`
      : submitForApproval ? `${detail.order.poNumber} created and sent for approval.` : `${detail.order.poNumber} saved as a draft.`);
  }

  return (
    <WholesaleDialog
      title={editing ? `Edit ${existing!.order.poNumber}` : "New purchase order"}
      description={editing ? existing!.order.supplier.name : "Choose the supplier and what to order. You can save a draft and finish later."}
      busy={save.busy} close={onClose} className="proc-dialog proc-dialog-wide"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Cancel</button>
        {editing ? (
          <button type="button" className="button primary-action" onClick={() => submit(false)} disabled={save.busy}>{save.busy ? "Saving…" : "Save changes"}</button>
        ) : (<>
          <button type="button" className="button soft" onClick={() => submit(false)} disabled={save.busy}>Save draft</button>
          <button type="button" className="button primary-action" onClick={() => submit(true)} disabled={save.busy}>{save.busy ? "Saving…" : "Send for approval"}</button>
        </>)}
      </>}
    >
      <div className="form-grid">
        <Field id="po-supplier" label="Supplier" error={attempted && !supplierId ? "Choose a supplier." : save.fieldErrors.supplierId}
          hint={supplier ? `Terms: ${SUPPLIER_TERMS_LABEL[supplier.paymentTerms]} (set on the supplier)` : undefined}>
          <SelectField id="po-supplier" searchable pickerLabel="Supplier" value={supplierId} disabled={editing}
            onChange={e => setSupplierId(e.target.value)} aria-invalid={attempted && !supplierId}>
            <option value="">Choose a supplier</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
        </Field>
        <Field id="po-expected" label="Expected delivery" optional hint="When the supplier said they'd deliver."
          error={attempted && expected && expected < todayManila() && !editing ? "Choose today or a later date." : save.fieldErrors.expectedDeliveryDate}>
          <DateField id="po-expected" value={expected} min={editing ? undefined : todayManila()} onChange={e => setExpected(e.target.value)} />
        </Field>
      </div>

      <div className="proc-section-head"><h3>What to order</h3><span className="muted">{lines.length} line{lines.length === 1 ? "" : "s"}</span></div>
      {productsError && <Callout tone="danger">{productsError} <button type="button" className="proc-link" onClick={loadProducts}>Retry</button></Callout>}
      <div className="proc-order-lines">
        <div className="proc-order-line proc-order-line-head" aria-hidden="true">
          <span>Medicine</span>
          <span>Quantity</span>
          <span>Unit cost</span>
          <span className="proc-col-total">Line total</span>
          <span />
        </div>
        {lines.map((line, index) => (
          <div className="proc-order-line" key={line.key}>
            <div>
              <SelectField searchable pickerLabel="Medicine" aria-label={`Medicine, line ${index + 1}`} value={line.productId}
                optionsLoading={!products.length && !productsError} onChange={e => setLine(index, { productId: e.target.value })}>
                <option value="">Choose a medicine</option>
                {productChoices.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </SelectField>
              {attempted && lineProblems[index] && <span className="field-error" role="alert">{lineProblems[index]}</span>}
            </div>
            <input aria-label={`Quantity, line ${index + 1}`} inputMode="numeric" value={line.quantity} placeholder="0"
              aria-invalid={attempted && (!/^\d+$/.test(line.quantity) || Number(line.quantity) < 1)}
              onChange={e => setLine(index, { quantity: e.target.value.replace(/\D/g, "").slice(0, 7) })} />
            <div className={`proc-money-input ${attempted && (!/^\d+(\.\d{1,2})?$/.test(line.unitCost) || Number.isNaN(Number(line.unitCost))) ? "has-error" : ""}`}>
              <span>₱</span>
              <input aria-label={`Unit cost, line ${index + 1}`} inputMode="decimal"
                value={line.unitCost === "NaN" || !line.unitCost ? "0.00" : line.unitCost} placeholder="0.00"
                onChange={e => setLine(index, { unitCost: moneyInput(e.target.value) })} />
            </div>
            <strong className="proc-line-total">{peso((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))}</strong>
            <button type="button" className="button soft proc-line-remove" aria-label={`Remove line ${index + 1}`}
              disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <div className="proc-order-foot">
        <button type="button" className="button soft" onClick={() => setLines(current => [...current, blankLine()])} disabled={lines.length >= 100}><Plus size={14} /> Add medicine</button>
        <div className="proc-order-total"><span>Order total</span><strong>{peso(total)}</strong></div>
      </div>

      <Field id="po-notes" label="Notes for the supplier" optional full error={save.fieldErrors.notes} hint="Printed on the purchase order.">
        <textarea id="po-notes" rows={2} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} />
      </Field>
      {needsReapproval && <Callout tone="warning">This order is already approved. Saving changed quantities or costs sends it back for approval.</Callout>}
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}
