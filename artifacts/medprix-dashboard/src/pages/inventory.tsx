import { useState } from "react";
import { ClipboardList, Package, Search } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import { products } from "@/lib/data";
import type { ToastFn } from "@/lib/types";

export default function InventoryPage({ onToast }: { onToast: ToastFn }) {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("All status");
    const filtered = products.filter(
        (product) =>
            (filter === "All status" || product.status === filter) &&
            `${product.name} ${product.sku} ${product.category}`
                .toLowerCase()
                .includes(search.toLowerCase()),
    );
    return (
        <div>
            <PageHeading
                title="Inventory"
                description="A quiet, current view of every product on your shelves."
                action={
                    <button
                        className="button dark"
                        data-testid="button-inventory-count"
                        onClick={() => onToast("Inventory count session started")}>
                        <ClipboardList size={14} /> Start count
                    </button>
                }
            />
            <div className="summary-strip">
                <Summary
                    label="Total products"
                    value="850"
                    caption="Across 12 categories"
                />
                <Summary
                    label="Low stock"
                    value="95"
                    caption="Needs attention"
                    tone="warning"
                />
                <Summary
                    label="Inventory value"
                    value="₱825,450"
                    caption="+6.2% this month"
                />
            </div>
            <section className="surface-card table-card">
                <div className="table-tools">
                    <div className="search-wrap">
                        <Search size={15} />
                        <input
                            data-testid="input-inventory-search"
                            type="search"
                            placeholder="Search products, SKU, category..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        className="select"
                        data-testid="select-inventory-filter"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}>
                        <option>All status</option>
                        <option>Available</option>
                        <option>Low stock</option>
                        <option>Out of stock</option>
                    </select>
                </div>
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Category</th>
                                <th>In stock</th>
                                <th>Reorder point</th>
                                <th>Unit price</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((product) => (
                                <tr key={product.id} data-testid={`row-product-${product.id}`}>
                                    <td>
                                        <div className="product-cell">
                                            <span className="product-symbol">
                                                <Package size={15} />
                                            </span>
                                            <div>
                                                <strong>{product.name}</strong>
                                                <div className="muted" style={{ fontSize: 10 }}>
                                                    {product.sku}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="muted">{product.category}</td>
                                    <td>
                                        <strong>{product.stock}</strong>{" "}
                                        <span className="muted">units</span>
                                    </td>
                                    <td className="muted">{product.reorder}</td>
                                    <td>{product.price}</td>
                                    <td>
                                        <span
                                            className={`status-dot ${product.status === "Available" ? "green" : product.status === "Low stock" ? "amber" : "red"}`}
                                        />
                                        {product.status}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filtered.length === 0 && (
                        <div className="empty-state">
                            <Package size={25} />
                            <div>No products match that search.</div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}