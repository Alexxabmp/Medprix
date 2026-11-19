import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { customerDiscountToPos, maskEnding } from "@workspace/api-zod";
import { matchesCustomer, type Customer } from "@/lib/customer-api";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

export function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
}

export function CustomerDiscountBadge({ discountType }: { discountType: string }) {
  const pos = customerDiscountToPos(discountType);
  return <span className={`customer-badge is-${pos.toLowerCase()}`}>{pos === "None" ? "Regular" : pos}</span>;
}

/** Search returning customers by name, mobile or ID number. IDs and phones show only their last 4 digits. */
export function FindCustomerDialog({ open, customers, loading, error, onRetry, onSelect, onNew, onClose }: {
  open: boolean;
  customers: Customer[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSelect: (customer: Customer) => void;
  onNew: (search: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useDialogAccessibility(open, ".find-customer-dialog", onClose);
  useEffect(() => { if (open) { setSearch(""); setActive(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  const results = useMemo(() => customers.filter((customer) => matchesCustomer(customer, search)).slice(0, 8), [customers, search]);
  useEffect(() => setActive(0), [search]);
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal dialog find-customer-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Find customer</h2>
            <p className="modal-sub">Search by name, mobile number or ID number.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <label className="find-customer-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search customers</span>
          <input
            ref={input}
            value={search}
            placeholder="Name, mobile number or ID number"
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="find-customer-results"
            aria-activedescendant={results[active] ? `find-customer-${results[active].id}` : undefined}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = Math.max(0, Math.min(active + (event.key === "ArrowDown" ? 1 : -1), results.length - 1));
                setActive(next);
                if (results[next]) list.current?.children[next]?.scrollIntoView({ block: "nearest" });
              }
              else if (event.key === "Enter" && results[active]) { event.preventDefault(); onSelect(results[active]); }
            }}
          />
        </label>
        <p className="find-customer-count" aria-live="polite">
          {loading ? "Loading customers…" : error ? "" : search.trim() ? `${results.length} ${results.length === 1 ? "customer" : "customers"}` : `${customers.length} saved customers`}
        </p>
        {error ? (
          <div className="inline-error" role="alert"><span>{error}</span><button type="button" className="pos-stock-retry" onClick={onRetry}>Retry</button></div>
        ) : (
          <ul ref={list} id="find-customer-results" role="listbox" aria-label="Customers" className="find-customer-results">
            {results.map((customer, index) => (
              <li key={customer.id} id={`find-customer-${customer.id}`} role="option" aria-selected={index === active}>
                <button type="button" className={`find-customer-result${index === active ? " is-active" : ""}`} onMouseMove={() => setActive(index)} onClick={() => onSelect(customer)}>
                  <span className="customer-avatar" aria-hidden="true">{initialsOf(customer.name)}</span>
                  <span className="find-customer-text">
                    <span className="find-customer-name">{customer.name} <CustomerDiscountBadge discountType={customer.discountType} /></span>
                    <span className="find-customer-detail">
                      {[customer.idNumber && `${customerDiscountToPos(customer.discountType) === "PWD" ? "PWD" : "OSCA"} ID ${maskEnding(customer.idNumber)}`, customer.mobile && `Mobile ${maskEnding(customer.mobile)}`].filter(Boolean).join(" · ") || "No ID or mobile saved"}
                    </span>
                  </span>
                  <span className="find-customer-usual">{customer.usualItems.length ? `${customer.usualItems.length} usual ${customer.usualItems.length === 1 ? "item" : "items"}` : "No usual order"}</span>
                </button>
              </li>
            ))}
            {!loading && !results.length && <li className="find-customer-empty">No saved customer matches “{search.trim()}”.</li>}
          </ul>
        )}
        <button type="button" className="find-customer-new" onClick={() => onNew(search.trim())}><Plus size={16} /> New returning customer</button>
        <p className="find-customer-hint">Arrow keys move through results; Enter selects.</p>
      </div>
    </div>
  );
}
