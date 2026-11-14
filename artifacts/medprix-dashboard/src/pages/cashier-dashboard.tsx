import { AppTooltip } from "@/components/ui/tooltip";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { calculateRetailLine } from "@workspace/api-zod";
import { productStock as getProductStock, batchAllocations as getBatchAllocations, productAvailability } from "@/lib/stock-guidance";
import { safeError, readResponse } from "@/lib/feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Download,
  Eye,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { DateControl } from "@/components/custom-ui/date-control";
import { formatCalendarDate, recordsOnDate } from "@/lib/business-date";
import { useBusinessDate } from "@/lib/use-business-date";
import { createCheckoutSubmitter, type PendingCheckout } from "@/lib/checkout";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { printReceipt } from "@/lib/receipt-print";
import type { ProductItem, ToastFn, ShiftReceipt } from "@/lib/types";
import {
  usePharmacyInventory,
  usePharmacyTransactions,
  recordTransaction,
  mapTransactionsToReceipts,
} from "@/lib/pharmacy-store";

export type { ShiftReceipt };

type CartItem = {
  id: string;
  name: string;
  sku: string;
  price: number;
  isVatExempt: boolean;
  qty: number;
};

function getProductPrice(product: ProductItem): number {
  return parseFloat(product.price.replace("₱", "").replace(",", "")) || 0;
}

function formatPeso(value: number): string {
  return `₱${value.toFixed(2)}`;
}

export default function CashierDashboardPage({ onToast }: { onToast: ToastFn }) {
  const { date: shiftDate, selectDate } = useBusinessDate();
  const { items: products, setItems: setProducts } = usePharmacyInventory();
  const { receipts, setReceipts, refresh: fetchTransactions } = usePharmacyTransactions();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productLoadError, setProductLoadError] = useState("");
  const [stockChecking, setStockChecking] = useState(() => products.length === 0);
  const [checkoutError, setCheckoutError] = useState("");
  const stockDayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  async function refreshStock(forceSpinner = false) {
    clearTimeout(stockDayTimer.current);
    if (forceSpinner || products.length === 0) setStockChecking(true);
    try {
      const response = await fetch("/api/inventory", { credentials: "include", signal: AbortSignal.timeout(15000) });
      const data = await readResponse(response, "Could not verify current stock. Please refresh stock.");
      if (!Array.isArray(data.products)) throw new Error("Invalid stock response. Please refresh stock.");
      if (!data.pharmacyDate || !Number.isFinite(data.pharmacyDayRemainingMs)) throw new Error("Stock calendar data is missing. Restart the API and refresh stock.");
      setProducts(data.products);
      stockDayTimer.current = setTimeout(() => { void refreshStock(); }, Math.min(data.pharmacyDayRemainingMs, 2_147_483_647));
      setProductLoadError("");
      return data.products as ProductItem[];
    } catch (failure) { setProductLoadError(safeError(failure)); return null; }
    finally { setStockChecking(false); }
  }
  useEffect(() => { void refreshStock(); const refresh = () => { void refreshStock(); }; window.addEventListener("focus", refresh); return () => { clearTimeout(stockDayTimer.current); window.removeEventListener("focus", refresh); }; }, []);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const submitCheckout = useRef<ReturnType<typeof createCheckoutSubmitter> | null>(null);
  if (!submitCheckout.current) submitCheckout.current = createCheckoutSubmitter();
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [checkedMissing, setCheckedMissing] = useState(false);
  function closeReceipt() {
    setSelectedReceipt(null);
  }
  useDialogAccessibility(!!selectedReceipt, ".pos-receipt-dialog", closeReceipt);
  useEffect(() => {
    if (pendingCheckout && !isSubmitting) document.getElementById("pos-check-result")?.focus();
  }, [pendingCheckout, isSubmitting]);
  useEffect(() => {
    let active=true;
    submitCheckout.current!.initialize().then(pending=>{
      if(!active)return;setCheckoutReady(true);setPendingCheckout(pending??null);
      if(!pending)return;
      setCart(pending.payload.items.map(item=>({id:item.productId,name:item.product,sku:String(item.sku||''),qty:item.quantity,price:Number(item.unitPrice.replace(/[^0-9.]/g,'')),isVatExempt:item.isVatExempt===true})));
      setCashTendered(pending.payload.amountReceived.replace(/[^0-9.]/g,''));setPaymentMethod(pending.payload.payment);setDiscountType(pending.payload.discountType);
    }).catch(failure=>{if(active)setCheckoutError(safeError(failure));});
    return()=>{active=false;};
  }, []);

  async function finishCheckout(saved: any) {
    recordTransaction(saved);
    setSelectedReceipt(mapTransactionsToReceipts([saved])[0]);
    setCart([]);
    setCashTendered("");
    setPendingCheckout(null);
    setCheckedMissing(false);
    setCheckoutError("");
    onToast(`Sale saved. Receipt ${saved.transactionNumber} is ready to print. Change: ${saved.change}`);
    await refreshStock();
    void fetchTransactions();
  }
  async function resolveCheckout(retry = false) {
    if (submitting.current) return;
    submitting.current = true; setIsSubmitting(true);
    try {
      const saved = retry ? await submitCheckout.current!.retry() : await submitCheckout.current!.reconcile();
      if (saved) await finishCheckout(saved);
      else { setCheckedMissing(true); setCheckoutError("No committed checkout was found. You can retry the same checkout using its retained reference."); }
    } catch (error) { setCheckoutError(safeError(error, "Could not check this checkout. Keep its reference and try checking again.")); }
    finally { setPendingCheckout(submitCheckout.current!.getPending() || null); submitting.current = false; setIsSubmitting(false); }
  }


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

  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const selectedProductStock = selectedProduct ? getProductStock(selectedProduct) : 0;
  const selectedCartQuantity = cart.find((item) => item.id === selectedProductId)?.qty || 0;
  const selectedAvailableStock = Math.max(0, selectedProductStock - selectedCartQuantity);
  const stockStatus = selectedProduct ? productAvailability(selectedProduct, selectedCartQuantity) : "";
  const stockBlocked = stockChecking || !!productLoadError || !selectedProduct || !!stockStatus;
  const previousAvailability = useRef({ id: "", status: "" });
  useEffect(() => {
    if (stockChecking || productLoadError) return;
    const previous = previousAvailability.current;
    previousAvailability.current = { id: selectedProductId, status: stockStatus };
    if (selectedProduct && previous.id === selectedProductId && previous.status === "" &&
        (stockStatus === "Out of stock" || stockStatus === "Stock unavailable")) {
      onToast({ message: `${selectedProduct.name} is no longer available. Choose another medicine.`, variant: "warning" });
    }
  }, [stockChecking, productLoadError, selectedProductId, stockStatus, selectedProduct, onToast]);
  const getCartAvailableStock = (item: CartItem) => {
    const product = products.find((entry) => entry.id === item.id);
    return product ? getProductStock(product) : item.qty;
  };

  useEffect(() => {
    if (!filteredProducts.some((product) => product.id === selectedProductId)) {
      setSelectedProductId("");
    }
  }, [filteredProducts, selectedProductId]);

  useEffect(() => {
    setQty((current) => Math.max(1, Math.min(current, Math.max(1, selectedAvailableStock))));
  }, [selectedProductId, selectedAvailableStock]);


  const subtotalCents = cart.reduce((sum, item) => sum + Math.round(item.price * 100) * item.qty, 0);
  const pendingAmount = (value: unknown, fallback: number) => pendingCheckout && value != null ? Number(String(value).replace(/[^0-9.]/g,"")) : fallback;
  const subtotal = pendingAmount(pendingCheckout?.payload.subtotal, subtotalCents / 100);
  const isDiscountEligible = discountType !== "None";
  const lineAmounts = cart.map(item=>calculateRetailLine(BigInt(Math.round(item.price*100)),item.qty,item.isVatExempt,discountType!=="None"));
  const discountAmount = pendingAmount(pendingCheckout?.payload.discount, Number(lineAmounts.reduce((sum,line)=>sum+line.discount,0n))/100);
  const vat = pendingAmount(pendingCheckout?.payload.vat, Number(lineAmounts.reduce((sum,line)=>sum+line.vat,0n))/100);
  const vatRelief = pendingAmount(pendingCheckout?.payload.vatRelief, Number(lineAmounts.reduce((sum,line)=>sum+line.relief,0n))/100);
  const total = pendingAmount(pendingCheckout?.payload.total, Number(lineAmounts.reduce((sum,line)=>sum+line.net,0n))/100);
  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue =
    paymentMethod === "Cash" ? Math.max(0, tenderedNum - total) : 0;

  const handleAddToCart = () => {
    if (stockBlocked) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) {
      onToast("Select a live inventory product first");
      return;
    }
    if (typeof prod.isVatExempt !== "boolean") { onToast("Set this product's VAT treatment in Inventory before adding it."); return; }
    const availableStock = getProductStock(prod);
    const existing = cart.find((item) => item.id === prod.id);
    const remainingStock = Math.max(0, availableStock - (existing?.qty || 0));
    if (remainingStock <= 0) {
      onToast(`${prod.name} has no more stock available to add`);
      return;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > remainingStock) {
      onToast(`Enter a whole quantity from 1 to ${remainingStock} for ${prod.name}`);
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
          isVatExempt: prod.isVatExempt,
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

  const handleUpdateCartQty = (id: string, requestedValue: number | string) => {
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;

    const isTypedValue = typeof requestedValue === "string";
    if (isTypedValue && !requestedValue.trim()) return;
    const requestedQuantity = Number(requestedValue);

    if (requestedQuantity <= 0) {
      if (isTypedValue) {
        onToast("Cart quantity must be at least 1");
        return;
      }
      handleRemoveFromCart(id);
      return;
    }

    const product = products.find((entry) => entry.id === id);
    const availableStock = product ? getProductStock(product) : item.qty;
    if (!Number.isFinite(requestedQuantity) || !Number.isInteger(requestedQuantity)) {
      onToast("Cart quantity must be a whole number");
      return;
    }
    if (requestedQuantity > availableStock) {
      onToast(`Only ${availableStock} unit(s) available for ${item.name}`);
      return;
    }

    setCart((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, qty: requestedQuantity } : entry,
      ),
    );
  };

  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkoutReady || submitting.current || pendingCheckout) return;
    if (cart.length === 0) {
      onToast("Cannot checkout an empty cart");
      return;
    }
    if (paymentMethod === "Cash" && tenderedNum < total) {
      onToast("Cash tendered is less than total amount due");
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    setCheckoutError("");
    const currentProducts = await refreshStock();
    if (!currentProducts) { setCheckoutError("Stock could not be verified. Your cart and payment details are retained. Refresh stock before paying."); submitting.current = false; setIsSubmitting(false); return; }
    const allocations = cart.map((item) => {
      const product = currentProducts.find((p) => p.id === item.id);
      if (!product) return { item, product: null, batches: null };
      return { item, product, batches: getBatchAllocations(product, item.qty) };
    });

    const unavailable = allocations.find((entry) => !entry.product || !entry.batches);
    if (unavailable) {
      setCheckoutError(`${unavailable.item.name}: Only ${unavailable.product ? getProductStock(unavailable.product) : 0} units are currently available, or its batches are unavailable. Edit or remove this item, then refresh stock. Your cart and payment details are retained.`);
      submitting.current = false; setIsSubmitting(false);
      return;
    }

    const now = new Date();
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

    const transactionPayload = {
      dateTime,
      user: cashierName,
      businessType: "Retail" as const,
      customer: "Walk-in Customer",
      total: formatPeso(total),
      subtotal: formatPeso(subtotal),
      discount: formatPeso(discountAmount),
      vat: formatPeso(vat),
      vatRelief: formatPeso(vatRelief),
      amountReceived:
        paymentMethod === "Cash" ? formatPeso(tenderedNum) : formatPeso(total),
      change: formatPeso(changeDue),
      payment: paymentMethod,
      discountType,
      status: "Completed" as const,
      items: cart.map((item) => ({
        productId: item.id,
        sku: item.sku,
        isVatExempt: item.isVatExempt,
        product: item.name,
        quantity: item.qty,
        unitPrice: formatPeso(item.price),
        subtotal: formatPeso(item.price * item.qty),
      })),
    };

    submitting.current = true;
    setIsSubmitting(true);
    try {
      let saved;
      try {
        saved = await submitCheckout.current!(transactionPayload);
      } catch (error) {
        setPendingCheckout(submitCheckout.current!.getPending() || null);
        setCheckedMissing(false);
        setCheckoutError(safeError(error, "Checkout could not be confirmed. Check its result before another sale."));
        return;
      }
      await finishCheckout(saved);

    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const filteredReceipts = recordsOnDate(receipts, shiftDate).filter(
    (r) =>
      r.id.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      r.method.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      (r.itemsSummary && r.itemsSummary.toLowerCase().includes(searchReceipt.toLowerCase())),
  );

  return (
    <div className="cashier-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
            <DateControl label="Shift Date" date={shiftDate} onDateChange={selectDate} />
          </div>
        }
      />

      {pendingCheckout && <div className="inline-error" role="alert">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>{checkoutError || "Checkout is awaiting confirmation. Your cart and payment details are retained and locked. Check the result before another sale."}</span>
        <button id="pos-check-result" type="button" className="button soft" disabled={isSubmitting} onClick={() => void resolveCheckout()}>{isSubmitting ? "Checking…" : "Check payment result"}</button>
        {checkedMissing && <button type="button" className="button soft" disabled={isSubmitting} onClick={() => void resolveCheckout(true)}>Retry same checkout</button>}
      </div>}
      <fieldset disabled={isSubmitting || !!pendingCheckout} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }} aria-busy={isSubmitting}>
      {/* Full-Screen Counter Sale Checkout Layout */}
      <section className="surface-card" style={{ padding: "22px 24px", width: "100%", borderRadius: 20 }}>
        <div className="card-header pos-card-header" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
              <span className="pill neutral" style={{ fontSize: 12 }}>
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
          className="pos-product-bar">
          <div>
            <label htmlFor="pos-product-search">
              Search Product
            </label>
            <div className="search-wrap" style={{ height: 39 }}>
              <Search size={15} />
              <input
                id="pos-product-search"
                data-testid="input-pos-product-search"
                type="search"
                placeholder="Search product, SKU, category..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <div className="pos-product-label">
              <label htmlFor="pos-product-select">Select Product / Medicine *</label>
              <AppTooltip content={"Refresh stock"}><button type="button" className="icon-button pos-stock-refresh" aria-label="Refresh stock"
                disabled={stockChecking || isSubmitting} onClick={() => void refreshStock(true)}>
                <RefreshCw size={14} className={stockChecking ? "spin" : undefined} />
              </button></AppTooltip>
            </div>
            <select
              id="pos-product-select"
              className="select"
              aria-describedby={productLoadError ? "pos-stock-error" : undefined}
              aria-busy={stockChecking}
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setQty(1);
              }}
              disabled={stockChecking || !!productLoadError || filteredProducts.length === 0}
              style={{ width: "100%", height: 39 }}>
              <option value="" disabled>
                {stockChecking ? "Loading stock…" : productLoadError ? "Stock unavailable" : filteredProducts.length === 0 ? "No products match your search" : "Select product / medicine"}
              </option>
              {filteredProducts.map((product) => {
                const availability = productAvailability(product, cart.find((item) => item.id === product.id)?.qty || 0);
                return <option key={product.id} value={product.id} disabled={!!availability}>
                  {product.name} ({product.sku}) - {product.price}{availability ? ` — ${availability}` : ""}
                </option>;
              })}
            </select>
          </div>
          <div className="">
            <label htmlFor="pos-product-quantity">
              Quantity
            </label>
            <input
              id="pos-product-quantity"
              type="number"
              min="1"
              max={Math.max(1, selectedAvailableStock)}
              step="1"
              value={qty}
              disabled={stockBlocked}
              onChange={(e) => {
                const nextQuantity = Number(e.target.value);
                if (!Number.isInteger(nextQuantity)) return;
                setQty(Math.max(1, Math.min(nextQuantity, selectedAvailableStock)));
              }}
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
              className="button primary-action"
              aria-describedby={productLoadError ? "pos-stock-error" : undefined}
              disabled={stockBlocked || isSubmitting || filteredProducts.length === 0}
              style={{ height: 39, padding: "0 18px", display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={handleAddToCart}>
              <Plus size={15} /> Add to Cart
            </button>
          </div>
        </div>

        {productLoadError && <div id="pos-stock-error" className="pos-stock-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" /><span>Stock unavailable.</span>
          <button type="button" className="pos-stock-retry" disabled={stockChecking || isSubmitting} onClick={() => void refreshStock()}>Retry stock</button>
        </div>}

        {checkoutError && !pendingCheckout && <div className="inline-error" role="alert"><AlertTriangle size={16} /><span>{checkoutError}</span></div>}
        {/* 2-Column POS Layout inside full-width card */}
        <div className="pos-checkout-grid">
          {/* Left: Cart Items Table */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Transaction Items ({cart.length})
              </h4>
            </div>

            <div
              className="table-scroll"
              role="region"
              aria-label="Cart items. Scroll horizontally for quantity, price, and remove actions."
              tabIndex={0}
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
                          <div className="muted" style={{ fontSize: 12 }}>
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
                              aria-label={`Decrease ${item.name} quantity`}
                              onClick={() => handleUpdateCartQty(item.id, item.qty - 1)}>
                              -
                            </button>
                            <input
                              className="cart-quantity-input"
                              type="number"
                              min="1"
                              max={Math.max(1, getCartAvailableStock(item))}
                              step="1"
                              value={item.qty}
                              aria-label={`${item.name} quantity`}
                              onChange={(event) =>
                                handleUpdateCartQty(item.id, event.target.value)
                              }
                            />
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
                              aria-label={`Increase ${item.name} quantity`}
                              onClick={() => handleUpdateCartQty(item.id, item.qty + 1)}>
                              +
                            </button>
                          </div>
                          <div className="quantity-limit">
                            Max {getCartAvailableStock(item)}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          ₱{item.price.toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          ₱{(item.price * item.qty).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <AppTooltip content={"Remove item"}><button
                            type="button"
                            className="icon-button"
                            style={{
                              width: 24,
                              height: 24,
                              border: 0,
                              color: "hsl(var(--danger))",
                            }}

                            onClick={() => handleRemoveFromCart(item.id)}>
                            <Trash2 size={13} />
                          </button></AppTooltip>
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
              <h4 style={{ margin: "0 0 12px", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
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
                  <span>{pendingCheckout && pendingCheckout.payload.contractVersion !== 3 ? "VAT" : "VAT (included)"}</span>
                  <span>₱{vat.toFixed(2)}</span>
                </div>
                {vatRelief > 0 && <div style={{display:"flex",justifyContent:"space-between",color:"hsl(var(--muted))"}}><span>VAT exemption</span><span>-{formatPeso(vatRelief)}</span></div>}
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
                  fontSize: 12,
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
                    className={`button ${discountType === type ? "primary-action" : "soft"}`}
                    style={{
                      height: 35,
                      fontSize: 12,

                      padding: 12, }}
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
                  fontSize: 12,
                  fontWeight: 600,
                  color: "hsl(var(--muted))",
                  display: "block",
                  marginBottom: 6,
                }}>
                Payment Method
              </label>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {(["Cash", "GCash", "Card"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`button ${paymentMethod === method ? "primary-action" : "soft"}`}
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
                      fontSize: 12,
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
                      fontSize: 12,
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
              className="button primary-action full"
              disabled={!checkoutReady || isSubmitting || cart.length === 0}
              style={{
                height: 46,
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}>
              <Receipt size={16} /> {isSubmitting ? "Saving sale" : "Complete & Print Receipt"} (₱
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
              Receipts recorded on {formatCalendarDate(shiftDate)}.
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
                      style={{ fontSize: 12 }}>
                      {r.method}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <strong>{r.totalFormatted || formatPeso(r.total)}</strong>
                  </td>
                  <td>
                    <span className="pill success" style={{ fontSize: 12 }}>
                      {r.status || "Completed"}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="button soft"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => setSelectedReceipt(r)}>
                      <Eye size={12} style={{ marginRight: 4 }} /> View
                    </button>
                  </td>
                </tr>
              ))}
              {filteredReceipts.length === 0 && (
                <tr>
                  <TableEmptyState colSpan={7} icon={Receipt}>
                    No receipts match {formatCalendarDate(shiftDate)} and the current search.
                  </TableEmptyState>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      </fieldset>
      {/* Modal: Receipt Details & Print */}
      {selectedReceipt && (
        <div
          className="modal-backdrop"
          onClick={closeReceipt}
          style={{ zIndex: 1100 }}>
          <div
            className="modal dialog pos-receipt-dialog"
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
                aria-label="Close receipt"
                onClick={closeReceipt}>
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
                    fontSize: 12,
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
                  <span>{selectedReceipt.printSource?.calculationVersion ? "VAT (included)" : "VAT"}</span>
                  <span>{selectedReceipt.vat}</span>
                </div>
              )}
              {selectedReceipt.vatRelief && <div style={{ display: "flex", justifyContent: "space-between", color: "hsl(var(--muted))" }}><span>VAT exemption</span><span>{selectedReceipt.vatRelief}</span></div>}
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
                className="button primary-action"
                onClick={async () => {
                  try {
                    await printReceipt(selectedReceipt);
                  } catch {
                    onToast("Could not prepare the receipt. Please try printing again.");
                  }
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
                className="button primary-action"
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

