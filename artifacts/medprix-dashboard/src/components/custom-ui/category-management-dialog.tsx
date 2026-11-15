import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Trash2, X } from "lucide-react";

/** UI draft only: categories currently come from product records, with no CRUD API. */
export function CategoryManagementDialog({
  categories,
  onClose,
}: {
  categories: string[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    categories.map((name, id) => ({ id, name })),
  );
  const [nextId, setNextId] = useState(categories.length);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const duplicate = draft.some((item, index) =>
    draft.some(
      (other, otherIndex) =>
        otherIndex < index &&
        other.name.trim().toLocaleLowerCase() ===
          item.name.trim().toLocaleLowerCase(),
    ),
  );
  const invalid = draft.some((item) => !item.name.trim()) || duplicate;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="category-manager-overlay" />
        <Dialog.Content
          className="modal category-manager"
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
                Try adding, renaming, or removing categories. Saving is not
                connected yet; these drafts are discarded when you close this
                window.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="button icon soft"
              aria-label="Close category manager"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="category-manager-body">
            <form
              className="category-manager-add"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = name.trim();
                if (!trimmed) {
                  setError("Enter a category name.");
                  return;
                }
                if (
                  draft.some(
                    (item) =>
                      item.name.trim().toLocaleLowerCase() ===
                      trimmed.toLocaleLowerCase(),
                  )
                ) {
                  setError("This category already exists.");
                  return;
                }
                setDraft((items) => [...items, { id: nextId, name: trimmed }]);
                setNextId((id) => id + 1);
                setName("");
                setError("");
              }}
            >
              <div className="field">
                <label htmlFor="new-category-name">New category</label>
                <input
                  id="new-category-name"
                  maxLength={100}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "category-add-error" : undefined}
                />
              </div>
              <button className="button soft" type="submit">
                <Plus size={14} />
                Add category
              </button>
            </form>
            {error && (
              <p id="category-add-error" className="field-error" role="alert">
                {error}
              </p>
            )}
            <ul className="category-manager-list" aria-label="Category drafts">
              {draft.map((item, index) => (
                <li key={item.id}>
                  <div className="field">
                    <label
                      className="sr-only"
                      htmlFor={`category-draft-${item.id}`}
                    >
                      Category {index + 1}
                    </label>
                    <input
                      id={`category-draft-${item.id}`}
                      maxLength={100}
                      value={item.name}
                      onChange={(event) =>
                        setDraft((items) =>
                          items.map((row) =>
                            row.id === item.id
                              ? { ...row, name: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="button icon soft"
                    aria-label={`Remove ${item.name || `category ${index + 1}`} from draft`}
                    onClick={() =>
                      setDraft((items) =>
                        items.filter((row) => row.id !== item.id),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            {!draft.length && (
              <p className="muted">No category drafts. Add one above.</p>
            )}
            {invalid && (
              <p className="field-error" role="alert">
                Category names must be unique and cannot be blank.
              </p>
            )}
          </div>
          <div className="modal-actions">
            <Dialog.Close className="button soft">Close</Dialog.Close>
            <button
              type="button"
              className="button dark"
              disabled
              title="Category saving is not connected yet"
            >
              Save changes (not connected)
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
