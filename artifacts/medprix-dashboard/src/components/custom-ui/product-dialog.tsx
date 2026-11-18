import { ModalScrollBody } from "@/components/modal-scroll-body";
import { SelectField } from "@/components/custom-ui/select-field";
import { safeError } from "@/lib/feedback";
import { useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import {
  parseProductMoney,
  productSellingPrice,
  type ProductErrors,
} from "@workspace/api-zod";
import {
  emptyProductForm,
  productFormPayload,
  type ProductFormValues,
} from "@/lib/product-form";
import type { ProductItem, ProductCategory } from "@/lib/types";

type ProductOptionState = {
  pending: boolean;
  hasData: boolean;
  error: string;
  onRetry: () => void;
};

export function ProductDialog({
  product,
  categories,
  suppliers,
  categoryState,
  supplierState,
  onClose,
  onSaved,
}: {
  product?: ProductItem;
  categories: ProductCategory[];
  suppliers: string[];
  categoryState?: ProductOptionState;
  supplierState?: ProductOptionState;
  onClose: () => void;
  onSaved: (product: ProductItem) => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(() =>
    product
      ? {
          ...emptyProductForm(),
          name: product.name,
          genericName: product.genericName,
          sku: product.sku,
          category: product.category,
          initialPrice: product.initialPrice ?? "",
          costPrice: parseProductMoney(product.cost) ?? "",
          reorder: String(product.reorder),
          isDangerousDrug: product.isDangerousDrug ?? false,
        }
      : emptyProductForm(),
  );
  const [errors, setErrors] = useState<ProductErrors>({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const prefix = product ? "edit-product" : "add-product";
  const category = categories.find(
    (category) => category.name === values.category,
  );
  const sellingPrice = category
    ? productSellingPrice(values.initialPrice, category.isVat)
    : null;
  const close = () => {
    if (!busy.current) onClose();
  };

  const showErrors = (next: ProductErrors) => {
    setErrors(next);
    requestAnimationFrame(() => {
      const first = form.current?.querySelector<HTMLElement>(
        "[aria-invalid='true']",
      );
      first?.focus();
      first?.scrollIntoView({ block: "nearest" });
    });
  };
  const update = (key: keyof ProductFormValues, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({
      ...current,
      [key]: "",
      ...(key === "strength" || key === "medicineForm" ? { name: "" } : {}),
    }));
    setFailure("");
  };
  const field = (
    key: keyof ProductFormValues,
    label: string,
    options: {
      type?: string;
      placeholder?: string;
      required?: boolean;
      hint?: string;
      choices?: string[];
      fullWidth?: boolean;
      inputMode?: "decimal" | "numeric";
    } = {},
  ) => {
    const id = `${prefix}-${key}`;
    const optionState = key === "category" ? categoryState : key === "supplier" ? supplierState : undefined;
    const errorKey = key;
    const props = {
      id,
      name: key,
      value: String(values[key]),
      required: options.required,
      "aria-invalid": Boolean(errors[errorKey]),
      "aria-describedby":
        [
          options.hint ? `${id}-hint` : "",
          errors[errorKey] ? `${id}-error` : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
      ) => update(key, event.target.value),
    };
    return (
      <div
        className={`field${options.fullWidth ? " full-width" : ""}`}
        key={key}
      >
        <label htmlFor={id}>
          {label} {options.required ? "*" : ""}
        </label>
        {options.choices ? (
          <SelectField {...props}
            optionsLoading={optionState ? optionState.pending && !optionState.hasData : undefined}
            aria-busy={optionState?.pending}
            optionsError={optionState?.error}
            onRetryOptions={optionState?.onRetry}>
            <option value="">Select {label.toLowerCase()}</option>
            {[
              ...new Set([
                ...options.choices,
                ...(values[key] ? [String(values[key])] : []),
              ]),
            ]
              .filter(Boolean)
              .map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
          </SelectField>
        ) : (
          <input
            {...props}
            type={options.type ?? "text"}
            inputMode={options.inputMode}
            placeholder={options.placeholder}
          />
        )}
        {options.hint && (
          <span id={`${id}-hint`} className="field-hint">
            {options.hint}
          </span>
        )}
        {errors[errorKey] && (
          <span id={`${id}-error`} className="product-field-error">
            {errors[errorKey]}
          </span>
        )}
      </div>
    );
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const result = productFormPayload(values, product);
    if (Object.keys(result.errors).length) {
      showErrors(result.errors);
      return;
    }
    showErrors({});
    setFailure("");
    busy.current = true;
    setSaving(true);
    try {
      const response = await fetch(
        product
          ? `/api/inventory/products/${product.id}`
          : "/api/inventory/products",
        {
          method: product ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result.payload),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data?.product) {
        setFailure(
          safeError(
            { status: response.status, data },
            "The product could not be saved. Check your entries and try again.",
          ),
        );
        showErrors(
          Object.fromEntries(
            Object.entries(data?.errors ?? {}).map(([key, value]) => [
              key,
              safeError(value, "Check this field."),
            ]),
          ),
        );
        return;
      }
      onSaved(data.product);
      busy.current = false;
      onClose();
    } catch {
      setFailure(
        "We couldn't confirm the save. Check your connection and the product list before retrying.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content
            className="modal modal-scroll-standard inventory-form-dialog product-form-modal"
            data-testid={`modal-${product ? "edit" : "add"}-product`}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document
                .querySelector<HTMLButtonElement>(
                  `[data-testid="${product ? `button-more-action-${product.id}` : "button-add-product"}"]`,
                )
                ?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (busy.current) event.preventDefault();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div className="modal-header">
              <div>
                <Dialog.Title asChild>
                  <h2>{product ? "Update product" : "Add product"}</h2>
                </Dialog.Title>
                <Dialog.Description className="modal-sub">
                  {product
                    ? "Product details, pricing and stock settings."
                    : "Product details and pricing, with optional opening stock."}{" "}
                  Fields marked * are required.
                </Dialog.Description>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close product form"
                disabled={saving}
                onClick={close}
              >
                <X size={16} />
              </button>
            </div>
            <form
              ref={form}
              noValidate
              onSubmit={save}
              aria-busy={saving}
              className="product-form-layout"
            >
              <ModalScrollBody className="inventory-dialog-body product-form-body">
                <fieldset disabled={saving} className="product-form-fields">
                  <section
                    className="inventory-form-section"
                    aria-labelledby={prefix + "-details-heading"}
                  >
                    <h3 id={prefix + "-details-heading"}>Product details</h3>
                    <div className="form-grid">
                      {field("name", "Product name", {
                        required: true,
                        placeholder: "e.g. Paracetamol",
                        fullWidth: true,
                      })}
                      {field("genericName", "Generic name", {
                        required: true,
                        placeholder: "e.g. Acetaminophen",
                      })}
                      {field("category", "Category", {
                        required: true,
                        choices: categories.map((category) => category.name),
                      })}
                      {!product && (
                        <>
                          {field("strength", "Strength", {
                            placeholder: "e.g. 500mg",
                          })}
                          {field("medicineForm", "Medicine form", {
                            placeholder: "e.g. Tablet or Syrup",
                          })}
                        </>
                      )}
                    </div>
                  </section>
                  <section
                    className="inventory-form-section"
                    aria-labelledby={prefix + "-pricing-heading"}
                  >
                    <h3 id={prefix + "-pricing-heading"}>Pricing</h3>
                    <div className="form-grid">
                      {field("initialPrice", "Initial price (PHP)", {
                        required: true,
                        placeholder: "e.g. 10.00",
                        inputMode: "decimal",
                        hint: "Retail price before VAT.",
                      })}
                      {field("costPrice", "Purchase cost (PHP)", {
                        required: true,
                        placeholder: "e.g. 6.00",
                        inputMode: "decimal",
                        hint: "Supplier cost per unit, used for profit and valuation.",
                      })}
                      <div className="product-price-summary full-width">
                        <div>
                          <label htmlFor={prefix + "-selling-price"}>
                            Selling price
                          </label>
                          <p className="field-hint">
                            {category
                              ? category.isVat
                                ? "Includes 12% VAT from the selected category."
                                : "Non-VAT category. No VAT added."
                              : "Select a category to determine VAT."}
                          </p>
                        </div>
                        <output
                          id={prefix + "-selling-price"}
                          aria-live="polite"
                        >
                          {sellingPrice === null
                            ? "\u2014"
                            : new Intl.NumberFormat("en-PH", {
                                style: "currency",
                                currency: "PHP",
                              }).format(Number(sellingPrice))}
                        </output>
                      </div>
                    </div>
                  </section>
                  <section
                    className="inventory-form-section"
                    aria-labelledby={prefix + "-stock-heading"}
                  >
                    <h3 id={prefix + "-stock-heading"}>Stock settings</h3>
                    <div className="form-grid">
                      {field("reorder", "Reorder level", {
                        required: true,
                        placeholder: "e.g. 20",
                        inputMode: "numeric",
                        fullWidth: true,
                      })}
                      <label className="inventory-checkbox-row full-width">
                        <input
                          type="checkbox"
                          checked={values.isDangerousDrug}
                          onChange={(event) =>
                            update("isDangerousDrug", event.target.checked)
                          }
                        />
                        <span>
                          <strong>Dangerous drug</strong>
                          <span className="field-hint">
                            Requires controlled tracking.
                          </span>
                        </span>
                      </label>
                    </div>
                  </section>
                  {!product && (
                    <section
                      className="inventory-form-section"
                      aria-labelledby={prefix + "-opening-heading"}
                    >
                      <h3 id={prefix + "-opening-heading"}>Opening stock</h3>
                      <label className="inventory-checkbox-row">
                        <input
                          type="checkbox"
                          checked={values.includeStock}
                          aria-controls={prefix + "-batch"}
                          aria-expanded={values.includeStock}
                          onChange={(event) =>
                            update("includeStock", event.target.checked)
                          }
                        />
                        <span>
                          <strong>Include initial stock</strong>
                          <span className="field-hint">
                            Add a batch now, or register this product with zero
                            stock.
                          </span>
                        </span>
                      </label>
                      {values.includeStock && (
                        <div
                          id={prefix + "-batch"}
                          className="form-grid product-opening-fields"
                        >
                          {field("batchNumber", "Batch number", {
                            required: true,
                            placeholder: "e.g. B2026-01",
                          })}
                          {field("quantity", "Quantity", {
                            required: true,
                            placeholder: "e.g. 50",
                            inputMode: "numeric",
                          })}
                          {field("expiryDate", "Expiry date", {
                            required: true,
                            type: "date",
                          })}
                          {field("mfgDate", "Manufacturing date", {
                            type: "date",
                          })}
                          {field("dateReceived", "Date received", {
                            type: "date",
                          })}
                          {field("supplier", "Supplier", {
                            choices: suppliers,
                          })}
                        </div>
                      )}
                    </section>
                  )}
                </fieldset>
              </ModalScrollBody>
              {failure && (
                <div className="inline-error" role="alert">
                  {failure}
                </div>
              )}
              <div className="modal-actions modal-scroll-footer">
                <button
                  className="button soft"
                  type="button"
                  disabled={saving}
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  className="button primary-action"
                  type="submit"
                  disabled={saving}
                >
                  <Check size={13} />
                  {saving
                    ? "Saving…"
                    : product
                      ? "Save changes"
                      : "Add product"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
