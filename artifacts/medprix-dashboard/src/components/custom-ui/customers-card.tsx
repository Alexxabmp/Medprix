import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users, UserRound } from "lucide-react";
import { customerDiscountToPos, formatStaffMobile, maskEnding } from "@workspace/api-zod";
import { SelectField } from "@/components/custom-ui/select-field";
import { LoadingState } from "@/components/custom-ui/loading-state";
import { CustomerDiscountBadge, initialsOf } from "@/components/custom-ui/find-customer-dialog";
import { CustomerProfilePanel } from "@/components/custom-ui/customer-profile-panel";
import { NewCustomerDialog } from "@/components/custom-ui/new-customer-dialog";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { fetchCustomers, matchesCustomer, type Customer } from "@/lib/customer-api";
import { safeError } from "@/lib/feedback";
import { usePharmacyInventory } from "@/lib/pharmacy-store";
import type { ToastFn } from "@/lib/types";

const PAGE_SIZE = 8;
const DISCOUNT_FILTERS = ["All discounts", "Senior", "PWD", "Regular"] as const;
const shortDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "";

/**
 * Customers on the dashboard (Admin and Front desk). A one-line summary; "Manage customers" opens ONE window
 * that switches between the list, a customer's profile and the add form (with a back arrow), so nothing stacks.
 * These are the same records the cashier uses at the POS for Senior/PWD discounts and usual orders.
 */
export function CustomersCard({ onToast }: { onToast: ToastFn }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const load = async () => {
    try { setCustomers(await fetchCustomers()); setError(""); }
    catch (failure) { setError(safeError(failure, "Could not load customers. Please try again.")); }
  };
  useEffect(() => { void load(); }, []);
  const count = (type: "Senior" | "PWD") => (customers ?? []).filter(c => customerDiscountToPos(c.discountType) === type).length;

  return (
    <section className="surface-card customers-card" aria-labelledby="customers-card-title" data-testid="customers-card">
      <span className="product-symbol" aria-hidden="true"><UserRound size={16} /></span>
      <div className="customers-card-text">
        <h2 id="customers-card-title" className="card-title">Customers</h2>
        <p className="muted">
          {customers ? `${customers.length} on file · ${count("Senior")} Senior · ${count("PWD")} PWD · ${customers.filter(c => c.usualItems.length > 0).length} with a usual order`
            : error ? error : "Loading customers…"}
        </p>
      </div>
      <button type="button" className="button soft" onClick={() => setOpen(true)} data-testid="button-manage-customers">Manage customers</button>
      {open && <CustomersDialog initial={customers} onClose={() => { setOpen(false); void load(); }} onChanged={setCustomers} onToast={onToast} />}
    </section>
  );
}

type View = { kind: "list" } | { kind: "profile"; id: string } | { kind: "add" };

function CustomersDialog({ initial, onClose, onChanged, onToast }: { initial: Customer[] | null; onClose: () => void; onChanged: (list: Customer[]) => void; onToast: ToastFn }) {
  const { items: products } = usePharmacyInventory();
  const [customers, setCustomersState] = useState<Customer[] | null>(initial);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [discount, setDiscount] = useState<(typeof DISCOUNT_FILTERS)[number]>("All discounts");
  const [page, setPage] = useState(1);
  const setCustomers = (next: Customer[]) => { setCustomersState(next); onChanged(next); };

  useEffect(() => {
    fetchCustomers().then(list => { setCustomersState(list); onChanged(list); setError(""); })
      .catch(failure => setError(safeError(failure, "Could not load customers. Please try again.")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (customers ?? []).filter(customer => {
    const pos = customerDiscountToPos(customer.discountType);
    const matchesDiscount = discount === "All discounts" || (discount === "Regular" ? pos === "None" : pos === discount);
    return matchesDiscount && matchesCustomer(customer, search);
  }), [customers, discount, search]);
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = view.kind === "profile" ? (customers ?? []).find(c => c.id === view.id) ?? null : null;
  const toList = () => setView({ kind: "list" });

  if (view.kind === "add") {
    return (
      <WholesaleDialog title="Add customer" description="Next time, find them by name, mobile or ID." busy={false} close={onClose} back={toList} className="proc-dialog customers-dialog">
        <NewCustomerDialog open inline fromRecords initial={{ name: "", discountType: "Regular", idNumber: "" }} cartLines={[]} onClose={toList}
          onSaved={created => {
            const fresh = { ...created, visitCount: 0, lastVisitAt: null };
            setCustomers([...(customers ?? []), fresh].sort((a, b) => a.name.localeCompare(b.name)));
            onToast(`${created.name} is saved. Add their usual medicines from the profile.`);
            setView({ kind: "profile", id: fresh.id });
          }} />
      </WholesaleDialog>
    );
  }

  if (selected) {
    return (
      <WholesaleDialog title="Customer profile" busy={false} close={onClose} back={toList} className="proc-dialog customers-dialog">
        <CustomerProfilePanel inline fromRecords customer={selected} products={products} onClose={toList}
          onUpdated={next => setCustomers((customers ?? []).map(item => item.id === next.id
            ? { ...item, ...next, visitCount: next.visitCount ?? item.visitCount, lastVisitAt: next.lastVisitAt ?? item.lastVisitAt } : item))}
          onDeleted={gone => { setCustomers((customers ?? []).filter(item => item.id !== gone.id)); toList(); }}
          onToast={message => onToast(message)} />
      </WholesaleDialog>
    );
  }

  return (
    <WholesaleDialog title="Customers" description="Returning customers, their Senior/PWD details and usual medicines. The same records the cashier uses at the POS."
      busy={false} close={onClose} className="proc-dialog proc-dialog-wide customers-dialog"
      footer={<>
        <button type="button" className="button soft" onClick={onClose}>Close</button>
        <button type="button" className="button primary-action" onClick={() => setView({ kind: "add" })} data-testid="button-add-customer"><Plus size={14} /> Add customer</button>
      </>}>
      <div className="table-tools">
        <div className="search-wrap">
          <Search size={15} />
          <input type="search" data-testid="input-customer-search" aria-label="Search customers" placeholder="Search name, mobile or ID number..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <SelectField className="select" aria-label="Filter customers by discount" value={discount}
          onChange={e => { setDiscount(e.target.value as (typeof DISCOUNT_FILTERS)[number]); setPage(1); }}>
          {DISCOUNT_FILTERS.map(option => <option key={option} value={option}>{option}</option>)}
        </SelectField>
      </div>
      {error && <div className="inline-error" role="alert"><span>{error}</span></div>}
      {!customers && !error ? <LoadingState label="Loading customers…" /> : (
        <div className="table-scroll">
          <table className="data-table customers-table proc-compact">
            <thead><tr><th>Customer</th><th>Discount</th><th>ID number</th><th>Mobile</th><th>Last visit</th></tr></thead>
            <tbody>
              {rows.map(customer => (
                <tr key={customer.id} className="customers-row" data-testid={`row-customer-${customer.id}`} tabIndex={0}
                  aria-label={`Open ${customer.name}'s profile`} onClick={() => setView({ kind: "profile", id: customer.id })}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView({ kind: "profile", id: customer.id }); } }}>
                  <td><div className="product-cell"><span className="customer-avatar">{initialsOf(customer.name)}</span><strong>{customer.name}</strong></div></td>
                  <td><CustomerDiscountBadge discountType={customer.discountType} /></td>
                  <td className="muted">{customer.idNumber ? maskEnding(customer.idNumber) : "—"}</td>
                  <td className="muted">{customer.mobile ? formatStaffMobile(customer.mobile) : "—"}</td>
                  <td className="muted">{customer.lastVisitAt ? `${shortDate(customer.lastVisitAt)} · ${customer.visitCount} visit${customer.visitCount === 1 ? "" : "s"}` : "No visits yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && customers && (
            <div className="empty-state"><Users size={25} /><div>{customers.length ? "No customers match your search." : "No customers saved yet. Add one here, or save one at the POS."}</div></div>
          )}
        </div>
      )}
      {totalPages > 1 && (
        <div className="table-pagination" role="navigation" aria-label="Customers pagination">
          <span className="muted">Page {safePage} of {totalPages} ({shown.length} customers)</span>
          <button type="button" className="button soft" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
          <button type="button" className="button soft" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      )}
    </WholesaleDialog>
  );
}
