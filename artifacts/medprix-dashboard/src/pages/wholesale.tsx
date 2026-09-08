import { useState } from "react";
import { ArrowDownToLine, Plus } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import type { ToastFn } from "@/lib/types";

export default function WholesalePage({ onToast }: { onToast: ToastFn }) {
    const [statusFilter, setStatusFilter] = useState("All statuses");
    const [orders, setOrders] = useState([
        {
            id: "WS-1608",
            customer: "St. Luke\u2019s Clinic",
            items: 38,
            value: "₱18,450",
            status: "In transit",
        },
        {
            id: "WS-1607",
            customer: "Greenfield Care Home",
            items: 24,
            value: "₱9,820",
            status: "Processing",
        },
        {
            id: "WS-1606",
            customer: "Mabini Medical Center",
            items: 62,
            value: "₱42,150",
            status: "Completed",
        },
        {
            id: "WS-1605",
            customer: "Brightwell Pharmacy",
            items: 17,
            value: "₱7,250",
            status: "Completed",
        },
    ]);

    const filtered = orders.filter(
        (order) =>
            statusFilter === "All statuses" || order.status === statusFilter,
    );

    return (
        <div>
            <PageHeading
                title="Wholesale"
                description="A focused view of partner orders and fulfillment."
                action={
                    <button
                        className="button dark"
                        data-testid="button-new-wholesale"
                        onClick={() => onToast("Wholesale order draft opened")}>
                        <Plus size={14} /> New wholesale order
                    </button>
                }
            />
            <div className="summary-strip">
                <Summary
                    label="Wholesale sales"
                    value="₱77,670"
                    caption="+14.2% this month"
                />
                <Summary
                    label="Open orders"
                    value="2"
                    caption="Ready for fulfillment"
                />
                <Summary
                    label="Partner accounts"
                    value="36"
                    caption="4 new this month"
                />
            </div>
            <section className="surface-card table-card">
                <div className="table-tools">
                    <div>
                        <h2 className="card-title">Partner orders</h2>
                        <p className="card-subtitle">Wholesale fulfillment queue</p>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <select
                            className="select"
                            data-testid="select-wholesale-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}>
                            <option>All statuses</option>
                            <option>Processing</option>
                            <option>In transit</option>
                            <option>Completed</option>
                        </select>
                        <button
                            className="button soft"
                            data-testid="button-wholesale-export"
                            onClick={() => onToast("Wholesale order list exported")}>
                            <ArrowDownToLine size={14} /> Export
                        </button>
                    </div>
                </div>
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Order</th>
                                <th>Partner</th>
                                <th>Items</th>
                                <th>Value</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((order) => {
                                const isCompleted = order.status === "Completed";
                                const isProcessing = order.status === "Processing";

                                return (
                                    <tr key={order.id}>
                                        <td>
                                            <strong>{order.id}</strong>
                                        </td>
                                        <td>{order.customer}</td>
                                        <td>{order.items}</td>
                                        <td>
                                            <strong>{order.value}</strong>
                                        </td>
                                        <td>
                                            <select
                                                className="select"
                                                data-testid={`select-status-${order.id}`}
                                                style={{
                                                    height: 30,
                                                    padding: "0 28px 0 12px",
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    borderRadius: 99,
                                                    border: "1px solid hsl(var(--border))",
                                                    background: isCompleted
                                                        ? "hsl(var(--mint))"
                                                        : isProcessing
                                                            ? "hsl(var(--yellow))"
                                                            : "hsl(var(--accent-soft))",
                                                    color: isCompleted
                                                        ? "#1B7A40"
                                                        : isProcessing
                                                            ? "#8B4500"
                                                            : "hsl(var(--accent))",
                                                    cursor: "pointer",
                                                    outline: "none",
                                                }}
                                                value={order.status}
                                                onChange={(e) => {
                                                    const newStatus = e.target.value;
                                                    setOrders(
                                                        orders.map((o) =>
                                                            o.id === order.id
                                                                ? { ...o, status: newStatus }
                                                                : o,
                                                        ),
                                                    );
                                                    onToast(
                                                        `Order ${order.id} status changed to ${newStatus}`,
                                                    );
                                                }}>
                                                <option value="Processing">Processing</option>
                                                <option value="In transit">In transit</option>
                                                <option value="Completed">Completed</option>
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}