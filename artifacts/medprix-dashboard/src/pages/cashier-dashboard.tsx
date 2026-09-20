import { useEffect, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  ClipboardList,
  Download,
  Eye,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import type { ProductItem, ToastFn } from "@/lib/types";

export interface ShiftReceipt {
  id: string;
  rawId?: number;
  time: string;
  dateTime: string;
  items: number;
  itemsList: { product: string; quantity: number; unitPrice: string; subtotal: string }[];
  itemsSummary: string;
  total: number;
  totalFormatted: string;
  subtotal: string;
  vat: string;
  discount: string;
  amountReceived: string;
  change: string;
  method: string;
  cashier: string;
  status: string;
}

type CartItem = {
  id: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
};

function getProductStock(product: ProductItem): number {
  if (Array.isArray(product.batches) && product.batches.length > 0) {
    return product.batches.reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0);
  }
  return Number(product.stock) || 0;
}

function getProductPrice(product: ProductItem): number {
  return parseFloat(product.price.replace("₱", "").replace(",", "")) || 0;
}

function formatPeso(value: number): string {
  return `₱${value.toFixed(2)}`;
}

function getBatchAllocations(product: ProductItem, quantity: number) {
  let remaining = quantity;
  const allocations: { batchNumber: string; quantity: number }[] = [];
  const batches = [...(product.batches || [])]
    .filter((batch) => Number(batch.quantity) > 0)
    .sort(
      (a, b) =>
        new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    );

  for (const batch of batches) {
    if (remaining <= 0) break;
    const allocated = Math.min(Number(batch.quantity), remaining);
    allocations.push({ batchNumber: batch.batchNumber, quantity: allocated });
    remaining -= allocated;
  }

  if (remaining > 0 && product.batches && product.batches.length > 0) {
    allocations.push({ batchNumber: product.batches[0].batchNumber, quantity: remaining });
    remaining = 0;
  }

  return remaining === 0 ? allocations : null;
}

export default function CashierDashboardPage({ onToast }: { onToast: ToastFn }) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productLoadError, setProductLoadError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "GCash" | "Card">(
    "Cash",
  );
  const [discountType, setDiscountType] = useState<"None" | "Senior" | "PWD">(
    "None",
  );
  const [cashTendered, setCashTendered] = useState<string>("200");
  const [searchReceipt, setSearchReceipt] = useState("");
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ShiftReceipt | null>(null);
  const [receipts, setReceipts] = useState<ShiftReceipt[]>([]);

  const fetchProducts = async () => {
    try {
      setIsLoadingProducts(true);
      setProductLoadError("");
      const response = await fetch("/api/inventory", {
        credentials: "include",
      });
      const contentType = response.headers.get("content-type");
      if (!response.ok || !contentType?.includes("application/json")) {
        throw new Error("Inventory API unavailable");
      }
      const data = await response.json();
      const liveProducts = Array.isArray(data.products) ? data.products : [];
      setProducts(liveProducts);
      setSelectedProductId((current) =>
        current && liveProducts.some((product: ProductItem) => product.id === current)
          ? current
          : liveProducts[0]?.id || "",
      );
    } catch {
      setProducts([]);
      setSelectedProductId("");
      setProductLoadError("No live inventory products available.");
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await fetch("/api/admin/transactions", {
        credentials: "include",
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data)) return;
      const mapped: ShiftReceipt[] = data.map((t: any) => {
        const totalNum =
          parseFloat(String(t.total || "0").replace("₱", "").replace(",", "")) || 0;
        const itemCount = Array.isArray(t.items)
          ? t.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)
          : 1;
        const itemsSummary =
          Array.isArray(t.items) && t.items.length > 0
            ? t.items.map((it: any) => `${it.product} (${it.quantity})`).join(", ")
            : `${itemCount} item(s)`;
        return {
          id: t.transactionNumber || `TRX-${t.id}`,
          rawId: t.id,
          time: t.dateTime
            ? t.dateTime.split(", ")[1] || t.dateTime
            : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          dateTime: t.dateTime || new Date().toLocaleString(),
          items: itemCount,
          itemsList: t.items || [],
          itemsSummary,
          total: totalNum,
          totalFormatted: t.total || formatPeso(totalNum),
          subtotal: t.subtotal || formatPeso(totalNum / 1.12),
          vat: t.vat || formatPeso(totalNum - totalNum / 1.12),
          discount: t.discount || "₱0.00",
          amountReceived: t.amountReceived || t.total || "₱0.00",
          change: t.change || "₱0.00",
          method: t.payment || "Cash",
          cashier: t.user || "Cashier",
          status: t.status || "Completed",
        };
      });
      setReceipts(mapped);
    } catch {
      // Keep existing receipts
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchTransactions();
  }, []);

  const filteredProducts = products.filter((product) => {
    const q = productSearch.toLowerCase();
    return (
      !q ||
      product.name.toLowerCase().includes(q) ||
      (product.genericName && product.genericName.toLowerCase().includes(q)) ||
      product.sku.toLowerCase().includes(q) ||
      product.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (filteredProducts.length === 0) return;
    if (!filteredProducts.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(filteredProducts[0].id);
    }
  }, [filteredProducts, selectedProductId]);


  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const isDiscountEligible = discountType !== "None";
  const discountRate = isDiscountEligible ? 0.2 : 0;
  const discountAmount = subtotal * discountRate;
  const vat = isDiscountEligible ? 0 : subtotal * 0.12;
  const total = subtotal - discountAmount + vat;
  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue =
    paymentMethod === "Cash" ? Math.max(0, tenderedNum - total) : 0;

  const handleAddToCart = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) {
      onToast("Select a live inventory product first");
      return;
    }
    const availableStock = getProductStock(prod);
    if (availableStock <= 0) {
      onToast(`${prod.name} is out of stock`);
      return;
    }
    const existing = cart.find((item) => item.id === prod.id);
    if ((existing?.qty || 0) + qty > availableStock) {
      onToast(`Only ${availableStock} unit(s) available for ${prod.name}`);
      return;
    }
    const numericPrice = getProductPrice(prod);

    const existingIndex = cart.findIndex((item) => item.id === prod.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].qty += qty;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          price: numericPrice,
          qty,
        },
      ]);
    }
    onToast(`Added ${prod.name} (x${qty}) to cart`);
    setQty(1);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.id === id) {
            const product = products.find((p) => p.id === id);
            const availableStock = product ? getProductStock(product) : item.qty;
            const newQty = item.qty + delta;
            if (newQty > availableStock) {
              onToast(`Only ${availableStock} unit(s) available for ${item.name}`);
              return item;
            }
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as typeof cart,
    );
  };

  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      onToast("Cannot checkout an empty cart");
      return;
    }
    if (paymentMethod === "Cash" && tenderedNum < total) {
      onToast("Cash tendered is less than total amount due");
      return;
    }

    const allocations = cart.map((item) => {
      const product = products.find((p) => p.id === item.id);
      if (!product) return { item, product: null, batches: null };
      return { item, product, batches: getBatchAllocations(product, item.qty) };
    });

    const unavailable = allocations.find((entry) => !entry.product || !entry.batches);
    if (unavailable) {
      onToast(`Insufficient live stock for ${unavailable.item.name}`);
      await fetchProducts();
      return;
    }

    const nextNumber = 9400 + receipts.length + 1;
    const newId = `CS-${nextNumber}`;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateTime = now.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const cashierName =
      localStorage.getItem("medprix-fullname") ||
      localStorage.getItem("medprix-username") ||
      "Cashier Staff";

    try {
      for (const entry of allocations) {
        if (!entry.product || !entry.batches) continue;

        for (const batch of entry.batches) {
          const response = await fetch(
            `/api/inventory/products/${entry.product.id}/stock-out`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                batchNumber: batch.batchNumber,
                quantity: batch.quantity,
                reason: `Retail sale ${newId}`,
              }),
            },
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || `Failed to deduct ${entry.item.name}`);
          }
        }
      }
    } catch (error) {
      await fetchProducts();
      onToast(error instanceof Error ? error.message : "Could not complete stock deduction");
      return;
    }

    const transactionPayload = {
      transactionNumber: newId,
      dateTime,
      user: cashierName,
      businessType: "Retail" as const,
      customer: "Walk-in Customer",
      total: formatPeso(total),
      subtotal: formatPeso(subtotal),
      discount: formatPeso(discountAmount),
      vat: formatPeso(vat),
      amountReceived:
        paymentMethod === "Cash" ? formatPeso(tenderedNum) : formatPeso(total),
      change: formatPeso(changeDue),
      payment: paymentMethod,
      status: "Completed" as const,
      items: cart.map((item) => ({
        product: item.name,
        quantity: item.qty,
        unitPrice: formatPeso(item.price),
        subtotal: formatPeso(item.price * item.qty),
      })),
    };

    try {
      await fetch("/api/admin/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transactionPayload),
      });

      fetch("/api/admin/system-logs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: cashierName,
          role: "Cashier",
          action: "Sales Transaction",
          module: "Sales POS",
          description: `Completed retail receipt ${newId} (${formatPeso(total)})`,
          status: "Success",
          deviceIp: "POS Terminal 1",
        }),
      }).catch(() => {});

      fetch("/api/admin/user-activities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: cashierName,
          role: "Cashier",
          activity: "Transaction completed",
          module: "Sales & Wholesale Activity",
          description: `Processed retail receipt ${newId} (${formatPeso(total)})`,
          flag: "Normal",
        }),
      }).catch(() => {});
    } catch (err) {
      console.warn("Failed to persist transaction to backend:", err);
    }

    const newReceipt: ShiftReceipt = {
      id: newId,
      time: timeStr,
      dateTime,
      items: cart.reduce((a, b) => a + b.qty, 0),
      itemsList: transactionPayload.items,
      itemsSummary: cart.map((item) => `${item.name} (${item.qty})`).join(", "),
      total: total,
      totalFormatted: formatPeso(total),
      subtotal: formatPeso(subtotal),
      vat: formatPeso(vat),
      discount: formatPeso(discountAmount),
      amountReceived: transactionPayload.amountReceived,
      change: formatPeso(changeDue),
      method: paymentMethod,
      cashier: cashierName,
      status: "Completed",
    };

    setSelectedReceipt(newReceipt);
    setReceipts((prev) => [newReceipt, ...prev]);
    setCart([]);
    setCashTendered("");
    await fetchProducts();
    await fetchTransactions();
    onToast(
      `Sale completed! Receipt ${newId} printed.${isDiscountEligible ? ` ${discountType} discount applied.` : ""} Change: ₱${changeDue.toFixed(2)}`,
    );
  };

  const filteredReceipts = receipts.filter(
    (r) =>
      r.id.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      r.method.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      (r.itemsSummary && r.itemsSummary.toLowerCase().includes(searchReceipt.toLowerCase())),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeading
        title="Cashier Terminal & Register"
        description="Shift 1 (08:00 AM – 04:00 PM) · Active Terminal #01"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              className="pill success"
              style={{ padding: "6px 12px", fontSize: 12 }}>
              <ShieldCheck size={13} style={{ marginRight: 4 }} /> Register
              Active
            </span>
            <label className="date-control" data-testid="control-cashier-date">
              <CalendarDays size={14} />
              <span>Shift Date</span>
              <input
                type="date"
                aria-label="Select date"
                defaultValue="2026-08-31"
              />
            </label>
          </div>
        }
      />

      {/* Full-Screen Counter Sale Checkout Layout */}
      <section className="surface-card" style={{ padding: "22px 24px", width: "100%", borderRadius: 20 }}>
        <div className="card-header" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2
              className="card-title"
              style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShoppingCart size={18} /> Counter Sale Checkout
            </h2>
            <p className="card-subtitle">
              Scan or select products to process transaction · Terminal #01
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {cart.length > 0 && (
              <span className="pill neutral" style={{ fontSize: 11 }}>
                {cart.reduce((a, b) => a + b.qty, 0)} items in cart
              </span>
            )}
            {cart.length > 0 && (
              <button
                type="button"
                className="button soft"
                style={{ fontSize: 12 }}
                onClick={() => setCart([])}>
                <Trash2 size={13} style={{ marginRight: 4 }} /> Clear Cart
              </button>
            )}
          </div>
        </div>

        {/* Product Selection Form Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, .8fr) minmax(260px, 1fr) 90px auto",
            gap: 12,
            alignItems: "flex-end",
            padding: "14px 16px",
            background: "hsl(var(--surface-soft))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 14,
            marginBottom: 20,
          }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted))", display: "block", marginBottom: 5 }}>
              Search Product
            </label>
            <div className="search-wrap" style={{ height: 39 }}>
              <Search size={15} />
              <input
                data-testid="input-pos-product-search"
                type="search"
                placeholder="Search product, SKU, category..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted))", display: "block", marginBottom: 5 }}>
              Select Product / Medicine *
            </label>
            <select
              className="select"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={isLoadingProducts || filteredProducts.length === 0}
              style={{ width: "100%", height: 39 }}>
              {filteredProducts.length === 0 ? (
                <option value="">
                  {isLoadingProducts
                    ? "Loading live inventory..."
                    : products.length === 0
                      ? "No live products available"
                      : "No products match your search"}
                </option>
              ) : (
                filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) - {p.price} [Stock: {getProductStock(p)}]
                  </option>
                ))
              )}
            </select>
            {productLoadError && (
              <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>
                {productLoadError}
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted))", display: "block", marginBottom: 5, textAlign: "center" }}>
              Quantity
            </label>
            <input
              type="number"
              min="1"
              max="99"
              value={qty}
              onChange={(e) =>
                setQty(Math.max(1, parseInt(e.target.value) || 1))
              }
              style={{
                width: "100%",
                height: 39,
                borderRadius: 11,
                border: "1px solid hsl(var(--border))",
                textAlign: "center",
                background: "hsl(var(--surface))",
                color: "hsl(var(--foreground))",
                fontWeight: 600,
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <button
              type="button"
              className="button dark"
              disabled={isLoadingProducts || filteredProducts.length === 0}
              style={{ height: 39, padding: "0 18px", display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={handleAddToCart}>
              <Plus size={15} /> Add to Cart
            </button>
          </div>
        </div>

        {/* 2-Column POS Layout inside full-width card */}
        <div className="pos-checkout-grid">
          {/* Left: Cart Items Table */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Transaction Items ({cart.length})
              </h4>
            </div>

            <div
              className="table-scroll"
              style={{
                minHeight: 280,
                maxHeight: 480,
                border: "1px solid hsl(var(--border))",
                borderRadius: 14,
                overflowX: "auto",
                background: "hsl(var(--surface))",
              }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th style={{ textAlign: "center" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Unit Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          textAlign: "center",
                          padding: "60px 20px",
                          color: "hsl(var(--muted))",
                        }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "hsl(var(--surface-soft))", display: "grid", placeItems: "center" }}>
                            <ShoppingCart size={22} className="muted" />
                          </div>
                          <strong style={{ fontSize: 14, color: "hsl(var(--foreground))" }}>Cart is empty</strong>
                          <span style={{ fontSize: 12 }}>Select products from the bar above to begin checkout.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    cart.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <div className="muted" style={{ fontSize: 10 }}>
                            {item.sku}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              background: "hsl(var(--surface-soft))",
                              padding: "3px 6px",
                              borderRadius: 8,
                              border: "1px solid hsl(var(--border))",
                            }}>
                            <button
                              type="button"
                              className="icon-button"
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                fontSize: 12,
                                border: 0,
                                fontWeight: 700,
                              }}
                              onClick={() => handleUpdateCartQty(item.id, -1)}>
                              -
                            </button>
                            <span style={{ minWidth: 18, fontWeight: 700, fontSize: 12 }}>
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              className="icon-button"
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                fontSize: 12,
                                border: 0,
                                fontWeight: 700,
                              }}
                              onClick={() => handleUpdateCartQty(item.id, 1)}>
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          ₱{item.price.toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          ₱{(item.price * item.qty).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="icon-button"
                            style={{
                              width: 24,
                              height: 24,
                              border: 0,
                              color: "hsl(var(--danger))",
                            }}
                            title="Remove item"
                            onClick={() => handleRemoveFromCart(item.id)}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Payment & Checkout Summary */}
          <form
            onSubmit={handleCheckout}
            style={{
              background: "hsl(var(--surface-soft))",
              padding: 20,
              borderRadius: 16,
              border: "1px solid hsl(var(--border))",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}>
            <div>
              <h4 style={{ margin: "0 0 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Order Summary &amp; Payment
              </h4>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  fontSize: 13,
                  background: "hsl(var(--surface))",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "hsl(var(--muted))",
                  }}>
                  <span>Subtotal</span>
                  <span style={{ fontWeight: 600, color: "hsl(var(--foreground))" }}>₱{subtotal.toFixed(2)}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "hsl(var(--muted))",
                  }}>
                  <span>VAT (12% included)</span>
                  <span>₱{vat.toFixed(2)}</span>
                </div>
                {isDiscountEligible && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "#34C759",
                      fontWeight: 700,
                    }}>
                    <span>{discountType} Privilege (20%)</span>
                    <span>-₱{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ height: 1, background: "hsl(var(--border))", margin: "2px 0" }} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Total Amount</span>
                  <span style={{ fontFamily: "var(--app-font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-.04em", color: "hsl(var(--foreground))" }}>
                    ₱{total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Discount Tabs */}
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "hsl(var(--muted))",
                  display: "block",
                  marginBottom: 6,
                }}>
                Customer Privilege Discount
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {(["None", "Senior", "PWD"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`button ${discountType === type ? "dark" : "soft"}`}
                    style={{ height: 35, fontSize: 11, padding: "0 4px" }}
                    onClick={() => setDiscountType(type)}>
                    {type === "None" ? "Standard (None)" : `${type} (-20%)`}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method Tabs */}
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "hsl(var(--muted))",
                  display: "block",
                  marginBottom: 6,
                }}>
                Payment Method
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {(["Cash", "GCash", "Card"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`button ${paymentMethod === method ? "dark" : "soft"}`}
                    style={{ height: 35, fontSize: 12 }}
                    onClick={() => setPaymentMethod(method)}>
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Tendered & Change Due */}
            {paymentMethod === "Cash" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  background: "hsl(var(--surface))",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                }}>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "hsl(var(--muted))",
                      display: "block",
                      marginBottom: 4,
                    }}>
                    Cash Tendered
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    style={{
                      width: "100%",
                      height: 38,
                      borderRadius: 10,
                      padding: "0 10px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--surface-soft))",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "hsl(var(--muted))",
                      display: "block",
                      marginBottom: 4,
                    }}>
                    Change Due
                  </label>
                  <div
                    style={{
                      height: 38,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 10px",
                      fontWeight: 700,
                      fontSize: 14,
                      color: changeDue >= 0 ? "#34C759" : "hsl(var(--danger))",
                      background: "hsl(var(--surface-soft))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                    }}>
                    ₱{changeDue.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="button dark full"
              disabled={cart.length === 0}
              style={{
                height: 46,
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}>
              <Receipt size={16} /> Complete &amp; Print Receipt (₱
              {total.toFixed(2)})
            </button>
          </form>
        </div>
      </section>

      {/* Recent Shift Receipts Section */}
      <section
        className="surface-card"
        style={{ padding: "22px 24px", width: "100%", borderRadius: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
              <Receipt size={16} /> Recent Shift Receipts ({filteredReceipts.length})
            </h3>
            <p className="card-subtitle" style={{ margin: "2px 0 0" }}>
              Completed transactions from this active register shift.
            </p>
          </div>
          <div className="search-wrap" style={{ width: 260 }}>
            <Search size={14} />
            <input
              type="search"
              placeholder="Search receipt #, method, item..."
              value={searchReceipt}
              onChange={(e) => setSearchReceipt(e.target.value)}
              style={{ height: 34, fontSize: 12 }}
            />
          </div>
        </div>

        <div
          className="table-scroll"
          style={{
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            overflowX: "auto",
          }}>
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Time</th>
                <th>Items Sold</th>
                <th>Payment</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Status</th>
                <th style={{ textAlign: "center", width: 90 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.id}</strong>
                  </td>
                  <td className="muted">{r.time}</td>
                  <td
                    style={{
                      maxWidth: 240,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontSize: 12,
                    }}>
                    {r.itemsSummary || `${r.items} item(s)`}
                  </td>
                  <td>
                    <span
                      className={`pill ${r.method === "Cash" ? "success" : "neutral"}`}
                      style={{ fontSize: 10 }}>
                      {r.method}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <strong>{r.totalFormatted || formatPeso(r.total)}</strong>
                  </td>
                  <td>
                    <span className="pill success" style={{ fontSize: 10 }}>
                      {r.status || "Completed"}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="button soft"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={() => setSelectedReceipt(r)}>
                      <Eye size={12} style={{ marginRight: 4 }} /> View
                    </button>
                  </td>
                </tr>
              ))}
              {filteredReceipts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: "center", padding: 28 }}
                    className="muted">
                    No receipts recorded for this shift yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal: Receipt Details & Print */}
      {selectedReceipt && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedReceipt(null)}
          style={{ zIndex: 1100 }}>
          <div
            className="modal dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440, width: "90%" }}>
            <div className="modal-header">
              <div>
                <h2>Receipt Details ({selectedReceipt.id})</h2>
                <p className="modal-sub">
                  Processed at {selectedReceipt.time} by {selectedReceipt.cashier}
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedReceipt(null)}>
                <X size={16} />
              </button>
            </div>
            <div
              style={{
                padding: "14px 0",
                display: "grid",
                gap: 10,
                fontSize: 13,
                borderTop: "1px solid hsl(var(--border))",
                borderBottom: "1px solid hsl(var(--border))",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Transaction Status</span>
                <span className="pill success">{selectedReceipt.status || "Completed"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Payment Method</span>
                <strong>{selectedReceipt.method}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span className="muted">Items Summary</span>
                <span
                  style={{
                    fontSize: 11,
                    textAlign: "right",
                    maxWidth: 220,
                  }}>
                  {selectedReceipt.itemsSummary || `${selectedReceipt.items} item(s)`}
                </span>
              </div>
              {selectedReceipt.subtotal && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "hsl(var(--muted))" }}>
                  <span>Subtotal</span>
                  <span>{selectedReceipt.subtotal}</span>
                </div>
              )}
              {selectedReceipt.vat && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "hsl(var(--muted))" }}>
                  <span>VAT (12% incl.)</span>
                  <span>{selectedReceipt.vat}</span>
                </div>
              )}
              {selectedReceipt.discount && selectedReceipt.discount !== "₱0.00" && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#34C759", fontWeight: 600 }}>
                  <span>Privilege Discount</span>
                  <span>-{selectedReceipt.discount}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 16,
                  fontWeight: 700,
                  paddingTop: 8,
                  borderTop: "1px solid hsl(var(--border))",
                }}>
                <span>Total Amount</span>
                <span>{selectedReceipt.totalFormatted || formatPeso(selectedReceipt.total)}</span>
              </div>
              {selectedReceipt.amountReceived && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Amount Tendered</span>
                  <span>{selectedReceipt.amountReceived}</span>
                </div>
              )}
              {selectedReceipt.change && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#34C759", fontWeight: 700 }}>
                  <span>Change Due</span>
                  <span>{selectedReceipt.change}</span>
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="button dark"
                onClick={() => {
                  onToast(`Printing receipt ${selectedReceipt.id}...`);
                  window.print();
                }}>
                <Download size={13} style={{ marginRight: 4 }} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Modal: End of Shift Z-Read Confirmation */}
      {showShiftModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowShiftModal(false)}>
          <div
            className="modal dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div>
                <h2>End of Shift Z-Read Report</h2>
                <p className="modal-sub">
                  Confirm shift cash drawer count and generate Z-Report.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowShiftModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: "10px 0",
                fontSize: 13,
              }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                }}>
                <span>Opening Float</span>
                <span>₱3,500.00</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                }}>
                <span>Recorded Cash Sales</span>
                <span>₱5,000.00</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                  fontWeight: 700,
                }}>
                <span>Expected Drawer Total</span>
                <span>₱8,500.00</span>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="button dark"
                onClick={() => {
                  onToast("Shift closed successfully. Z-Read report printed.");
                  setShowShiftModal(false);
                }}>
                <Check size={14} /> Confirm & Print Z-Read
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

