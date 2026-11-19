import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { customerDiscountToPos, formatStaffMobile, maskEnding } from "@workspace/api-zod";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import { SelectField } from "@/components/custom-ui/select-field";
import { LoadingState } from "@/components/custom-ui/loading-state";
import { CustomerDiscountBadge, initialsOf } from "@/components/custom-ui/find-customer-dialog";
import { CustomerProfilePanel } from "@/components/custom-ui/customer-profile-panel";
import { NewCustomerDialog } from "@/components/custom-ui/new-customer-dialog";
import { fetchCustomers, matchesCustomer, type Customer } from "@/lib/customer-api";
import { safeError } from "@/lib/feedback";
import { usePharmacyInventory } from "@/lib/pharmacy-store";
import type { ToastFn } from "@/lib/types";

const PAGE_SIZE = 15;
const DISCOUNT_FILTERS = ["All discounts", "Senior", "PWD", "Regular"] as const;
const shortDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "";

/**
 * Customers (Admin and Front Desk). The same returning-customer records the cashier uses at the POS:
 * find, add, edit details and usual order, and delete. Full ID numbers show only inside a profile.
 */
export default function CustomersPage({ onToast }: { onToast: ToastFn }) {
  const { items: products } = usePharmacyInventory();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [discount, setDiscount] = useState<(typeof DISCOUNT_FILTERS)[number]>("All discounts");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setCustomers(await fetchCustomers());
      setError("");
    } catch (err) {
      setError(safeError(err, "Could not load customers. Please try again."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(
    () =>
      customers.filter((customer) => {
        const pos = customerDiscountToPos(customer.discountType);
        const matchesDiscount = discount === "All discounts" || (discount === "Regular" ? pos === "None" : pos === discount);
        return matchesDiscount && matchesCustomer(customer, search);
      }),
    [customers, discount, search],
  );
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const count = (type: "Senior" | "PWD") => customers.filter((customer) => customerDiscountToPos(customer.discountType) === type).length;

  const replace = (next: Customer) => {
    // Visit counts aren't returned by edits, so keep the ones already loaded.
    setCustomers((list) => list.map((item) => (item.id === next.id ? { ...item, ...next, visitCount: next.visitCount ?? item.visitCount, lastVisitAt: next.lastVisitAt ?? item.lastVisitAt } : item)));
    setSelected((current) => (current?.id === next.id ? { ...current, ...next } : current));
  };

  return (
    <div>
      <PageHeading
        title="Customers"
        description="Returning customers, their Senior/PWD details and usual medicines."
        action={
          <button className="button dark" data-testid="button-add-customer" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add customer
          </button>
        }
      />
      <div className="summary-strip">
        <Summary label="Customers" value={String(customers.length)} caption="Saved with consent" />
        <Summary
          label="Senior citizens & PWD"
          value={String(count("Senior") + count("PWD"))}
          caption={`${count("Senior")} Senior · ${count("PWD")} PWD`}
        />
        <Summary
          label="With a usual order"
          value={String(customers.filter((customer) => customer.usualItems.length > 0).length)}
          caption="One-click refills at the POS"
        />
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div className="search-wrap">
            <Search size={15} />
            <input
              type="search"
              data-testid="input-customer-search"
              aria-label="Search customers"
              placeholder="Search name, mobile or ID number..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="table-tools-right">
            <SelectField
              className="select"
              aria-label="Filter customers by discount"
              data-testid="select-customer-discount"
              value={discount}
              onChange={(e) => {
                setDiscount(e.target.value as (typeof DISCOUNT_FILTERS)[number]);
                setPage(1);
              }}>
              {DISCOUNT_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === "Regular" ? "No discount" : option}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        {loading && customers.length === 0 ? (
          <LoadingState label="Loading customers…" />
        ) : error ? (
          <div className="empty-state" role="alert">
            <Users size={25} />
            <div>{error}</div>
            <button className="button soft" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table customers-table" data-page-table="customers">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Discount</th>
                  <th>ID number</th>
                  <th>Mobile</th>
                  <th>Usual order</th>
                  <th>Last visit</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr
                    key={customer.id}
                    className="customers-row"
                    data-testid={`row-customer-${customer.id}`}
                    tabIndex={0}
                    aria-label={`Open ${customer.name}'s profile`}
                    onClick={() => setSelected(customer)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(customer);
                      }
                    }}>
                    <td>
                      <div className="product-cell">
                        <span className="customer-avatar">{initialsOf(customer.name)}</span>
                        <strong>{customer.name}</strong>
                      </div>
                    </td>
                    <td>
                      <CustomerDiscountBadge discountType={customer.discountType} />
                    </td>
                    <td className="muted">{customer.idNumber ? maskEnding(customer.idNumber) : "—"}</td>
                    <td className="muted">{customer.mobile ? formatStaffMobile(customer.mobile) : "—"}</td>
                    <td className="muted">
                      {customer.usualItems.length ? `${customer.usualItems.length} medicine${customer.usualItems.length === 1 ? "" : "s"}` : "—"}
                    </td>
                    <td className="muted">
                      {customer.lastVisitAt ? (
                        <>
                          {shortDate(customer.lastVisitAt)}
                          <div className="customers-sub">
                            {customer.visitCount} visit{customer.visitCount === 1 ? "" : "s"}
                          </div>
                        </>
                      ) : (
                        "No visits yet"
                      )}
                    </td>
                    <td className="muted">{shortDate(customer.createdAt) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && (
              <div className="empty-state">
                <Users size={25} />
                <div>{customers.length ? "No customers match your search." : "No customers saved yet. Add one, or save one at the POS."}</div>
              </div>
            )}
          </div>
        )}
        <div className="table-pagination" role="navigation" aria-label="Customers pagination">
          <span className="muted">
            Page {safePage} of {totalPages} ({shown.length} customers)
          </span>
          <button type="button" className="button soft" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <button type="button" className="button soft" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </button>
        </div>
      </section>

      <CustomerProfilePanel
        fromRecords
        customer={selected}
        products={products}
        onClose={() => setSelected(null)}
        onUpdated={replace}
        onDeleted={(gone) => {
          setCustomers((list) => list.filter((item) => item.id !== gone.id));
          setSelected(null);
        }}
        onToast={(message) => onToast(message)}
      />
      <NewCustomerDialog
        open={adding}
        fromRecords
        initial={{ name: "", discountType: "Regular", idNumber: "" }}
        cartLines={[]}
        onClose={() => setAdding(false)}
        onSaved={(created) => {
          const fresh = { ...created, visitCount: 0, lastVisitAt: null };
          setCustomers((list) => [...list, fresh].sort((a, b) => a.name.localeCompare(b.name)));
          setAdding(false);
          onToast(`${created.name} is saved. Add their usual medicines from the profile.`);
          setSelected(fresh);
        }}
      />
    </div>
  );
}
