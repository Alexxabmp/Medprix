import { useEffect, useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import {
  DISCOUNT_ID_LABELS,
  cleanCustomerIdNumber,
  cleanCustomerMobile,
  cleanCustomerName,
  customerDiscountToPos,
  customerIdNumberError,
  customerMobileError,
  customerNameError,
  type CustomerDiscount,
} from "@workspace/api-zod";
import { createCustomer, type Customer } from "@/lib/customer-api";
import { safeError } from "@/lib/feedback";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

export type UsualLine = { productId: string; name: string; quantity: number; controlled: boolean };

/** Saves a returning customer with their consent; the usual order starts from the current cart. */
export function NewCustomerDialog({ open, initial, cartLines, onSaved, onClose, fromRecords = false, inline = false }: {
  open: boolean;
  /** Rendered inside another dialog (the dashboard's Customers window): just the form. */
  inline?: boolean;
  /** Opened from the dashboard's Customers window (no cart): the wording points to the profile for the usual order. */
  fromRecords?: boolean;
  initial: { name: string; discountType: CustomerDiscount; idNumber: string };
  cartLines: UsualLine[];
  onSaved: (customer: Customer) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [discountType, setDiscountType] = useState<CustomerDiscount>("Regular");
  const [idNumber, setIdNumber] = useState("");
  const [lines, setLines] = useState<UsualLine[]>([]);
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState({ name: false, mobile: false, id: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useDialogAccessibility(open && !inline, ".new-customer-dialog", () => { if (!saving) onClose(); }, saving);

  useEffect(() => {
    if (!open) return;
    setName(initial.name); setMobile(""); setDiscountType(initial.discountType); setIdNumber(initial.idNumber);
    setLines(cartLines.filter((line) => !line.controlled)); setConsent(false);
    setTouched({ name: false, mobile: false, id: false }); setError(""); setSaving(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const nameProblem = customerNameError(cleanCustomerName(name));
  const mobileProblem = customerMobileError(cleanCustomerMobile(mobile));
  const idProblem = customerIdNumberError(discountType, cleanCustomerIdNumber(idNumber));
  const controlled = cartLines.filter((line) => line.controlled);
  const canSave = !nameProblem && !mobileProblem && !idProblem && consent && !saving;
  const pos = customerDiscountToPos(discountType);
  const setQuantity = (productId: string, change: number) =>
    setLines((current) => current.map((line) => line.productId === productId ? { ...line, quantity: Math.min(100000, Math.max(1, line.quantity + change)) } : line));

  async function save() {
    setTouched({ name: true, mobile: true, id: true });
    if (!canSave) return;
    setSaving(true); setError("");
    try {
      onSaved(await createCustomer({
        name, mobile, discountType, idNumber: pos === "None" ? "" : idNumber, consent,
        usualItems: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      }));
    } catch (failure) { setError(safeError(failure)); setSaving(false); }
  }

  const form = (
        <form className="new-customer-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="customer-field">
            <label htmlFor="new-customer-name">Full name *</label>
            <input id="new-customer-name" value={name} maxLength={120} autoComplete="off" aria-invalid={touched.name && !!nameProblem}
              onChange={(event) => setName(event.target.value)} onBlur={() => setTouched((t) => ({ ...t, name: true }))} />
            {touched.name && nameProblem && <span className="customer-field-error">{nameProblem}</span>}
          </div>
          <div className="customer-field">
            <label htmlFor="new-customer-mobile">Mobile number <span className="customer-field-optional">(optional, for finding them)</span></label>
            <input id="new-customer-mobile" value={mobile} inputMode="tel" autoComplete="off" placeholder="09XX XXX XXXX" aria-invalid={touched.mobile && !!mobileProblem}
              onChange={(event) => setMobile(event.target.value)} onBlur={() => setTouched((t) => ({ ...t, mobile: true }))} />
            {touched.mobile && mobileProblem && <span className="customer-field-error">{mobileProblem}</span>}
          </div>
          <div className="customer-field">
            <span className="customer-field-label" id="new-customer-discount">Discount</span>
            <div role="group" aria-labelledby="new-customer-discount" className="customer-discount-group">
              {(["Regular", "Senior Citizen", "PWD"] as const).map((type) => (
                <button key={type} type="button" aria-pressed={discountType === type} className={`button ${discountType === type ? "primary-action" : "soft"}`} onClick={() => setDiscountType(type)}>
                  {type === "Regular" ? "None" : type === "Senior Citizen" ? "Senior" : "PWD"}
                </button>
              ))}
            </div>
          </div>
          {pos !== "None" && (
            <div className="customer-field">
              <label htmlFor="new-customer-id">{DISCOUNT_ID_LABELS[pos]} *</label>
              <input id="new-customer-id" value={idNumber} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={touched.id && !!idProblem}
                onChange={(event) => setIdNumber(event.target.value)} onBlur={() => setTouched((t) => ({ ...t, id: true }))} />
              {touched.id && idProblem && <span className="customer-field-error">{idProblem}</span>}
            </div>
          )}

          <div className="customer-field">
            <span className="customer-field-label">Usual order · from the current cart</span>
            {lines.length ? (
              <ul className="usual-lines">
                {lines.map((line) => (
                  <li key={line.productId}>
                    <span className="usual-line-name">{line.name}</span>
                    <span className="usual-line-stepper">
                      <button type="button" aria-label={`Decrease usual quantity of ${line.name}`} disabled={line.quantity <= 1} onClick={() => setQuantity(line.productId, -1)}><Minus size={13} /></button>
                      <span>{line.quantity}</span>
                      <button type="button" aria-label={`Increase usual quantity of ${line.name}`} onClick={() => setQuantity(line.productId, 1)}><Plus size={13} /></button>
                    </span>
                    <button type="button" className="usual-line-remove" aria-label={`Remove ${line.name} from the usual order`} onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="customer-field-note">{fromRecords ? "No usual order yet. After saving, add their regular medicines from their profile." : 'No usual order. You can add one later with "Save cart as usual order".'}</p>}
            {controlled.length > 0 && <p className="customer-field-note">Left out (controlled, needs a new prescription each time): {controlled.map((line) => line.name).join(", ")}.</p>}
          </div>

          <label className="customer-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>The customer agreed to let Med Prix keep their name, ID number and usual medicines for faster checkout. They can ask for this record to be changed or deleted at any time.</span>
          </label>
          {error && <div className="inline-error" role="alert"><span>{error}</span></div>}
          <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="button soft" disabled={saving} onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary-action" disabled={!canSave}>{saving ? "Saving…" : "Save customer"}</button>
          </div>
        </form>
  );
  if (inline) return form;
  return (
    <div className="modal-backdrop" onClick={() => { if (!saving) onClose(); }} style={{ zIndex: 1110 }}>
      <div className="modal dialog new-customer-dialog" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 520, width: "94%" }}>
        <div className="modal-header">
          <div>
            <h2>{fromRecords ? "Add customer" : "Save returning customer"}</h2>
            <p className="modal-sub">Next time, find them by name, mobile or ID.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" disabled={saving} onClick={onClose}><X size={16} /></button>
        </div>
        {form}
      </div>
    </div>
  );
}
