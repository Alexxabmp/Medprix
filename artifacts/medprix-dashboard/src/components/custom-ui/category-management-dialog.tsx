import { ModalScrollBody } from "@/components/modal-scroll-body";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Plus, Trash2, X } from "lucide-react";
import type { ProductCategory, ToastFn } from "@/lib/types";
import { safeError } from "@/lib/feedback";

export function CategoryManagementDialog({
  categories,
  onSaved,
  onClose,
  onToast,
}: {
  categories: ProductCategory[];
  onSaved: (categories: ProductCategory[]) => Promise<void>;
  onClose: () => void;
  onToast: ToastFn;
}) {
  const [draft, setDraft] = useState(() =>
    categories.map((row) => ({ ...row })),
  );
  const [name, setName] = useState("");
  const [isVat, setIsVat] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const close = () => {
    if (!busy.current) onClose();
  };
  const invalid =
    draft.some((row) => !row.name.trim()) ||
    new Set(draft.map((row) => row.name.trim().toLowerCase())).size !==
      draft.length;
  const reportFailure = (message: string) => {
    setError(message);
    onToast({ message, variant: "error" });
  };
  async function save() {
    if (busy.current || invalid) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/inventory/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalCategories: categories,
          categories: draft.map((row) => ({
            ...row,
            id: row.id.startsWith("new-") ? undefined : row.id,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success || !Array.isArray(data.categories)) {
        reportFailure(
          safeError(
            { status: response.status, data },
            "Categories could not be saved.",
          ),
        );
        return;
      }
      await onSaved(data.categories);
      onClose();
      onToast("Categories updated successfully.");
    } catch {
      reportFailure(
        "We couldn't confirm the save. Reopen the category manager to check before retrying.",
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
            className="modal modal-scroll-standard inventory-form-dialog category-manager"
            onPointerDownOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (busy.current) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document
                .querySelector<HTMLButtonElement>(
                  '[data-testid="select-inventory-category"]',
                )
                ?.focus({ preventScroll: true });
            }}
          >
            <div className="modal-header">
              <div>
                <Dialog.Title asChild>
                  <h2>Manage categories</h2>
                </Dialog.Title>
                <Dialog.Description className="modal-sub">
                  Organize products and set VAT for each category.
                </Dialog.Description>
              </div>
              <button
                className="modal-close"
                type="button"
                disabled={saving}
                aria-label="Close category manager"
                onClick={close}
              >
                <X size={16} />
              </button>
            </div>
            <ModalScrollBody
              className="inventory-dialog-body category-manager-body"
              aria-busy={saving}
            >
              <section
                className="inventory-form-section"
                aria-labelledby="category-add-heading"
              >
                <h3 id="category-add-heading">New category</h3>
                <form
                  className="category-manager-add"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (
                      !name.trim() ||
                      draft.some(
                        (row) =>
                          row.name.trim().toLowerCase() ===
                          name.trim().toLowerCase(),
                      )
                    ) {
                      setError("Enter a unique category name.");
                      return;
                    }
                    setDraft((rows) => [
                      ...rows,
                      {
                        id: "new-" + crypto.randomUUID(),
                        name: name.trim(),
                        isVat,
                      },
                    ]);
                    setName("");
                    setIsVat(true);
                    setError("");
                  }}
                >
                  <div className="field">
                    <label htmlFor="new-category-name">Category name</label>
                    <input
                      id="new-category-name"
                      placeholder="e.g. Vitamins & Supplements"
                      maxLength={100}
                      value={name}
                      disabled={saving}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <label className="category-vat-control">
                    <input
                      type="checkbox"
                      checked={isVat}
                      disabled={saving}
                      aria-label="VAT for new category"
                      onChange={(event) => setIsVat(event.target.checked)}
                    />
                    VAT
                  </label>
                  <button
                    className="button soft"
                    type="submit"
                    disabled={saving}
                  >
                    <Plus size={14} />
                    Add category
                  </button>
                </form>
              </section>
              <section
                className="inventory-form-section"
                aria-labelledby="category-list-heading"
              >
                <div className="inventory-section-heading">
                  <h3 id="category-list-heading">Categories</h3>
                  <span className="field-hint">{draft.length} total</span>
                </div>
                <p
                  className="field-hint category-vat-explanation"
                  id="category-vat-hint"
                >
                  Check VAT to add 12% to the initial price. Unchecked
                  categories are Non-VAT. Changes apply to all products in the
                  category.
                </p>
                {!!draft.length && (
                  <div className="category-manager-columns" aria-hidden="true">
                    <span>Category name</span>
                    <span>VAT</span>
                    <span />
                  </div>
                )}
                <ul className="category-manager-list" aria-label="Categories">
                  {draft.map((row, index) => (
                    <li key={row.id}>
                      <div className="field">
                        <label
                          className="sr-only"
                          htmlFor={"category-" + row.id}
                        >
                          Category {index + 1}
                        </label>
                        <input
                          id={"category-" + row.id}
                          maxLength={100}
                          value={row.name}
                          disabled={saving}
                          onChange={(event) =>
                            setDraft((rows) =>
                              rows.map((item) =>
                                item.id === row.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <label className="category-vat-control">
                        <input
                          type="checkbox"
                          checked={row.isVat}
                          disabled={saving}
                          aria-describedby="category-vat-hint"
                          aria-label={"VAT for " + row.name}
                          onChange={(event) =>
                            setDraft((rows) =>
                              rows.map((item) =>
                                item.id === row.id
                                  ? { ...item, isVat: event.target.checked }
                                  : item,
                              ),
                            )
                          }
                        />
                        <span>{row.isVat ? "VAT" : "Non-VAT"}</span>
                      </label>
                      <button
                        type="button"
                        className="button icon soft category-remove"
                        disabled={saving}
                        aria-label={"Remove " + row.name}
                        onClick={() =>
                          setDraft((rows) =>
                            rows.filter((item) => item.id !== row.id),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                {!draft.length && (
                  <p className="category-empty">
                    No categories yet. Add your first category above.
                  </p>
                )}
                <p className="field-hint category-delete-hint">
                  To delete a category in use, move its products to another
                  category first.
                </p>
              </section>
              {invalid && (
                <p className="inline-error" role="alert">
                  Category names must be unique and cannot be blank.
                </p>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              {name.trim() && (
                <p className="field-hint category-draft-hint">
                  Click Add category to include the new category before saving.
                </p>
              )}
            </ModalScrollBody>
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
                type="button"
                disabled={saving || invalid || Boolean(name.trim())}
                onClick={() => void save()}
              >
                <Check size={13} />
                {saving ? "Saving\u2026" : "Save changes"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
