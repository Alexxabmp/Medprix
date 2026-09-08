import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import { purchaseOrders } from "@/lib/data";
import type { ToastFn } from "@/lib/types";

export default function ProcurementPage({ onToast }: { onToast: ToastFn }) {
    const [status, setStatus] = useState("All orders");
    const [orders, setOrders] = useState(purchaseOrders);
    const statuses = [
        "All orders",
        "Pending approval",
        "Approved",
        "In transit",
        "Received",
    ];
    const filtered = orders.filter(
        (order) => status === "All orders" || order.status === status,
    );

    return (
        <div>
            <PageHeading
                title="Procurement"
                description="Keep purchasing predictable from request to receiving."
                action={
                    <button
                        className="button dark"
                        data-testid="button-create-po"
                        onClick={() => onToast("New purchase order draft created")}>
                        <Plus size={14} /> New purchase order
                    </button>
                }
            />
            <div className="summary-strip">
                <Summary label="Open orders" value="3" caption="₱102,610 committed" />
                <Summary
                    label="Awaiting approval"
                    value="1"
                    caption="Needs your review"
                    tone="warning"
                />
                <Summary
                    label="Received this month"
                    value="24"
                    caption="+5 vs last month"
                />
            </div>
            <section className="surface-card table-card">
                <div className="table-tools">
                    <div>
                        <h2 className="card-title">Purchase orders</h2>
                        <p className="card-subtitle">Latest orders and delivery status</p>
                    </div>
                    <select
                        className="select"
                        data-testid="select-procurement-status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}>
                        {statuses.map((item) => (
                            <option key={item}>{item}</option>
                        ))}
                    </select>
                </div>
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Order</th>
                                <th>Supplier</th>
                                <th>Placed</th>
                                <th>Items</th>
                                <th>Value</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((order) => {
                                const isReceived = order.status === "Received";
                                const isPending = order.status === "Pending approval";
                                const isInTransit = order.status === "In transit";

                                return (
                                    <tr key={order.id}>
                                        <td>
                                            <strong>{order.id}</strong>
                                        </td>
                                        <td>{order.supplier}</td>
                                        <td className="muted">{order.date}</td>
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
                                                    background: isReceived
                                                        ? "hsl(var(--mint))"
                                                        : isPending
                                                            ? "hsl(var(--peach))"
                                                            : isInTransit
                                                                ? "hsl(var(--yellow))"
                                                                : "hsl(var(--surface-soft))",
                                                    color: isReceived
                                                        ? "#1B7A40"
                                                        : isPending
                                                            ? "#B02020"
                                                            : isInTransit
                                                                ? "#8B4500"
                                                                : "hsl(var(--foreground))",
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
                                                    onToast(`PO ${order.id} status changed to ${newStatus}`);
                                                }}>
                                                <option value="Pending approval">Pending approval</option>
                                                <option value="Approved">Approved</option>
                                                <option value="In transit">In transit</option>
                                                <option value="Received">Received</option>
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