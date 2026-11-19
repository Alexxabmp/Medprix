import { AsyncActionButton } from "@/components/custom-ui/async-action-button";
import { PharmacyFeedback, PharmacyRefreshButton, TransactionTableBody, TransactionText } from "@/components/custom-ui/pharmacy-source-state";
import { SourceProgress, SourceFeedback } from "@/components/custom-ui/source-state";
import { SelectField } from "@/components/custom-ui/select-field";
import { QuantityInput } from "@/components/custom-ui/quantity-input";
import { FindCustomerDialog, CustomerDiscountBadge, initialsOf } from "@/components/custom-ui/find-customer-dialog";
import { NewCustomerDialog, type UsualLine } from "@/components/custom-ui/new-customer-dialog";
import { CustomerProfilePanel } from "@/components/custom-ui/customer-profile-panel";
import { fetchCustomers, saveUsualItems, type Customer } from "@/lib/customer-api";
import { withUsualOrder, usualOrderMessage } from "@/lib/usual-order";
import { retailSummaryLines, receiptSummaryLines, formatSummaryAmount } from "@/lib/retail-summary";
import { paymentMethodLabel, paymentReferenceLine, discountHolderLines } from "@/lib/payment-display";
import { displayPeso } from "@/lib/currency";
import { PageTableValue, PageTableAction, usePageTableStandard } from "@/components/page-table-context";
import { AppTooltip } from "@/components/ui/tooltip";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { calculateRetailLine, cleanPaymentReference, paymentReferenceError, PAYMENT_METHOD_LABELS, PAYMENT_REFERENCE_LABELS, cleanDiscountHolderName, cleanDiscountHolderId, discountHolderNameError, discountHolderIdError, DISCOUNT_ID_LABELS, customerDiscountToPos, posDiscountToCustomer, maskEnding, type CustomerDiscount } from "@workspace/api-zod";
import { productStock as getProductStock, batchAllocations as getBatchAllocations, productAvailability, nextSaleBatches, formatExpiryMonth } from "@/lib/stock-guidance";
import { safeError, readResponse } from "@/lib/feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Download,
  Eye,
  Minus,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  User,
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
  const standard = usePageTableStandard();
  const [receiptPage, setReceiptPage] = useState(1);
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
  useEffect(() => {
    void refreshStock();
    return () => {
      clearTimeout(stockDayTimer.current);
    };
  }, []);
  const [productSearch, setProductSearch] = useState("");
  const [qty, setQty] = useState(1);
  const quantityInput = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  // Returning customers (Phase 2a): the selected profile, its usual order and the dialogs around it.
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [findCustomerOpen, setFindCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{ name: string; discountType: CustomerDiscount; idNumber: string } | null>(null);
  const [usualLoadChoice, setUsualLoadChoice] = useState<Customer | null>(null);
  const [usualNotice, setUsualNotice] = useState<{ text: string; previousCart: CartItem[] } | null>(null);
  const [confirmSaveUsual, setConfirmSaveUsual] = useState(false);
  const [savingUsual, setSavingUsual] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  async function loadCustomers() {
    setCustomersLoading(true);
    try { setCustomers(await fetchCustomers()); setCustomersError(""); }
    catch (failure) { setCustomersError(safeError(failure)); }
    finally { setCustomersLoading(false); }
  }
  useEffect(() => { void loadCustomers(); }, []);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "GCash" | "Card">(
    "Cash",
  );
  const [discountType, setDiscountType] = useState<"None" | "Senior" | "PWD">(
    "None",
  );
  const [cashTendered, setCashTendered] = useState<string>("200");
  // Proof of payment for GCash / QR and Card sales (see lib/api-zod/src/payment-reference.ts).
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReferenceTouched, setPaymentReferenceTouched] = useState(false);
  const paymentReferenceInput = useRef<HTMLInputElement>(null);
  // Senior/PWD details for the BIR record of discounted sales (see lib/api-zod/src/discount-holder.ts).
  const [discountHolderName, setDiscountHolderName] = useState("");
  const [discountHolderId, setDiscountHolderId] = useState("");
  const [discountHolderTouched, setDiscountHolderTouched] = useState({ name: false, id: false });
  const discountHolderNameInput = useRef<HTMLInputElement>(null);
  const discountHolderIdInput = useRef<HTMLInputElement>(null);
  const [searchReceipt, setSearchReceipt] = useState("");
  useEffect(() => setReceiptPage(1), [searchReceipt, shiftDate.toDateString()]);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ShiftReceipt | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const submitCheckout = useRef<ReturnType<typeof createCheckoutSubmitter> | null>(null);
  if (!submitCheckout.current) submitCheckout.current = createCheckoutSubmitter();
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [checkoutInitializing, setCheckoutInitializing] = useState(true);
  const [checkoutInitError, setCheckoutInitError] = useState("");
  const [checkoutInitAttempt, setCheckoutInitAttempt] = useState(0);
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
    setCheckoutInitializing(true);
    setCheckoutInitError("");
    submitCheckout.current!.initialize().then(pending=>{
      if(!active)return;setCheckoutInitializing(false);setCheckoutReady(true);setPendingCheckout(pending??null);
      if(!pending)return;
      setCart(pending.payload.items.map(item=>({id:item.productId,name:item.product,sku:String(item.sku||''),qty:item.quantity,price:Number(item.unitPrice.replace(/[^0-9.]/g,'')),isVatExempt:item.isVatExempt===true})));
      setCashTendered(pending.payload.amountReceived.replace(/[^0-9.]/g,''));setPaymentMethod(pending.payload.payment);setPaymentReference(String(pending.payload.paymentReference ?? ""));setDiscountType(pending.payload.discountType);setDiscountHolderName(String(pending.payload.discountHolderName ?? ""));setDiscountHolderId(String(pending.payload.discountHolderId ?? ""));setSelectedCustomerId(pending.payload.customerId ? String(pending.payload.customerId) : null);
    }).catch(failure=>{if(active){setCheckoutInitializing(false);setCheckoutInitError(safeError(failure));}});
    return()=>{active=false;};
  }, [checkoutInitAttempt]);

  async function finishCheckout(saved: any) {
    recordTransaction(saved);
    setSelectedReceipt(mapTransactionsToReceipts([saved])[0]);
    setCart([]);
    setCashTendered("");
    setPaymentReference("");
    setPaymentReferenceTouched(false);
    setDiscountHolderName("");
    setDiscountHolderId("");
    setDiscountHolderTouched({ name: false, id: false });
    setSelectedCustomerId(null);
    setUsualNotice(null);
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
  // Low stock uses the product's reorder level, the same threshold Inventory uses for alerts.
  const isLowStock = (product: ProductItem) => product.reorder > 0 && getProductStock(product) <= product.reorder;
  const selectedLowStock = selectedProduct ? isLowStock(selectedProduct) : false;
  const saleBatches = selectedProduct && !stockStatus ? nextSaleBatches(selectedProduct, selectedCartQuantity, qty) : null;
  const productStockLabel = (product: ProductItem) => {
    const remaining = Math.max(0, getProductStock(product) - (cart.find((item) => item.id === product.id)?.qty || 0));
    return isLowStock(product) ? `Low stock: ${remaining} available` : `${remaining} in stock`;
  };
  const invalidQuantityMessage = { message: "Enter a valid quantity of at least 1.", variant: "warning" as const };
  const stockLimitMessage = (name: string, available: number, inCart: number) =>
    `Only ${available} unit(s) of ${name} available${inCart ? ` (${inCart} already in cart)` : ""}.`;
  // After adding, reopen product search so the next item can be scanned or typed straight away.
  const focusProductSearch = () => {
    setProductSearch("");
    requestAnimationFrame(() => document.getElementById("pos-product-select")?.click());
  };
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
  const cleanedDiscountHolderName = cleanDiscountHolderName(discountHolderName);
  const cleanedDiscountHolderId = cleanDiscountHolderId(discountHolderId);
  const discountHolderNameProblem = discountType === "None" ? null : discountHolderNameError(cleanedDiscountHolderName);
  const discountHolderIdProblem = discountType === "None" ? null : discountHolderIdError(discountType, cleanedDiscountHolderId);
  const cleanedPaymentReference = cleanPaymentReference(paymentMethod, paymentReference);
  const paymentReferenceProblem = paymentMethod === "Cash" ? null : paymentReferenceError(paymentMethod, cleanedPaymentReference);
  // Explain a problem once the cashier leaves the field, or immediately when the input can no longer become valid.
  const paymentReferenceObviouslyWrong = paymentMethod === "GCash"
    ? /\D/.test(cleanedPaymentReference) || cleanedPaymentReference.length > 13
    : paymentMethod === "Card" && (/[^A-Z0-9]/.test(cleanedPaymentReference) || cleanedPaymentReference.length > 6);
  const showPaymentReferenceError = !!paymentReferenceProblem && (paymentReferenceTouched || paymentReferenceObviouslyWrong);

  const lineAmounts = cart.map(item=>calculateRetailLine(BigInt(Math.round(item.price*100)),item.qty,item.isVatExempt,discountType!=="None"));
  const discountAmount = pendingAmount(pendingCheckout?.payload.discount, Number(lineAmounts.reduce((sum,line)=>sum+line.discount,0n))/100);
  const vat = pendingAmount(pendingCheckout?.payload.vat, Number(lineAmounts.reduce((sum,line)=>sum+line.vat,0n))/100);
  const vatRelief = pendingAmount(pendingCheckout?.payload.vatRelief, Number(lineAmounts.reduce((sum,line)=>sum+line.relief,0n))/100);
  const total = pendingAmount(pendingCheckout?.payload.total, Number(lineAmounts.reduce((sum,line)=>sum+line.net,0n))/100);
  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue =
    paymentMethod === "Cash" ? Math.max(0, tenderedNum - total) : 0;

  // ── Returning customers (Phase 2a) ─────────────────────────────────────────
  /** Selects a customer, fills in their Senior/PWD details and, if asked, loads their usual order. */
  function selectCustomer(customer: Customer, load: "add" | "replace" | "none") {
    setSelectedCustomerId(customer.id);
    setUsualLoadChoice(null);
    const pos = customerDiscountToPos(customer.discountType);
    if (pos !== "None") {
      setDiscountType(pos);
      setDiscountHolderName(customer.name);
      setDiscountHolderId(customer.idNumber ?? "");
      setDiscountHolderTouched({ name: false, id: false });
    }
    if (load === "none") { setUsualNotice(null); return; }
    const previousCart = cart;
    const result = withUsualOrder(customer.usualItems, load === "replace" ? [] : cart, products);
    setCart(result.cart);
    setUsualNotice({ text: usualOrderMessage(customer.usualItems.length, result.added, result.notes), previousCart });
  }
  function pickCustomer(customer: Customer) {
    setFindCustomerOpen(false);
    if (!customer.usualItems.length) {
      selectCustomer(customer, "none");
      onToast(`${customer.name} selected. No usual order is saved yet.`);
    } else if (cart.length === 0) selectCustomer(customer, "add");
    else setUsualLoadChoice(customer); // the cart already has items: ask before changing it
  }
  function removeCustomer() {
    const customer = selectedCustomer;
    setSelectedCustomerId(null);
    setUsualNotice(null);
    // Clear the Senior/PWD details only if they still came from this profile.
    if (customer && discountType !== "None" && cleanDiscountHolderName(discountHolderName) === customer.name) {
      setDiscountType("None");
      setDiscountHolderName("");
      setDiscountHolderId("");
    }
  }
  function openNewCustomer(search = "") {
    setFindCustomerOpen(false);
    const discounted = discountType !== "None";
    setNewCustomer({
      name: /\p{L}/u.test(search) ? search : discounted ? discountHolderName : "",
      discountType: posDiscountToCustomer(discountType),
      idNumber: discounted ? discountHolderId : "",
    });
  }
  // Phase 2c: prescription-required items in the cart (tag on each row, reminder above the pay button).
  const prescriptionIds = new Set(products.filter((product) => product.requiresPrescription).map((product) => product.id));
  const rxInCart = cart.filter((item) => prescriptionIds.has(item.id));
  const cartUsualLines: UsualLine[] = cart.map((item) => ({
    productId: item.id, name: item.name, quantity: item.qty,
    controlled: !!products.find((product) => product.id === item.id)?.isDangerousDrug,
  }));
  function customerSaved(customer: Customer) {
    setCustomers((list) => [...list.filter((item) => item.id !== customer.id), customer].sort((a, b) => a.name.localeCompare(b.name)));
    setNewCustomer(null);
    selectCustomer(customer, "none");
    onToast(`Saved ${customer.name} as a returning customer.`);
  }
  /** Phase 2b: keep the list (and the Senior/PWD details taken from the profile) in step with edits. */
  function customerUpdated(updated: Customer) {
    const before = customers.find((item) => item.id === updated.id);
    setCustomers((list) => list.map((item) => (item.id === updated.id ? updated : item)).sort((a, b) => a.name.localeCompare(b.name)));
    const fromProfile = before && discountType !== "None" && cleanDiscountHolderName(discountHolderName) === before.name;
    if (updated.id === selectedCustomerId && fromProfile) {
      const pos = customerDiscountToPos(updated.discountType);
      if (pos === "None") { setDiscountType("None"); setDiscountHolderName(""); setDiscountHolderId(""); }
      else { setDiscountType(pos); setDiscountHolderName(updated.name); setDiscountHolderId(updated.idNumber ?? ""); }
    }
  }
  function customerDeleted(deleted: Customer) {
    setProfileOpen(false);
    if (deleted.id === selectedCustomerId) removeCustomer();
    setCustomers((list) => list.filter((item) => item.id !== deleted.id));
  }
  async function saveCartAsUsual() {
    if (!selectedCustomer) return;
    const lines = cartUsualLines.filter((line) => !line.controlled);
    setSavingUsual(true);
    try {
      const updated = await saveUsualItems(selectedCustomer.id, lines.map((line) => ({ productId: line.productId, quantity: line.quantity })));
      setCustomers((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      setConfirmSaveUsual(false);
      onToast(`Saved ${lines.length} ${lines.length === 1 ? "item" : "items"} as ${updated.name}'s usual order.`);
    } catch (failure) {
      onToast({ message: safeError(failure), variant: "warning" });
    } finally { setSavingUsual(false); }
  }

  const handleAddToCart = () => {
    if (stockBlocked) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) {
      onToast("Select a live inventory product first");
      return;
    }
    if (typeof prod.isVatExempt !== "boolean") { onToast("Check this product's category VAT setting in Inventory before adding it."); return; }
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
    focusProductSearch();
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
    if (discountHolderNameProblem || discountHolderIdProblem) {
      setDiscountHolderTouched({ name: true, id: true });
      onToast({ message: (discountHolderNameProblem ?? discountHolderIdProblem)!, variant: "warning" });
      (discountHolderNameProblem ? discountHolderNameInput : discountHolderIdInput).current?.focus();
      return;
    }
    if (paymentReferenceProblem) {
      setPaymentReferenceTouched(true);
      onToast({ message: paymentReferenceProblem, variant: "warning" });
      paymentReferenceInput.current?.focus();
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
      paymentReference: paymentMethod === "Cash" ? null : cleanedPaymentReference,
      discountType,
      discountHolderName: discountType === "None" ? null : cleanedDiscountHolderName,
      discountHolderId: discountType === "None" ? null : cleanedDiscountHolderId,
      customerId: selectedCustomerId,
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
      (r.paymentReference ?? "").toLowerCase().includes(searchReceipt.replace(/[\s-]/g, "").toLowerCase()) ||
      (r.itemsSummary && r.itemsSummary.toLowerCase().includes(searchReceipt.toLowerCase())),
  );

  const receiptPages = Math.max(1, Math.ceil(filteredReceipts.length / 15));
  const safeReceiptPage = Math.min(receiptPage, receiptPages);
  const visibleReceipts = standard ? filteredReceipts.slice((safeReceiptPage - 1) * 15, safeReceiptPage * 15) : filteredReceipts;

  return (
    <div className="cashier-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeading
        className="date-page-heading"
        title="Cashier Terminal & Register"
        description="Shift 1 (08:00 AM – 04:00 PM) · Active Terminal #01"
        action={
          <div className="date-page-actions">
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
                onClick={() => { setCart([]); setUsualNotice(null); }}>
                <Trash2 size={13} style={{ marginRight: 4 }} /> Clear Cart
              </button>
            )}
          </div>
        </div>

        {/* Returning customer (Phase 2a): walk-in by default */}
        {selectedCustomer ? (
          <div className="pos-customer-bar is-selected">
            <span className="customer-avatar" aria-hidden="true">{initialsOf(selectedCustomer.name)}</span>
            <div className="pos-customer-text">
              <span className="pos-customer-name">{selectedCustomer.name} <CustomerDiscountBadge discountType={selectedCustomer.discountType} /></span>
              <span className="pos-customer-detail">
                {[selectedCustomer.idNumber && `${customerDiscountToPos(selectedCustomer.discountType) === "PWD" ? "PWD" : "OSCA"} ID ${maskEnding(selectedCustomer.idNumber)}`,
                  selectedCustomer.usualItems.length ? `Usual order: ${selectedCustomer.usualItems.length} ${selectedCustomer.usualItems.length === 1 ? "item" : "items"}` : "No usual order yet"].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="pos-customer-actions">
              <button type="button" className="button soft" disabled={isSubmitting} onClick={() => setProfileOpen(true)}>View profile</button>
              {selectedCustomer.usualItems.length > 0 && (
                <button type="button" className="button soft" disabled={isSubmitting} onClick={() => (cart.length ? setUsualLoadChoice(selectedCustomer) : selectCustomer(selectedCustomer, "add"))}>Add usual order</button>
              )}
              <button type="button" className="icon-button" aria-label={`Remove ${selectedCustomer.name} from this sale`} disabled={isSubmitting} onClick={removeCustomer}><X size={16} /></button>
            </div>
          </div>
        ) : (
          <div className="pos-customer-bar">
            <span className="customer-avatar is-empty" aria-hidden="true"><User size={18} /></span>
            <div className="pos-customer-text">
              <span className="pos-customer-name">{pendingCheckout?.payload.customerId ? "Saved customer" : "Walk-in customer"}</span>
              <span className="pos-customer-detail">Returning customer? Find them to load their usual order and discount.</span>
            </div>
            <div className="pos-customer-actions">
              <button type="button" className="button primary-action" disabled={isSubmitting} onClick={() => { setFindCustomerOpen(true); void loadCustomers(); }}><Search size={15} /> Find customer</button>
            </div>
          </div>
        )}
        {usualNotice && (
          <div className="pos-usual-notice" role="status">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{usualNotice.text}</span>
            <button type="button" onClick={() => { setCart(usualNotice.previousCart); setUsualNotice(null); }}>Undo</button>
            <button type="button" aria-label="Dismiss" onClick={() => setUsualNotice(null)}><X size={14} /></button>
          </div>
        )}

        {/* Product Selection Form Bar */}
        <div
          className="pos-product-bar">
          <div>
            <div className="pos-product-label">
              <label htmlFor="pos-product-select">Select Product / Medicine *</label>
            </div>
            <SelectField searchable pickerLabel="Product / medicine" searchValue={productSearch} onSearchChange={setProductSearch} shouldFilter={false}
              searchPlaceholder="Search name, generic, SKU or category"
              id="pos-product-select"
              className="select"
              aria-describedby={productLoadError ? "pos-stock-error" : undefined}
              aria-busy={stockChecking}
              value={selectedProductId}
              onChange={(e) => {
                const productId = e.target.value;
                // Render the new product first so the quantity box is enabled, then move the cursor there.
                flushSync(() => {
                  setSelectedProductId(productId);
                  setQty(1);
                });
                quantityInput.current?.focus();
              }}
              disabled={stockChecking || !!productLoadError || products.length === 0}
              style={{ width: "100%", height: 39 }}>
              <option value="" disabled>
                {stockChecking ? "Loading stock…" : productLoadError ? "Stock unavailable" : filteredProducts.length === 0 ? "No products match your search" : "Select product / medicine"}
              </option>
              {filteredProducts.map((product) => {
                const availability = productAvailability(product, cart.find((item) => item.id === product.id)?.qty || 0);
                return <option key={product.id} value={product.id} disabled={!!availability}>
                  {product.name}{product.requiresPrescription ? " [Rx]" : ""} ({product.sku}) - {displayPeso(product.price)}{availability ? ` — ${availability}` : ` · ${productStockLabel(product)}`}
                </option>;
              })}
            </SelectField>
          </div>
          <div>
            <label htmlFor="pos-product-quantity">
              Quantity
            </label>
            <div className="pos-quantity-stepper">
              <button
                type="button"
                className="icon-button"
                aria-label="Decrease quantity"
                disabled={stockBlocked || qty <= 1}
                onClick={() => setQty((current) => Math.max(1, current - 1))}>
                <Minus size={14} />
              </button>
              <QuantityInput
                ref={quantityInput}
                id="pos-product-quantity"
                className="pos-quantity-input"
                max={Math.max(1, selectedAvailableStock)}
                value={qty}
                resetTo={1}
                disabled={stockBlocked}
                aria-describedby="pos-stock-info"
                onChange={setQty}
                onEnter={handleAddToCart}
                onInvalidEnter={() => onToast(invalidQuantityMessage)}
                onExceed={(available) => {
                  if (selectedProduct)
                    onToast({ message: stockLimitMessage(selectedProduct.name, available, selectedCartQuantity), variant: "warning" });
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Increase quantity"
                disabled={stockBlocked || qty >= selectedAvailableStock}
                onClick={() => setQty((current) => Math.min(selectedAvailableStock, current + 1))}>
                <Plus size={14} />
              </button>
            </div>
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
          <p
            id="pos-stock-info"
            className={`pos-stock-info${stockStatus ? " is-unavailable" : selectedLowStock ? " is-low" : ""}`}
            aria-live="polite">
            {!selectedProduct
              ? "Select a product to see available stock."
              : stockStatus
                ? stockStatus
                : <>
                    <strong>{selectedLowStock ? `Low stock: ${selectedAvailableStock} available` : `${selectedAvailableStock} available`}</strong>
                    {selectedCartQuantity > 0 && <span> · {selectedCartQuantity} in cart</span>}
                    {saleBatches && saleBatches.length === 1 && (
                      <span> · Selling from batch {saleBatches[0].batchNumber}, expires {formatExpiryMonth(saleBatches[0].expiryDate)}</span>
                    )}
                    {saleBatches && saleBatches.length > 1 && (
                      <span> · Selling from {saleBatches.length} batches: {saleBatches.map((batch) =>
                        `${batch.batchNumber} (${batch.quantity}, expires ${formatExpiryMonth(batch.expiryDate)})`).join(", ")}</span>
                    )}
                  </>}
          </p>
        </div>

        {productLoadError && <div id="pos-stock-error" className="pos-stock-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" /><span>Stock unavailable.</span>
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
              {selectedCustomer && cart.length > 0 && (
                <button type="button" className="button soft pos-save-usual" disabled={isSubmitting} onClick={() => setConfirmSaveUsual(true)}>Save cart as usual order</button>
              )}
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
              <table data-page-table="pos-cart" className="data-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th style={{ textAlign: "center" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Unit Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ width: 40 }}>{standard ? "Action" : null}</th>
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
                          <strong><PageTableValue value={item.name} /></strong>
                          {prescriptionIds.has(item.id) && <span className="rx-tag" title="Prescription required">Rx</span>}
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
                            <QuantityInput
                              className="cart-quantity-input"
                              commitOnBlur
                              onInvalidEnter={() => onToast(invalidQuantityMessage)}
                              onExceed={(available) =>
                                onToast({ message: stockLimitMessage(item.name, available, 0), variant: "warning" })
                              }
                              max={Math.max(1, getCartAvailableStock(item))}
                              value={item.qty}
                              aria-label={`${item.name} quantity`}
                              onChange={(quantity) =>
                                handleUpdateCartQty(item.id, quantity)
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
                {retailSummaryLines({
                  subtotal,
                  vat,
                  vatRelief,
                  discount: discountAmount,
                  discountType,
                  discounted: isDiscountEligible,
                  vatLabel: pendingCheckout && pendingCheckout.payload.contractVersion !== 3 ? "VAT" : "VAT (included)",
                }).map((line, index) => (
                  <div
                    key={line.label}
                    className={`pos-summary-line${line.kind === "deduction" ? " is-deduction" : ""}`}>
                    <span>{line.label}</span>
                    <span className={index === 0 ? "pos-summary-strong" : undefined}>{formatSummaryAmount(line)}</span>
                  </div>
                ))}
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

            {/* Senior/PWD ID details: required for the BIR record of discounted sales */}
            {discountType !== "None" && (
              <fieldset className="discount-holder-field">
                <legend>{discountType === "Senior" ? "Senior citizen" : "PWD"} ID details · required for the discount</legend>
                <div className="discount-holder-input">
                  <label htmlFor="discount-holder-name">Name on ID *</label>
                  <input
                    ref={discountHolderNameInput}
                    id="discount-holder-name"
                    type="text"
                    autoComplete="off"
                    maxLength={120}
                    value={discountHolderName}
                    aria-invalid={discountHolderTouched.name && !!discountHolderNameProblem}
                    aria-describedby="discount-holder-name-error"
                    onChange={(event) => setDiscountHolderName(event.target.value)}
                    onBlur={() => setDiscountHolderTouched((current) => ({ ...current, name: true }))}
                  />
                  {discountHolderTouched.name && discountHolderNameProblem && (
                    <span id="discount-holder-name-error" className="discount-holder-error">{discountHolderNameProblem}</span>
                  )}
                </div>
                <div className="discount-holder-input">
                  <label htmlFor="discount-holder-id">{DISCOUNT_ID_LABELS[discountType]} *</label>
                  <input
                    ref={discountHolderIdInput}
                    id="discount-holder-id"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={40}
                    value={discountHolderId}
                    aria-invalid={discountHolderTouched.id && !!discountHolderIdProblem}
                    aria-describedby="discount-holder-id-error"
                    onChange={(event) => setDiscountHolderId(event.target.value)}
                    onBlur={() => setDiscountHolderTouched((current) => ({ ...current, id: true }))}
                  />
                  {discountHolderTouched.id && discountHolderIdProblem && (
                    <span id="discount-holder-id-error" className="discount-holder-error">{discountHolderIdProblem}</span>
                  )}
                </div>
                <p className="discount-holder-hint">Printed on the receipt with a signature line, as BIR requires for discount records.</p>
                {!selectedCustomer && (
                  <button type="button" className="discount-holder-save" onClick={() => openNewCustomer()}>Save as a returning customer…</button>
                )}
              </fieldset>
            )}

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
                    aria-pressed={paymentMethod === method}
                    onClick={() => {
                      if (method !== paymentMethod) {
                        setPaymentReference("");
                        setPaymentReferenceTouched(false);
                      }
                      setPaymentMethod(method);
                    }}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </button>
                ))}
              </div>
            </div>

            {/* Proof of payment for GCash / QR and Card */}
            {paymentMethod !== "Cash" && (
              <div className="payment-reference-field">
                <label htmlFor="payment-reference">{PAYMENT_REFERENCE_LABELS[paymentMethod]} *</label>
                <input
                  ref={paymentReferenceInput}
                  id="payment-reference"
                  type="text"
                  inputMode={paymentMethod === "GCash" ? "numeric" : "text"}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={24}
                  placeholder={paymentMethod === "GCash" ? "e.g. 1001 543 610110" : "e.g. A1B2C3"}
                  value={paymentReference}
                  aria-invalid={showPaymentReferenceError}
                  aria-describedby="payment-reference-hint"
                  onChange={(event) => setPaymentReference(event.target.value)}
                  onBlur={() => { if (paymentReference) setPaymentReferenceTouched(true); }}
                />
                <p id="payment-reference-hint" className={`payment-reference-hint${showPaymentReferenceError ? " is-error" : ""}`} aria-live="polite">
                  {showPaymentReferenceError
                    ? paymentReferenceProblem
                    : !paymentReferenceProblem
                      ? <>Will be saved as <strong className="payment-reference-preview">{cleanedPaymentReference}</strong>. Check it against the {paymentMethod === "GCash" ? "payment confirmation" : "terminal slip"}.</>
                      : paymentMethod === "GCash"
                        ? "10 to 13 digits from the GCash / QR payment confirmation."
                        : "6 letters or digits printed on the card terminal slip. Keep the merchant copy of the slip."}
                </p>
              </div>
            )}

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
                      color: changeDue >= 0 ? "var(--success-text)" : "hsl(var(--danger))",
                      background: "hsl(var(--surface-soft))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                    }}>
                    ₱{changeDue.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {!checkoutReady && <>
              {checkoutInitializing && <SourceProgress label="Preparing checkout…" />}
              <SourceFeedback status={{ hasData: false, pending: checkoutInitializing, error: checkoutInitError }} label="checkout access" onRetry={() => setCheckoutInitAttempt(value => value + 1)} />
            </>}
            {/* Phase 2c: a reminder only; it never blocks the sale. */}
            {rxInCart.length > 0 && (
              <div className="pos-rx-reminder" role="note">
                <ClipboardList size={18} aria-hidden="true" style={{ flex: "none", marginTop: 1 }} />
                <span>
                  <strong>{rxInCart.length} {rxInCart.length === 1 ? "item needs" : "items need"} a prescription.</strong>{" "}
                  Check the customer's prescription for {rxInCart.map((item) => item.name).join(", ")} before payment.
                </span>
              </div>
            )}

            <button
              type="submit"
              className="button primary-action full"
              disabled={!checkoutReady || isSubmitting || cart.length === 0 || !!paymentReferenceProblem || !!discountHolderNameProblem || !!discountHolderIdProblem}
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

      <PharmacyFeedback source="transactions" label="shift receipts" showRetry={false} />
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
              <Receipt size={16} /> Recent Shift Receipts (<TransactionText>{filteredReceipts.length}</TransactionText>)
            </h3>
            <p className="card-subtitle" style={{ margin: "2px 0 0" }}>
              Receipts recorded on {formatCalendarDate(shiftDate)}.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: "100%" }}>
            <div className="search-wrap" style={{ width: 260, minWidth: 0, maxWidth: "100%" }}>
              <Search size={14} />
              <input
                type="search"
                placeholder="Search receipt #, method, item..."
                aria-label="Search shift receipts"
                value={searchReceipt}
                onChange={(e) => setSearchReceipt(e.target.value)}
                style={{ height: 34, fontSize: 12 }}
              />
            </div>
            <PharmacyRefreshButton source="transactions" label="shift receipts" />
          </div>
        </div>

        <div
          className="table-scroll"
          style={{
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            overflowX: "auto",
          }}>
          <table data-page-table="pos-receipts" className="data-table" style={{ width: "100%" }}>
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
            <TransactionTableBody colSpan={7}>
              {visibleReceipts.map((r) => (
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
                    <PageTableValue value={r.itemsSummary || `${r.items} item(s)`} />
                  </td>
                  <td>
                    <span
                      className={`pill ${r.method === "Cash" ? "success" : "neutral"}`}
                      style={{ fontSize: 12 }}>
                      {r.method}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <strong>{displayPeso(r.totalFormatted || r.total)}</strong>
                  </td>
                  <td>
                    <span className="pill success" style={{ fontSize: 12 }}>
                      {r.status || "Completed"}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <PageTableAction label="View receipt" icon={<Eye size={13} aria-hidden="true" />}
                      type="button"
                      className="button soft"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => setSelectedReceipt(r)}>
                      <Eye size={12} style={{ marginRight: 4 }} /> View
                    </PageTableAction>
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
            </TransactionTableBody>
          </table>
        </div>
        {standard && <nav className="table-pagination table-pagination--borderless" aria-label="Shift receipts pagination">
          <span className="muted"><TransactionText>Page {safeReceiptPage} of {receiptPages} ({filteredReceipts.length} receipts)</TransactionText></span>
          <button type="button" className="button soft" disabled={safeReceiptPage <= 1} onClick={() => setReceiptPage(p => Math.max(1, p - 1))}>Previous</button>
          <button type="button" className="button soft" disabled={safeReceiptPage >= receiptPages} onClick={() => setReceiptPage(p => Math.min(receiptPages, p + 1))}>Next</button>
        </nav>}
      </section>

      </fieldset>
      {/* Returning customers (Phase 2a) */}
      <FindCustomerDialog
        open={findCustomerOpen}
        customers={customers}
        loading={customersLoading && customers.length === 0}
        error={customers.length ? "" : customersError}
        onRetry={() => void loadCustomers()}
        onSelect={pickCustomer}
        onNew={openNewCustomer}
        onClose={() => setFindCustomerOpen(false)}
      />
      <NewCustomerDialog
        open={!!newCustomer}
        initial={newCustomer ?? { name: "", discountType: "Regular", idNumber: "" }}
        cartLines={cartUsualLines}
        onSaved={customerSaved}
        onClose={() => setNewCustomer(null)}
      />
      <CustomerProfilePanel
        customer={profileOpen ? selectedCustomer : null}
        products={products}
        onClose={() => setProfileOpen(false)}
        onUpdated={customerUpdated}
        onDeleted={customerDeleted}
        onToast={(message) => onToast(message)}
      />
      {usualLoadChoice && (
        <div className="modal-backdrop" onClick={() => selectCustomer(usualLoadChoice, "none")} style={{ zIndex: 1100 }}>
          <div className="modal dialog usual-choice-dialog" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 440, width: "92%" }}>
            <div className="modal-header">
              <div>
                <h2>Add {usualLoadChoice.name}'s usual order?</h2>
                <p className="modal-sub">The cart already has {cart.length} {cart.length === 1 ? "item" : "items"}. Their usual order has {usualLoadChoice.usualItems.length}.</p>
              </div>
            </div>
            <div className="usual-choice-actions">
              <button type="button" className="button primary-action" onClick={() => selectCustomer(usualLoadChoice, "add")}>Add to the cart</button>
              <button type="button" className="button soft" onClick={() => selectCustomer(usualLoadChoice, "replace")}>Replace the cart</button>
              <button type="button" className="button soft" onClick={() => selectCustomer(usualLoadChoice, "none")}>Keep the cart as it is</button>
            </div>
          </div>
        </div>
      )}
      {confirmSaveUsual && selectedCustomer && (
        <div className="modal-backdrop" onClick={() => { if (!savingUsual) setConfirmSaveUsual(false); }} style={{ zIndex: 1100 }}>
          <div className="modal dialog save-usual-dialog" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 460, width: "92%" }}>
            <div className="modal-header">
              <div>
                <h2>Save as {selectedCustomer.name}'s usual order?</h2>
                <p className="modal-sub">{selectedCustomer.usualItems.length ? `This replaces their current usual order (${selectedCustomer.usualItems.length} ${selectedCustomer.usualItems.length === 1 ? "item" : "items"}).` : "They don't have a usual order yet."}</p>
              </div>
              <button type="button" className="modal-close" aria-label="Close" disabled={savingUsual} onClick={() => setConfirmSaveUsual(false)}><X size={16} /></button>
            </div>
            <ul className="usual-lines is-readonly">
              {cartUsualLines.filter((line) => !line.controlled).map((line) => (
                <li key={line.productId}><span className="usual-line-name">{line.name}</span><strong>× {line.quantity}</strong></li>
              ))}
            </ul>
            {cartUsualLines.some((line) => line.controlled) && (
              <p className="customer-field-note">Left out (controlled, needs a new prescription each time): {cartUsualLines.filter((line) => line.controlled).map((line) => line.name).join(", ")}.</p>
            )}
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button type="button" className="button soft" disabled={savingUsual} onClick={() => setConfirmSaveUsual(false)}>Cancel</button>
              <button type="button" className="button primary-action" disabled={savingUsual || !cartUsualLines.some((line) => !line.controlled)} onClick={() => void saveCartAsUsual()}>{savingUsual ? "Saving…" : "Save usual order"}</button>
            </div>
          </div>
        </div>
      )}
      <ModalDialogKeys open={!!usualLoadChoice} selector=".usual-choice-dialog" onClose={() => usualLoadChoice && selectCustomer(usualLoadChoice, "none")} />
      <ModalDialogKeys open={confirmSaveUsual} selector=".save-usual-dialog" onClose={() => { if (!savingUsual) setConfirmSaveUsual(false); }} pending={savingUsual} />

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
                <strong>{paymentMethodLabel(selectedReceipt.method)}</strong>
              </div>
              {(() => {
                const reference = paymentReferenceLine(selectedReceipt.method, selectedReceipt.paymentReference);
                return reference && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="muted">{reference.label}</span>
                    <strong style={{ letterSpacing: ".04em", color: selectedReceipt.paymentReference ? undefined : "hsl(var(--muted))" }}>{reference.value}</strong>
                  </div>
                );
              })()}
              {(() => {
                const holder = discountHolderLines(selectedReceipt.discountType, selectedReceipt.discountHolderName, selectedReceipt.discountHolderId);
                return holder && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span className="muted">{holder.nameLabel}</span>
                      <strong style={{ textAlign: "right", color: selectedReceipt.discountHolderName ? undefined : "hsl(var(--muted))" }}>{holder.name}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span className="muted">{holder.idLabel}</span>
                      <strong style={{ letterSpacing: ".04em", color: selectedReceipt.discountHolderId ? undefined : "hsl(var(--muted))" }}>{holder.idNumber}</strong>
                    </div>
                  </>
                );
              })()}
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
              {receiptSummaryLines(selectedReceipt).map((line) => (
                <div
                  key={line.label}
                  style={{ display: "flex", justifyContent: "space-between", color: line.kind === "deduction" ? "var(--success-text)" : "hsl(var(--muted))", fontWeight: line.kind === "deduction" ? 600 : undefined }}>
                  <span>{line.label}</span>
                  <span>{formatSummaryAmount(line)}</span>
                </div>
              ))}
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
                <span>{displayPeso(selectedReceipt.totalFormatted || selectedReceipt.total)}</span>
              </div>
              {selectedReceipt.amountReceived && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Amount Tendered</span>
                  <span>{displayPeso(selectedReceipt.amountReceived)}</span>
                </div>
              )}
              {selectedReceipt.change && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--success-text)", fontWeight: 700 }}>
                  <span>Change Due</span>
                  <span>{displayPeso(selectedReceipt.change)}</span>
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <AsyncActionButton
                type="button"
                className="button primary-action"
                pendingLabel={"Preparing receipt\u2026"}
                onAction={() => printReceipt(selectedReceipt)}
                onError={() => onToast("Could not prepare the receipt. Please try printing again.")}>
                <Download size={13} style={{ marginRight: 4 }} /> Print Receipt
              </AsyncActionButton>
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

/** Applies the app's dialog keyboard behaviour (focus, Escape, Tab loop) to an inline confirmation dialog. */
function ModalDialogKeys({ open, selector, onClose, pending = false }: { open: boolean; selector: string; onClose: () => void; pending?: boolean }) {
  useDialogAccessibility(open, selector, onClose, pending);
  return null;
}
