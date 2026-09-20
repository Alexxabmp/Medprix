import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, Plus } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import type { ToastFn } from "@/lib/types";

type Supplier = {
  id: string;
  name: string;
  code: string;
  contact: string;
  orders: number;
  orderValue: string;
  status: string;
};

export default function SupplierPage({ onToast }: { onToast: ToastFn }) {
  const [filter, setFilter] = useState("All statuses");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        setIsLoading(true);
        setError("");
        const response = await fetch("http://localhost:5000/api/suppliers", {
          credentials: "include",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Failed to load suppliers.");
        }
        setSuppliers(data.suppliers || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not reach the server.";
        setError(message);
        onToast(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuppliers();
  }, [onToast]);

  const filtered = suppliers.filter(
    (supplier) => filter === "All statuses" || supplier.status === filter,
  );
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === "Active").length;
  const openPurchaseValue = suppliers.reduce(
    (total, supplier) => total + Number(supplier.orderValue),
    0,
  );

  return (
    <div>
      <PageHeading
        title="Supplier"
        description="Know who keeps your shelves ready, and how they are performing."
        action={
          <button
            className="button dark"
            data-testid="button-add-supplier"
            onClick={() => onToast("Supplier onboarding form is ready")}>
            <Plus size={14} /> Add supplier
          </button>
        }
      />
      <div className="summary-strip">
        <Summary
          label="Active suppliers"
          value={String(activeSuppliers)}
          caption="Current supplier accounts"
        />
        <Summary
          label="Open purchase value"
          value={`₱${openPurchaseValue.toFixed(2)}`}
          caption="Across recorded purchase orders"
        />
        <Summary
          label="On-time delivery"
          value="N/A"
          caption="Delivery performance data pending"
        />
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div>
            <h2 className="card-title">Supplier directory</h2>
            <p className="card-subtitle">
              Commercial partners and current standing
            </p>
          </div>
          <select
            className="select"
            data-testid="select-supplier-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}>
            <option>All statuses</option>
            <option>Preferred</option>
            <option>Active</option>
            <option>Review</option>
            <option>On hold</option>
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Primary contact</th>
                <th>Orders YTD</th>
                <th>Order value</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="muted">Loading suppliers...</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="muted">{error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="muted">No suppliers found.</td></tr>
              ) : filtered.map((supplier) => (
                <tr key={supplier.code}>
                  <td>
                    <div className="product-cell">
                      <span className="product-symbol">
                        <Building2 size={15} />
                      </span>
                      <div>
                        <strong>{supplier.name}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>
                          {supplier.code}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{supplier.contact}</td>
                  <td>{supplier.orders}</td>
                  <td>
                    <strong>₱{Number(supplier.orderValue).toFixed(2)}</strong>
                  </td>
                  <td>
                    <span
                      className={`pill ${supplier.status === "Preferred" ? "success" : supplier.status === "Review" ? "warning" : "danger"}`}>
                      {supplier.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      data-testid={`button-view-supplier-${supplier.code}`}
                      onClick={() =>
                        onToast(`${supplier.name} profile opened`)
                      }>
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

