import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import {
  DISCOUNT_ID_LABELS,
  calculateRetailLine,
  cleanCustomerIdNumber,
  cleanCustomerMobile,
  cleanCustomerName,
  customerDiscountToPos,
  customerIdNumberError,
  customerMobileError,
  customerNameError,
  type CustomerDiscount,
} from "@workspace/api-zod";
import { deleteCustomer, saveUsualItems, updateCustomer, type Customer } from "@/lib/customer-api";
import { safeError } from "@/lib/feedback";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import type { ProductItem } from "@/lib/types";
import { CustomerDiscountBadge, initialsOf } from "./find-customer-dialog";

const cents = (price: string) => BigInt(Math.round((parseFloat(price.replace(/[^0-9.]/g, "")) || 0) * 100));
const peso = (value: bigint) => `₱${(Number(value) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "Not recorded";

/**
 * Phase 2b: a returning customer's profile, opened from the POS customer bar.
 * Shows and edits their details and usual order, and deletes the profile (past sales stay).
 */
export function CustomerProfilePanel({ customer, products, onClose, onUpdated, onDeleted, onToast }: {
  customer: Customer | null;
  products: ProductItem[];
  onClose: () => void;
  onUpdated: (customer: Customer) => void;
  onDeleted: (customer: Customer) => void;
  onToast: (message: string) => void;
}) {
  const open = !!customer;
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ name: "", mobile: "", discountType: "Regular" as CustomerDiscount, idNumber: "" });
  const [usual, setUsual] = useState<{ productId: string; quantity: number }[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<"" | "details" | "usual" | "delete">("");
  const [error, setError] = useState("");
  useDialogAccessibility(open, ".customer-profile-panel", () => { if (!busy) onClose(); }, !!busy);

  useEffect(() => {
    if (!customer) return;
    setEditing(false); setConfirmDelete(false); setError(""); setAddSearch(""); setBusy("");
    setDetails({ name: customer.name, mobile: customer.mobile ?? "", discountType: customer.discountType, idNumber: customer.idNumber ?? "" });
    setUsual(customer.usualItems.map((item) => ({ ...item })));
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const matches = useMemo(() => {
    const text = addSearch.trim().toLowerCase();
    if (!text) return [];
    return products
      .filter((product) => !product.isDangerousDrug && !usual.some((item) => item.productId === product.id))
      .filter((product) => [product.name, product.genericName ?? "", product.sku].some((value) => value.toLowerCase().includes(text)))
      .slice(0, 6);
  }, [addSearch, products, usual]);
  if (!customer) return null;

  const pos = customerDiscountToPos(customer.discountType);
  const usualChanged = JSON.stringify(usual) !== JSON.stringify(customer.usualItems);
  const estimate = usual.reduce((total, item) => {
    const product = productById.get(item.productId);
    if (!product || typeof product.isVatExempt !== "boolean") return total;
    return total + calculateRetailLine(cents(product.price), item.quantity, product.isVatExempt, pos !== "None").net;
  }, 0n);
  const nameProblem = customerNameError(cleanCustomerName(details.name));
  const mobileProblem = customerMobileError(cleanCustomerMobile(details.mobile));
  const idProblem = customerIdNumberError(details.discountType, cleanCustomerIdNumber(details.idNumber));
  const editPos = customerDiscountToPos(details.discountType);

  async function run(kind: "details" | "usual" | "delete", work: () => Promise<void>) {
    setBusy(kind); setError("");
    try { await work(); } catch (failure) { setError(safeError(failure)); } finally { setBusy(""); }
  }
  const saveDetails = () => run("details", async () => {
    const updated = await updateCustomer(customer.id, { ...details, idNumber: editPos === "None" ? "" : details.idNumber });
    setEditing(false); onUpdated(updated); onToast(`Saved ${updated.name}'s details.`);
  });
  const saveUsual = () => run("usual", async () => {
    const updated = await saveUsualItems(customer.id, usual);
    onUpdated(updated); onToast(`Saved ${updated.name}'s usual order.`);
  });
  const remove = () => run("delete", async () => {
    await deleteCustomer(customer.id);
    onDeleted(customer); onToast(`Deleted ${customer.name}'s profile. Past sales are kept.`);
  });
  const step = (productId: string, change: number) =>
    setUsual((list) => list.map((item) => item.productId === productId ? { ...item, quantity: Math.min(100000, Math.max(1, item.quantity + change)) } : item));

  return (
    <div className="modal-backdrop customer-profile-backdrop" onClick={() => { if (!busy) onClose(); }} style={{ zIndex: 1100 }}>
      <aside className="customer-profile-panel" onClick={(event) => event.stopPropagation()}>
        <div className="customer-profile-head">
          <span className="customer-avatar is-large" aria-hidden="true">{initialsOf(customer.name)}</span>
          <div className="customer-profile-title">
            <h2>{customer.name}</h2>
            <span><CustomerDiscountBadge discountType={customer.discountType} /> Customer since {formatDate(customer.createdAt ?? customer.consentAt)}</span>
          </div>
          <button type="button" className="modal-close" aria-label="Close profile" disabled={!!busy} onClick={onClose}><X size={16} /></button>
        </div>

        {error && <div className="inline-error" role="alert"><span>{error}</span></div>}

        <section className="customer-profile-section" aria-labelledby="profile-details">
          <div className="customer-profile-section-head">
            <h3 id="profile-details">Details</h3>
            {!editing && <button type="button" className="text-button" onClick={() => setEditing(true)}>Edit</button>}
          </div>
          {!editing ? (
            <dl className="customer-profile-details">
              <div><dt>Mobile</dt><dd>{customer.mobile ?? "Not saved"}</dd></div>
              {pos !== "None" && <div><dt>{DISCOUNT_ID_LABELS[pos]}</dt><dd className="is-id">{customer.idNumber ?? "Not saved"}</dd></div>}
              <div><dt>Consent</dt><dd>{customer.consentAt ? `Given ${formatDate(customer.consentAt)}` : "Not recorded"}</dd></div>
            </dl>
          ) : (
            <form className="new-customer-form" onSubmit={(event) => { event.preventDefault(); if (!nameProblem && !mobileProblem && !idProblem) void saveDetails(); }}>
              <div className="customer-field">
                <label htmlFor="profile-name">Full name *</label>
                <input id="profile-name" value={details.name} maxLength={120} aria-invalid={!!nameProblem} onChange={(event) => setDetails({ ...details, name: event.target.value })} />
                {nameProblem && <span className="customer-field-error">{nameProblem}</span>}
              </div>
              <div className="customer-field">
                <label htmlFor="profile-mobile">Mobile number <span className="customer-field-optional">(optional)</span></label>
                <input id="profile-mobile" value={details.mobile} inputMode="tel" aria-invalid={!!mobileProblem} onChange={(event) => setDetails({ ...details, mobile: event.target.value })} />
                {mobileProblem && <span className="customer-field-error">{mobileProblem}</span>}
              </div>
              <div className="customer-field">
                <span className="customer-field-label" id="profile-discount">Discount</span>
                <div role="group" aria-labelledby="profile-discount" className="customer-discount-group">
                  {(["Regular", "Senior Citizen", "PWD"] as const).map((type) => (
                    <button key={type} type="button" aria-pressed={details.discountType === type} className={`button ${details.discountType === type ? "primary-action" : "soft"}`} onClick={() => setDetails({ ...details, discountType: type })}>
                      {type === "Regular" ? "None" : type === "Senior Citizen" ? "Senior" : "PWD"}
                    </button>
                  ))}
                </div>
              </div>
              {editPos !== "None" && (
                <div className="customer-field">
                  <label htmlFor="profile-id">{DISCOUNT_ID_LABELS[editPos]} *</label>
                  <input id="profile-id" value={details.idNumber} maxLength={40} autoCapitalize="characters" spellCheck={false} aria-invalid={!!idProblem} onChange={(event) => setDetails({ ...details, idNumber: event.target.value })} />
                  {idProblem && <span className="customer-field-error">{idProblem}</span>}
                </div>
              )}
              <div className="customer-profile-actions">
                <button type="button" className="button soft" disabled={busy === "details"} onClick={() => { setEditing(false); setDetails({ name: customer.name, mobile: customer.mobile ?? "", discountType: customer.discountType, idNumber: customer.idNumber ?? "" }); }}>Cancel</button>
                <button type="submit" className="button primary-action" disabled={busy === "details" || !!nameProblem || !!mobileProblem || !!idProblem}>{busy === "details" ? "Saving…" : "Save details"}</button>
              </div>
            </form>
          )}
        </section>

        <section className="customer-profile-section" aria-labelledby="profile-usual">
          <div className="customer-profile-section-head">
            <h3 id="profile-usual">Usual order</h3>
            {usual.length > 0 && <span className="customer-field-note">Est. {peso(estimate)} today{pos !== "None" ? ` with ${pos} discount` : ""}</span>}
          </div>
          <ul className="usual-lines">
            {usual.map((item) => {
              const product = productById.get(item.productId);
              return (
                <li key={item.productId}>
                  <span className="usual-line-name">{product?.name ?? "Medicine no longer in inventory"}{product?.requiresPrescription && <span className="rx-tag">Rx</span>}</span>
                  <span className="usual-line-stepper">
                    <button type="button" aria-label={`Decrease usual quantity of ${product?.name ?? "medicine"}`} disabled={item.quantity <= 1} onClick={() => step(item.productId, -1)}><Minus size={13} /></button>
                    <span>{item.quantity}</span>
                    <button type="button" aria-label={`Increase usual quantity of ${product?.name ?? "medicine"}`} onClick={() => step(item.productId, 1)}><Plus size={13} /></button>
                  </span>
                  <button type="button" className="usual-line-remove" aria-label={`Remove ${product?.name ?? "medicine"} from the usual order`} onClick={() => setUsual((list) => list.filter((entry) => entry.productId !== item.productId))}><Trash2 size={14} /></button>
                </li>
              );
            })}
            <li className="usual-line-add">
              <label htmlFor="profile-add-medicine" className="sr-only">Add a medicine to the usual order</label>
              <input id="profile-add-medicine" value={addSearch} placeholder="+ Add a medicine…" autoComplete="off" onChange={(event) => setAddSearch(event.target.value)} />
            </li>
          </ul>
          {matches.length > 0 && (
            <ul className="usual-add-results" aria-label="Matching medicines">
              {matches.map((product) => (
                <li key={product.id}>
                  <button type="button" onClick={() => { setUsual((list) => [...list, { productId: product.id, quantity: 1 }]); setAddSearch(""); }}>
                    <span>{product.name}{product.requiresPrescription && <span className="rx-tag">Rx</span>}</span><span className="customer-field-note">{product.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="customer-field-note">Controlled drugs can't be added. You can also update it from the cart with "Save cart as usual order".</p>
          {usualChanged && (
            <div className="customer-profile-actions">
              <button type="button" className="button soft" disabled={busy === "usual"} onClick={() => setUsual(customer.usualItems.map((item) => ({ ...item })))}>Discard changes</button>
              <button type="button" className="button primary-action" disabled={busy === "usual"} onClick={() => void saveUsual()}>{busy === "usual" ? "Saving…" : "Save usual order"}</button>
            </div>
          )}
        </section>

        <div className="customer-profile-footer">
          {!confirmDelete ? (
            <>
              <button type="button" className="button danger-outline" onClick={() => setConfirmDelete(true)}>Delete customer…</button>
              <p className="customer-field-note">Deleting removes the profile and usual order. Past sales and their Senior/PWD records stay, as BIR requires.</p>
            </>
          ) : (
            <div className="customer-delete-confirm" role="alertdialog" aria-labelledby="delete-question">
              <p id="delete-question"><strong>Delete {customer.name}?</strong> Their profile and usual order will be removed. Past sales stay.</p>
              <div className="customer-profile-actions">
                <button type="button" className="button soft" disabled={busy === "delete"} onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="button danger" disabled={busy === "delete"} onClick={() => void remove()}>{busy === "delete" ? "Deleting…" : "Delete customer"}</button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
