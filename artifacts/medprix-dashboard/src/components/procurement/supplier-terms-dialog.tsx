import { useState } from "react";
import {
  SUPPLIER_TERMS, SUPPLIER_TERMS_LABEL, SUPPLIER_TERMS_BASES, SUPPLIER_TERMS_BASIS_LABEL, describeSupplierTerms, supplierDueDate,
  normalizeSupplierTerms, type SupplierTerms, type SupplierTermsBasis,
} from "@workspace/api-zod";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { procurementApi } from "@/lib/procurement-api";
import { Callout, Chips, shortDate, todayManila, useSave } from "./shared";

/** Terms picker used by the supplier form and the terms editor: five options + where the due date counts from. */
export function TermsFields({ terms, basis, onTerms, onBasis, disabled }: {
  terms: SupplierTerms | ""; basis: SupplierTermsBasis; onTerms: (t: SupplierTerms) => void; onBasis: (b: SupplierTermsBasis) => void; disabled?: boolean;
}) {
  const example = todayManila();
  return (
    <div className="proc-terms-fields">
      <Chips legend="Payment terms" name="supplier-terms" value={terms} onChange={onTerms} disabled={disabled}
        options={SUPPLIER_TERMS.map(t => ({ value: t, label: SUPPLIER_TERMS_LABEL[t] }))} />
      <Chips legend="Due date counts from" name="supplier-terms-basis" value={basis} onChange={onBasis} disabled={disabled}
        options={SUPPLIER_TERMS_BASES.map(b => ({ value: b, label: b === "InvoiceDate" ? "Invoice date" : "Delivery date" }))} />
      {terms && <span className="field-hint">{describeSupplierTerms(terms, basis)} Example: dated {shortDate(example)} → due {shortDate(supplierDueDate(terms, example))}.</span>}
    </div>
  );
}

/** Admin-only: change a supplier's agreed terms. Existing invoices keep their due dates. */
export function SupplierTermsDialog({ supplier, onClose, onSaved }: {
  supplier: { id: string; name: string; paymentTerms?: string | null; termsBasis?: string | null }; onClose: () => void; onSaved: () => void;
}) {
  const [terms, setTerms] = useState<SupplierTerms | "">(normalizeSupplierTerms(supplier.paymentTerms) ?? "");
  const [basis, setBasis] = useState<SupplierTermsBasis>(supplier.termsBasis === "DeliveryDate" ? "DeliveryDate" : "InvoiceDate");
  const save = useSave();
  async function submit() {
    if (!terms) return;
    const result = await save.run(() => procurementApi.updateSupplierTerms(supplier.id, terms, basis));
    if (result) { onSaved(); onClose(); }
  }
  return (
    <WholesaleDialog title="Payment terms" description={supplier.name} busy={save.busy} close={onClose} className="proc-dialog"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Cancel</button>
        <button type="button" className="button primary-action" onClick={submit} disabled={save.busy || !terms}>{save.busy ? "Saving…" : "Save terms"}</button>
      </>}>
      <TermsFields terms={terms} basis={basis} onTerms={setTerms} onBasis={setBasis} disabled={save.busy} />
      <Callout tone="info">Changing terms only affects invoices recorded after the change. Existing invoices keep their due dates. {SUPPLIER_TERMS_BASIS_LABEL[basis] === "delivery date" ? "Invoices billed before delivery get their due date when the goods arrive." : ""}</Callout>
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}
