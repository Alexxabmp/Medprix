import { useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { PRODUCT_CODE_HINT, type ProductErrors } from "@workspace/api-zod";
import { emptyProductForm, productFormPayload, type ProductFormValues } from "@/lib/product-form";
import type { ProductItem } from "@/lib/types";

export function ProductDialog({ product, categories, suppliers, onClose, onSaved }: {
  product?: ProductItem;
  categories: string[];
  suppliers: string[];
  onClose: () => void;
  onSaved: (product: ProductItem) => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(() => product ? {
    ...emptyProductForm(), name: product.name, genericName: product.genericName, sku: product.sku,
    category: product.category, price: product.price, costPrice: product.cost ?? "", reorder: String(product.reorder),
    isDangerousDrug: product.isDangerousDrug ?? false,
  } : emptyProductForm());
  const [errors, setErrors] = useState<ProductErrors>({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const prefix = product ? "edit-product" : "add-product";
  const { payload } = productFormPayload(values, product);
  const close = () => { if (!busy.current) onClose(); };

  const showErrors = (next: ProductErrors) => {
    setErrors(next);
    requestAnimationFrame(() => {
      const first = form.current?.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus();
      first?.scrollIntoView({ block: "nearest" });
    });
  };
  const update = (key: keyof ProductFormValues, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "", ...(key === "strength" || key === "medicineForm" ? { name: "" } : {}) }));
    setFailure("");
  };
  const field = (key: keyof ProductFormValues, label: string, options: { type?: string; placeholder?: string; required?: boolean; hint?: string; choices?: string[] } = {}) => {
    const id = `${prefix}-${key}`;
    const props = {
      id, name: key, value: String(values[key]), required: options.required,
      "aria-invalid": Boolean(errors[key]),
      "aria-describedby": [options.hint ? `${id}-hint` : "", errors[key] ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update(key, event.target.value),
    };
    return <div className="field" key={key}>
      <label htmlFor={id}>{label} {options.required ? "*" : "(optional)"}</label>
      {options.choices ? <select {...props}>
        <option value="">Select {label.toLowerCase()}</option>
        {[...new Set([...options.choices, ...(values[key] ? [String(values[key])] : [])])].filter(Boolean).map((choice) => <option key={choice} value={choice}>{choice}</option>)}
      </select> : <input {...props} type={options.type ?? "text"} placeholder={options.placeholder} />}
      {options.hint && <span id={`${id}-hint`} className="field-hint">{options.hint}</span>}
      {errors[key] && <span id={`${id}-error`} className="product-field-error">{errors[key]}</span>}
    </div>;
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const result = productFormPayload(values, product);
    if (Object.keys(result.errors).length) { showErrors(result.errors); return; }
    showErrors({});
    setFailure("");
    busy.current = true;
    setSaving(true);
    try {
      const response = await fetch(product ? `/api/inventory/products/${product.id}` : "/api/inventory/products", {
        method: product ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data?.product) {
        setFailure(data?.error || "The product could not be saved. Check your entries and try again.");
        showErrors(data?.errors ?? {});
        return;
      }
      onSaved(data.product);
      busy.current = false;
      onClose();
    } catch {
      setFailure("We couldn't confirm the save. Check your connection and the product list before retrying.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-backdrop">
        <Dialog.Content className="modal product-form-modal" data-testid={`modal-${product ? "edit" : "add"}-product`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.querySelector<HTMLButtonElement>(`[data-testid="${product ? `button-more-action-${product.id}` : "button-add-product"}"]`)?.focus();
          }}
          onEscapeKeyDown={(event) => { if (busy.current) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}>
          <div className="modal-header">
            <div>
              <Dialog.Title asChild><h2>{product ? "Update Product Information" : "Add New Product"}</h2></Dialog.Title>
              <Dialog.Description className="modal-sub">{product ? "Update details and reorder level." : "Register a product, with optional initial stock."} Fields marked * are required.</Dialog.Description>
            </div>
            <button type="button" className="modal-close" aria-label="Close product form" disabled={saving} onClick={close}><X size={16} /></button>
          </div>
          <form ref={form} noValidate onSubmit={save} aria-busy={saving} className="product-form-layout">
            <div className="product-form-body">
            <fieldset disabled={saving} className="product-form-fields">
              <div className="form-grid">
                {field("name", product ? "Product name" : "Base product name", { required: true, placeholder: "e.g. Paracetamol" })}
                {field("genericName", "Generic name", { required: true, placeholder: "e.g. Acetaminophen" })}
                {!product && <>
                  {field("strength", "Strength", { placeholder: "e.g. 500mg or 125mg/5mL" })}
                  {field("medicineForm", "Medicine form", { placeholder: "e.g. Tablet or Syrup" })}
                  <div className="product-name-preview field full-width"><span className="field-hint">Saved product name</span><strong>{payload.name || "Enter a product name to preview it here."}</strong></div>
                </>}
                {field("sku", "Product code (SKU)", { required: true, placeholder: "e.g. MED-0421", hint: product ? `${PRODUCT_CODE_HINT} An unchanged existing code can be kept.` : PRODUCT_CODE_HINT })}
                {field("category", "Category", { choices: categories })}
                {field("price", "Selling price (₱)", { required: true, placeholder: "e.g. 10.00" })}
                {field("costPrice", "Cost price (₱)", { required: true, placeholder: "e.g. 6.00" })}
                {field("reorder", "Reorder level", { required: true, placeholder: "e.g. 20" })}
                <label className="product-checkbox field full-width"><input type="checkbox" checked={values.isDangerousDrug} onChange={(event) => update("isDangerousDrug", event.target.checked)} />Dangerous drug — requires controlled tracking</label>
              </div>
              {!product && <section className="modal-section">
                <label className="product-checkbox"><input type="checkbox" checked={values.includeStock} aria-controls={`${prefix}-batch`} aria-expanded={values.includeStock} onChange={(event) => update("includeStock", event.target.checked)} />Include initial stock</label>
                <p className="field-hint">Leave off to register a product with zero stock. You can add stock later.</p>
                {values.includeStock && <div id={`${prefix}-batch`} className="form-grid mt-4">
                  {field("batchNumber", "Batch number", { required: true, placeholder: "e.g. B2026-01" })}
                  {field("quantity", "Quantity", { required: true, placeholder: "e.g. 50" })}
                  {field("expiryDate", "Expiry date", { required: true, type: "date" })}
                  {field("mfgDate", "Manufacturing date", { type: "date" })}
                  {field("dateReceived", "Date received", { type: "date" })}
                  {field("supplier", "Supplier", { choices: suppliers })}
                </div>}
              </section>}
            </fieldset>
            </div>
            {failure && <div className="inline-error" role="alert">{failure}</div>}
            <div className="modal-actions">
              <button className="button soft" type="button" disabled={saving} onClick={close}>Cancel</button>
              <button className="button product-submit" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Product"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Portal>
  </Dialog.Root>;
}
