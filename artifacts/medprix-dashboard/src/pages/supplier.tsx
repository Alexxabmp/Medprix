import { useState } from "react";
import { ArrowUpRight, Building2, Plus } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import { suppliers } from "@/lib/data";
import type { ToastFn } from "@/lib/types";

export default function SupplierPage({ onToast }: { onToast: ToastFn }) {
    const [filter, setFilter] = useState("All statuses");
    const filtered = suppliers.filter(
        (supplier) => filter === "All statuses" || supplier.status === filter,
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
                    value="18"
                    caption="4 preferred partners"
                />
                <Summary
                    label="Open purchase value"
                    value="₱102,610"
                    caption="Across 3 orders"
                />
                <Summary
                    label="On-time delivery"
                    value="94.6%"
                    caption="+2.1% this quarter"
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
                            {filtered.map((supplier) => (
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
                                        <strong>{supplier.value}</strong>
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