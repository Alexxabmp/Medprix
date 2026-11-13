import { parseCalendarDate, formatCalendarDate } from "@/lib/business-date";
import { pharmacyDate } from "@workspace/api-zod";
import { createReceivingSubmitter, type PendingReceiving } from "@/lib/receiving-submission";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { SupplierPaymentDialog } from "@/components/supplier-payment-dialog";
import { ReceivingBatchPicker } from "@/components/custom-ui/receiving-batch-picker";
import { ReceivingChoicePicker } from "@/components/custom-ui/receiving-choice-picker";
import { safeError, readResponse } from "@/lib/feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, Package, Plus, Trash2, X, PackagePlus, Search, LoaderCircle } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import type { ToastFn } from "@/lib/types";
import { fetchInventoryData, usePharmacyInventory } from "@/lib/pharmacy-store";
import { fetchAccountsPayable } from "@/lib/supplier-store";
import { products as initialFallbackProducts } from "@/lib/data";

type Supplier = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  sku: string;
  price?: string;
  cost?: string;
};
type LineItemDetail = {
  id: string;
  productId: string;
  product: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: string;
  lineTotal: string;
};
type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId?: string;
  supplier: string;
  orderDate: string;
  status: string;
  totalOrderAmount: string;
  itemCount: number;
  items?: LineItemDetail[];
};
type DeliveryItem = {
  id: string;
  product: string;
  sku?: string;
  batchNumber: string;
  expirationDate: string;
  quantityDelivered: number;
};
type Delivery = {
  id: string;
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  deliveryStatus: string;
  items: DeliveryItem[];
};
type Invoice = {
  id: string;
  invoiceNumber: string;
  supplier: string;
  poNumber: string | null;
  dueDate: string;
  invoiceAmount: string;
  status: string;
};
type LineItem = { productId: string; quantityOrdered: string; unitCost: string };

function receivingDataProblem(orders: PurchaseOrder[]): string {
  const incomplete = orders.some(order => !["Fulfilled", "Cancelled"].includes(order.status) &&
    (!Array.isArray(order.items) || order.items.some(item =>
      !Number.isInteger(item.quantityReceived) || !Number.isInteger(item.quantityRemaining))));
  return incomplete
    ? "Receiving quantities are missing from the server response. Restart the API with the current code, then retry receiving."
    : "";
}

const poStatuses = ["Draft", "Pending", "Approved", "Submitted", "Fulfilled", "Cancelled"];

function matchesSearch(search: string, fields: unknown[]): boolean {
  const text = fields.map(value => String(value ?? "")).join(" ").toLocaleLowerCase();
  return search.trim().toLocaleLowerCase().split(/\s+/).every(term => text.includes(term));
}

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as T;
    }
  } catch {}
  return fallback;
}

function saveStored(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function formatDeliveryDate(value: string) {
  const date = parseCalendarDate(value);
  return date ? formatCalendarDate(date) : "Date unavailable";
}

function money(value: string | number) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function expiryStatus(date: string) {
  const expiry = new Date(date);
  if (Number.isNaN(expiry.getTime())) return { label: "Unknown", tone: "neutral" };
  const days = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Expired", tone: "danger" };
  if (days <= 60) return { label: "Expiring Soon", tone: "warning" };
  return { label: "Valid", tone: "success" };
}

export default function ProcurementPage({ onToast, currentRole }: { onToast: ToastFn; currentRole: string }) {
  const canManagePurchasing = currentRole === "Admin" || currentRole === "FrontDesk";
  const [activeSection, setActiveSection] = useState(currentRole === "Cashier" ? "Receiving Report Management" : "Purchase Order Monitoring");
  const [status, setStatus] = useState("All orders");
  const [orderSearch, setOrderSearch] = useState("");
  const [receivingSearch, setReceivingSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [orders, setOrders] = useState<PurchaseOrder[]>(() =>
    getStored("medprix_procurement_orders", [])
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    getStored("medprix_procurement_suppliers", [])
  );
  const { items: inventoryItems, refresh: refreshInventory } = usePharmacyInventory();
  const [products, setProducts] = useState<Product[]>(() => {
    const cached = getStored<any[]>("medprix_cached_inventory", []);
    if (cached.length > 0) {
      return cached.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        cost: p.cost || p.price,
      }));
    }
    return initialFallbackProducts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price,
      cost: (p as any).cost || p.price,
    }));
  });

  useEffect(() => {
    if (inventoryItems && inventoryItems.length > 0) {
      setProducts(
        inventoryItems.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          price: p.price,
          cost: p.cost || p.price,
        }))
      );
    }
  }, [inventoryItems]);
  const [deliveries, setDeliveries] = useState<Delivery[]>(() =>
    getStored("medprix_procurement_deliveries", [])
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    getStored("medprix_procurement_invoices", [])
  );
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [poError, setPoError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [error, setError] = useState("");
  const [receivingError, setReceivingError] = useState("");
  const [loadingSections, setLoadingSections] = useState({
    orders: false,
    deliveries: false,
    invoices: false,
  });
  const [isInvoiceRefreshing, setIsInvoiceRefreshing] = useState(false);
  const [invoiceRefreshError, setInvoiceRefreshError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const [isPreparingReceiving, setIsPreparingReceiving] = useState(false);
  const [showReceivingLoading, setShowReceivingLoading] = useState(false);
  useEffect(() => {
    if (!isDeliveryOpen || !isPreparingReceiving) {
      setShowReceivingLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setShowReceivingLoading(true), 250);
    return () => window.clearTimeout(timer);
  }, [isDeliveryOpen, isPreparingReceiving]);
  const [receivingLoadError, setReceivingLoadError] = useState("");
  const receivingPreparation = useRef<AbortController | null>(null);
  const [batchPopupContainer, setBatchPopupContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isDeliveryOpen) {
      receivingPreparation.current?.abort();
      receivingPreparation.current = null;
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      receivingPreparation.current?.abort();
      receivingPreparation.current = null;
    };
  }, [isDeliveryOpen]);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [selectedOrderForItems, setSelectedOrderForItems] = useState<PurchaseOrder | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<PurchaseOrder | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { productId: "", quantityOrdered: "1", unitCost: "0" },
  ]);
  const receivingSubmitter = useRef<ReturnType<typeof createReceivingSubmitter> | null>(null);
  const receivingBusy = useRef(false);
  const [pendingReceiving, setPendingReceiving] = useState<PendingReceiving | null>(null);
  const receivingBody = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pendingReceiving && isDeliveryOpen) receivingBody.current?.scrollTo({ top: 0 });
  }, [pendingReceiving?.key, isDeliveryOpen]);
  const [receivingAccess, setReceivingAccess] = useState<"loading" | "ready" | "failed">("loading");
  const [receivingAccessAttempt, setReceivingAccessAttempt] = useState(0);
  const receivingReady = receivingAccess === "ready";
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setReceivingAccess("loading");
    setReceivingError("");
    fetch("/api/me", {credentials: "include", cache: "no-store", signal: controller.signal}).then(async response => {
      const actor = await readResponse(response, "Could not verify receiving access. Retry receiving access before saving.");
      if (!response.ok || !actor?.id || !["Admin", "FrontDesk"].includes(actor.role)) throw new Error("Could not verify receiving access. Refresh before saving.");
      if (!active) return;
      receivingSubmitter.current = createReceivingSubmitter(actor.id);
      setPendingReceiving(receivingSubmitter.current.getPending());
      setReceivingAccess("ready");
    }).catch(failure => {
      if (active) {
        setReceivingAccess("failed");
        setReceivingError(safeError(failure, "Could not verify receiving access. Retry receiving access before saving."));
      }
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); receivingSubmitter.current = null; };
  }, [receivingAccessAttempt]);
  const recoverReceiving = async (retry: boolean) => {
    if (receivingBusy.current || !receivingSubmitter.current) return;
    receivingBusy.current = true; setIsSaving(true); setReceivingError("");
    try {
      const result = retry ? await receivingSubmitter.current.submit() : await receivingSubmitter.current.check();
      if (result) { setError(""); setIsDeliveryOpen(false); onToast("Receiving report confirmed."); await Promise.all([loadData(), fetchInventoryData(true)]); }
      else setReceivingError("No saved report was found yet. Retry the same report using its retained reference; do not create a replacement.");
    } catch (failure) {
      const message = safeError(failure);
      setReceivingError(message);
      if (!receivingSubmitter.current?.getPending()) setError(message);
    }
    finally { setPendingReceiving(receivingSubmitter.current?.getPending() ?? null); receivingBusy.current = false; setIsSaving(false); }
  };
  const [deliveryForm, setDeliveryForm] = useState({
    poId: "",
    deliveryDate: pharmacyDate(),
    deliveryStatus: "Received",
    productId: "",
    batchNumber: "",
    expirationDate: "2028-12-31",
    quantityDelivered: "1",
  });
  const deliveryBatches = inventoryItems.find(product => product.id === deliveryForm.productId)?.batches ?? [];
  const matchingDeliveryBatches = deliveryBatches.filter(batch =>
    batch.batchNumber.trim().toUpperCase() === deliveryForm.batchNumber.trim().toUpperCase());
  const existingDeliveryBatch = matchingDeliveryBatches.length === 1 ? matchingDeliveryBatches[0] : undefined;
  const receivingOrders = orders.filter(order => !["Fulfilled", "Cancelled"].includes(order.status) && order.items?.some(item => item.quantityRemaining > 0));
  const receivingOrder = receivingOrders.find(order => order.id === deliveryForm.poId);
  const receivingItems = receivingOrder?.items?.filter(item => item.quantityRemaining > 0) ?? [];
  const receivingItem = receivingItems.find(item => item.productId === deliveryForm.productId);
  const receivingProductChoices = (receivingOrder ? [receivingOrder] : receivingOrders).flatMap(order =>
    (order.items ?? []).filter(item => item.quantityRemaining > 0).map(item => ({ order, item })));
  const receivingFieldsDisabled = isSaving || isPreparingReceiving || Boolean(receivingLoadError) || Boolean(pendingReceiving);
  const receivingProblem = receivingDataProblem(orders);
  const [invoiceForm, setInvoiceForm] = useState({
    supplierId: "",
    poId: "",
    invoiceNumber: "",
    dueDate: "",
    invoiceAmount: "0",
    isPaid: false,
  });

  useDialogAccessibility(isCreateOpen, '[data-testid="modal-create-po"] .modal', () => setIsCreateOpen(false), isSaving);
  useDialogAccessibility(isDeliveryOpen, '[data-testid="modal-create-delivery"] .receiving-dialog-frame', () => setIsDeliveryOpen(false), isSaving);
  useDialogAccessibility(isInvoiceOpen, '[data-testid="modal-create-invoice"] .modal', () => setIsInvoiceOpen(false), isSaving);
  useDialogAccessibility(Boolean(orderToCancel), '[data-testid="modal-cancel-po"] .modal', () => setOrderToCancel(null), isSaving);
  useDialogAccessibility(Boolean(selectedOrderForItems), '[data-testid="modal-po-items"] .modal', () => setSelectedOrderForItems(null), isSaving);
  const loadData = async () => {
    setError("");
    setLoadingSections({ orders: true, deliveries: true, invoices: true });

    const loadSuppliers = async () => {
      const response = await fetch("/api/suppliers", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to refresh suppliers.");
      if (response.ok) {
        const d = await response.json();
        if (!Array.isArray(d.suppliers)) throw new Error("Invalid procurement response. Please refresh.");
        if (Array.isArray(d.suppliers)) {
          setSuppliers(d.suppliers);
          saveStored("medprix_procurement_suppliers", d.suppliers);
        }
      }
    };

    const loadProducts = async () => {
      const response = await fetch("/api/inventory", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to refresh inventory.");
      if (response.ok) {
        const d = await response.json();
        if (!Array.isArray(d.products)) throw new Error("Invalid procurement response. Please refresh.");
        if (Array.isArray(d.products)) {
          const prods = d.products.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: p.price,
            cost: p.cost || p.price,
          }));
          setProducts(prods);
        }
      }
    };

    const loadOrders = async () => {
      try {
        const response = await fetch("/api/purchase-orders", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to refresh purchase orders.");
        const d = await response.json();
        if (!Array.isArray(d.purchaseOrders)) throw new Error("Invalid procurement response. Please refresh.");
        if (Array.isArray(d.purchaseOrders)) {
          setOrders(d.purchaseOrders);
          saveStored("medprix_procurement_orders", d.purchaseOrders);
        }
      } finally {
        setLoadingSections((current) => ({ ...current, orders: false }));
      }
    };

    const loadDeliveries = async () => {
      try {
        const response = await fetch("/api/supplier-deliveries", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to refresh receiving reports.");
        const d = await response.json();
        if (!Array.isArray(d.deliveries)) throw new Error("Invalid procurement response. Please refresh.");
        if (Array.isArray(d.deliveries)) {
          setDeliveries(d.deliveries);
          saveStored("medprix_procurement_deliveries", d.deliveries);
        }
      } finally {
        setLoadingSections((current) => ({ ...current, deliveries: false }));
      }
    };

    const loadInvoices = async () => {
      setIsInvoiceRefreshing(true);
      try {
        const response = await fetch("/api/supplier-invoices", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to refresh supplier invoices.");
        const d = await response.json();
        if (!Array.isArray(d.invoices)) throw new Error("Invalid invoice response. Please refresh.");
        if (Array.isArray(d.invoices)) {
          setInvoices(d.invoices);
          saveStored("medprix_procurement_invoices", d.invoices);
        }
      } finally {
        setLoadingSections((current) => ({ ...current, invoices: false }));
        setIsInvoiceRefreshing(false);
      }
    };

    const results = await Promise.allSettled([
      loadSuppliers(),
      loadProducts(),
      loadOrders(),
      loadDeliveries(),
      loadInvoices(),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      setError("Some procurement data could not be refreshed. Cached data remains available.");
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredOrders = orders.filter(
    order => (status === "All orders" || order.status === status) && matchesSearch(orderSearch,
      [order.poNumber, order.supplier, order.status, ...(order.items ?? []).flatMap(item => [item.product, item.sku])]),
  );
  const filteredReceivingRows = deliveries.flatMap(delivery => delivery.items.map(item => ({delivery, item})))
    .filter(({delivery, item}) => matchesSearch(receivingSearch,
      [delivery.poNumber, delivery.supplier, delivery.deliveryStatus, item.product, item.sku, item.batchNumber, item.expirationDate]));
  const filteredInvoices = invoices.filter(invoice => matchesSearch(invoiceSearch,
    [invoice.invoiceNumber, invoice.supplier, invoice.poNumber, invoice.status, invoice.dueDate, invoice.invoiceAmount]));
  const totalOpenValue = orders
    .filter((order) => !["Fulfilled", "Cancelled"].includes(order.status))
    .reduce((total, order) => total + Number(order.totalOrderAmount || 0), 0);
  const runningTotal = lineItems.reduce(
    (total, item) => total + (Number(item.quantityOrdered) || 0) * (Number(item.unitCost) || 0),
    0,
  );

  const updateStatus = async (orderId: string, nextStatus: string) => {
    setStatusError("");
    setIsSaving(true);
    try {
      const response = await fetch(`/api/purchase-orders/${orderId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update purchase order status.");
      }
      await Promise.all([loadData(), fetchInventoryData(true)]);
      onToast(`Purchase order status updated to ${nextStatus}.`);
    } catch (requestError: any) {
      setStatusError(safeError(requestError, "Purchase order status was not saved. Please refresh."));
      await loadData();
    } finally { setIsSaving(false); }
  };

  const openReceiving = async (orderId = "") => {
    if (receivingBusy.current) return;
    receivingPreparation.current?.abort();
    const controller = new AbortController();
    receivingPreparation.current = controller;
    setError("");
    setReceivingLoadError("");
    setSelectedOrderForItems(null);
    setIsDeliveryOpen(true);
    if (pendingReceiving) { setIsPreparingReceiving(false); return; }
    const cachedItem = orders.find(order => order.id === orderId)?.items?.find(item => item.quantityRemaining > 0);
    setDeliveryForm({poId: orderId, productId: cachedItem?.productId ?? "", quantityDelivered: String(cachedItem?.quantityRemaining ?? 1),
      deliveryDate: pharmacyDate(), deliveryStatus: "Received", batchNumber: "", expirationDate: ""});
    setIsPreparingReceiving(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Loading receiving details took too long. Retry loading to continue."));
          controller.abort();
        }, 15000);
      });
      const [data] = await Promise.race([Promise.all([
        fetch("/api/purchase-orders", {credentials: "include", signal: controller.signal})
          .then(response => readResponse(response, "Could not refresh purchase orders.")),
        fetchInventoryData(true),
      ]), deadline]);
      if (receivingPreparation.current !== controller) return;
      if (!Array.isArray(data.purchaseOrders)) throw new Error("Could not refresh purchase orders.");
      const freshOrders = data.purchaseOrders as PurchaseOrder[];
      setOrders(freshOrders);
      saveStored("medprix_procurement_orders", freshOrders);
      const problem = receivingDataProblem(freshOrders);
      if (problem) throw new Error(problem);
      const order = freshOrders.find(order => order.id === orderId);
      const item = order?.items?.find(item => item.quantityRemaining > 0);
      if (orderId && (!order || ["Fulfilled", "Cancelled"].includes(order.status) || !item))
        throw new Error("This purchase order has no outstanding items to receive. Review the refreshed order list.");
      setDeliveryForm({poId: orderId, productId: item?.productId ?? "", quantityDelivered: item ? String(item.quantityRemaining) : "1",
        deliveryDate: pharmacyDate(), deliveryStatus: "Received", batchNumber: "", expirationDate: ""});
    } catch (requestError) {
      if (receivingPreparation.current === controller)
        setReceivingLoadError(safeError(requestError, "Could not prepare the receiving report. Retry loading to continue."));
    } finally {
      clearTimeout(timer);
      if (receivingPreparation.current === controller) setIsPreparingReceiving(false);
    }
  };

  const openItemsModal = async (order: PurchaseOrder) => {
    setReceivingError("");
    setSelectedOrderForItems(order);
    if (!order.items || order.items.length === 0) {
      try {
        const res = await fetch(`/api/purchase-orders/${order.id}/items`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            const updatedOrder = { ...order, items: data.items, itemCount: data.items.length };
            setSelectedOrderForItems(updatedOrder);
            const updatedOrders = orders.map((o) => (o.id === order.id ? updatedOrder : o));
            setOrders(updatedOrders);
            saveStored("medprix_procurement_orders", updatedOrders);
          }
        }
      } catch {}
    }
  };

  const submitPurchaseOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !supplierId ||
      lineItems.some(
        (item) =>
          !item.productId ||
          Number(item.quantityOrdered) <= 0 ||
          Number(item.unitCost) < 0,
      )
    ) {
      setPoError("Choose a supplier and complete every line item.");
      return;
    }

    if (isSaving) return;
    setPoError("");
    const duplicate = lineItems.find((item, index) => lineItems.findIndex((other) => other.productId === item.productId) !== index);
    if (duplicate) { setPoError("This product is already listed. Edit its existing quantity instead."); return; }
    const finalPoNum =
      poNumber.trim() ||
      `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, "0")}`;

    try {
      setIsSaving(true);
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          poNumber: finalPoNum,
          status: "Draft",
          items: lineItems.map((item) => ({
            productId: item.productId,
            quantityOrdered: Number(item.quantityOrdered),
            unitCost: Number(item.unitCost),
          })),
        }),
      });
      const data = await readResponse(response, "Could not complete this procurement request. Please try again.");
      if (!response.ok) throw new Error(data.error || "Failed to create purchase order.");
      if (!data.purchaseOrder?.id) throw new Error("Purchase order save could not be confirmed. Check the order list before retrying.");
      setIsCreateOpen(false);
      setSupplierId("");
      setPoNumber("");
      setLineItems([{ productId: "", quantityOrdered: "1", unitCost: "0" }]);
      await Promise.all([loadData(), fetchInventoryData(true)]);
      onToast("Purchase order created with Draft status.");
    } catch (requestError) {
      setPoError(safeError(requestError, "Failed to create purchase order."));
    } finally {
      setIsSaving(false);
    }
  };

  const submitDelivery = async (event: FormEvent) => {
    event.preventDefault();
    if (!deliveryForm.batchNumber.trim()) {
      setError("Select a recorded batch or enter the manufacturer's batch number.");
      return;
    }
    if (!receivingItem || Number(deliveryForm.quantityDelivered) > receivingItem.quantityRemaining) {
      setError("Select an outstanding product from this purchase order and review its remaining quantity.");
      return;
    }
    if (receivingBusy.current || isPreparingReceiving || receivingLoadError || !receivingSubmitter.current || !receivingReady || pendingReceiving) return;
    receivingBusy.current = true;
    setError("");
    setReceivingError("");
    try {
      setIsSaving(true);
      await receivingSubmitter.current.submit({
        poId: deliveryForm.poId, deliveryDate: deliveryForm.deliveryDate, deliveryStatus: deliveryForm.deliveryStatus,
        items: [{productId: deliveryForm.productId, batchNumber: deliveryForm.batchNumber,
          expirationDate: existingDeliveryBatch?.expiryDate ?? deliveryForm.expirationDate,
          quantityDelivered: Number(deliveryForm.quantityDelivered)}],
      });
      setIsDeliveryOpen(false);
      await Promise.all([loadData(), fetchInventoryData(true)]);
      onToast(["Received", "Inspected", "Partial"].includes(deliveryForm.deliveryStatus)
        ? "Receiving report saved and inventory updated." : "Receiving report saved. Inventory was not changed.");
    } catch (requestError) {
      const message = safeError(requestError, "Receiving could not be confirmed. Check the saved result before retrying.");
      if (receivingSubmitter.current?.getPending()) setReceivingError(message);
      else setError(message);
    } finally {
      setPendingReceiving(receivingSubmitter.current?.getPending() ?? null);
      receivingBusy.current = false;
      setIsSaving(false);
    }
  };

  const submitInvoice = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      const response = await fetch("/api/supplier-invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...invoiceForm,
          poId: invoiceForm.poId || null,
          invoiceAmount: Number(invoiceForm.invoiceAmount),
        }),
      });
      const data = await readResponse(response, "Could not complete this procurement request. Please try again.");
      if (!response.ok) throw new Error(data.error || "Failed to create supplier invoice.");
      if (!data.invoice?.id) throw new Error("Invoice save could not be confirmed. Check the invoice list before retrying.");
      const createdInvoice = data.invoice as Invoice | undefined;
      if (createdInvoice?.id) {
        setInvoices((current) => {
          const next = [
            createdInvoice,
            ...current.filter(
              (invoice) =>
                invoice.id !== createdInvoice.id,
            ),
          ];
          saveStored("medprix_procurement_invoices", next);
          return next;
        });
      }
      setIsInvoiceOpen(false);
      setInvoiceForm({ supplierId: "", poId: "", invoiceNumber: "", dueDate: "", invoiceAmount: "0", isPaid: false });
      onToast("Supplier invoice and payable created.");
      void refreshInvoicesAndPayables();
    } catch (requestError) {
      setError(safeError(requestError, "Failed to create supplier invoice."));
    } finally {
      setIsSaving(false);
    }
  };

  const refreshInvoicesAndPayables = async () => {
    setIsInvoiceRefreshing(true);
    setInvoiceRefreshError("");
    try {
      const response = await fetch("/api/supplier-invoices", {
        credentials: "include",
      });
      const data = await readResponse(response, "Could not complete this procurement request. Please try again.");
      if (!response.ok) throw new Error(data.error || "Failed to refresh invoices.");
      if (!Array.isArray(data.invoices)) throw new Error("Invalid invoice response. Please refresh.");
      if (Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
        saveStored("medprix_procurement_invoices", data.invoices);
      }
      await fetchAccountsPayable();
    } catch (requestError) {
      setInvoiceRefreshError(
        requestError instanceof Error
          ? safeError(requestError)
          : "Invoice refresh failed. Cached invoices are still shown.",
      );
    } finally {
      setIsInvoiceRefreshing(false);
    }
  };

  const tableMessage = (columns: number, loading: boolean, itemCount: number) => {
    if (loading && itemCount === 0)
      return (
        <tr>
          <td colSpan={columns} className="muted">
            Loading procurement data...
          </td>
        </tr>
      );
    if (error && itemCount === 0)
      return (
        <tr>
          <td colSpan={columns} className="muted">
            {error}
          </td>
        </tr>
      );
    return null;
  };

  const receivingRecovery = () => pendingReceiving && (
    <div className="card receiving-recovery" role="status">
      <div className="receiving-recovery-copy">
        <strong>Receiving report awaiting confirmation</strong>
        <p className="muted">Your submitted details are retained. Check the result or retry this same report before starting another.</p>
        <p className="muted">Reference: <code>{pendingReceiving.key}</code></p>
        {receivingError && <p className="inline-error" role="alert">{receivingError}</p>}
      </div>
      <div className="receiving-recovery-actions">
        <button type="button" className="button soft" disabled={isSaving} onClick={() => void recoverReceiving(false)}>Check receiving result</button>
        <button type="button" className="button dark" disabled={isSaving} onClick={() => void recoverReceiving(true)}>Retry same receiving report</button>
      </div>
    </div>
  );

  return (
    <div>
      {paymentInvoiceId && <SupplierPaymentDialog invoiceId={paymentInvoiceId} onClose={() => setPaymentInvoiceId(null)} onToast={onToast} onSaved={refreshInvoicesAndPayables} />}
      <PageHeading
        title="Procurement"
        description="Keep purchasing predictable from request to receiving."
        action={canManagePurchasing ? (
          <button
            className="button primary-action"
            data-testid="button-create-po"
            onClick={() => {
              void refreshInventory();
              setIsCreateOpen(true);
            }}>
            <Plus size={14} /> Create purchase order
          </button>
        ) : undefined}
      />
      {!isDeliveryOpen && receivingRecovery()}
      {(error || statusError || receivingError || receivingProblem) && <div className="inline-error" role="alert"><span>{statusError || receivingError || receivingProblem || error} Previously loaded data may be out of date.</span><button className="button soft" disabled={receivingAccess === "loading" || isSaving} onClick={() => { setReceivingError(""); if (!receivingReady) setReceivingAccessAttempt(attempt => attempt + 1); void loadData(); }}>{receivingAccess === "loading" ? "Checking receiving access..." : !receivingReady ? "Retry receiving access" : "Retry refresh"}</button></div>}
      <div className="summary-strip">
        <Summary
          label="Open orders"
          value={String(
            orders.filter((order) => !["Fulfilled", "Cancelled"].includes(order.status)).length
          )}
          caption={`${money(totalOpenValue)} committed`}
        />
        <Summary
          label="Awaiting approval"
          value={String(orders.filter((order) => order.status === "Pending").length)}
          caption="Needs your review"
          tone="warning"
        />
        <Summary
          label="Received deliveries"
          value={String(deliveries.length)}
          caption="Recorded supplier deliveries"
        />
      </div>
      <div className="table-tools supplier-invoices" style={{ marginBottom: 16 }}>
        {[
          "Purchase Order Monitoring",
          "Receiving Report Management",
          "Purchase Invoice Monitoring",
        ].filter((section) => canManagePurchasing || section === "Receiving Report Management").map((section) => (
          <button
            key={section}
            className={`button ${activeSection === section ? "primary-action" : "soft"}`}
            onClick={() => setActiveSection(section)}>
            {section}
          </button>
        ))}
      </div>

      {activeSection === "Purchase Order Monitoring" && (
        <section className="surface-card table-card">
          <div className="table-tools procurement-table-tools">
            <div>
              <h2 className="card-title">Purchase orders</h2>
              <p className="card-subtitle">Latest orders, line items, and delivery status</p>
            </div>
            <div className="procurement-table-controls purchase-order-controls">
              <div className="procurement-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search purchase orders" placeholder="Search PO, supplier, product or SKU"
                  value={orderSearch}
                  onChange={event => setOrderSearch(event.target.value)} />
              </div>
              <select
                className="select"
                data-testid="select-procurement-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}>
                <option>All orders</option>
                {poStatuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(7, loadingSections.orders, orders.length) ||
                  (filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        {orderSearch || status !== "All orders" ? "No purchase orders match these filters." : "No purchase orders found."}
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.poNumber}</strong>
                        </td>
                        <td>{order.supplier}</td>
                        <td className="muted">
                          {new Date(order.orderDate).toLocaleDateString()}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="pill neutral"
                            style={{ cursor: "pointer", border: "1px solid rgba(0,0,0,0.1)" }}
                            onClick={() => void openItemsModal(order)}>
                            <Package size={12} style={{ marginRight: 4 }} />
                            {order.itemCount || (order.items?.length ?? 1)} item(s)
                          </button>
                        </td>
                        <td>
                          <strong>{money(order.totalOrderAmount)}</strong>
                        </td>
                        <td>
                          {canManagePurchasing && !["Fulfilled", "Cancelled"].includes(order.status) ? <select
                            className="select"
                            data-testid={`select-status-${order.id}`}
                            value={order.status}
                            disabled={isSaving}
                            onChange={(event) =>
                              event.target.value === "Cancelled" ? setOrderToCancel(order) : void updateStatus(order.id, event.target.value)
                            }>
                            {poStatuses.filter(item => item !== "Fulfilled").map((item) => (
                              <option key={item} disabled={item === "Cancelled" && order.items?.some(line => line.quantityReceived > 0)}>{item}</option>
                            ))}
                          </select> : <span className="pill neutral">{order.status}</span>}
                        </td>
                        <td className="flex flex-row gap-3">
                          {canManagePurchasing && !["Fulfilled", "Cancelled"].includes(order.status) && order.items?.some(item => item.quantityRemaining > 0) &&
                            <button
                              type="button"
                              className="button soft"
                              style={{ fontSize: 12, padding: "4px 8px"}}
                              disabled={isSaving}
                              onClick={() => void openReceiving(order.id)}>
                              <PackagePlus size={12} />
                              Receive
                            </button>}
                          <button
                            type="button"
                            className="button soft"
                            style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => void openItemsModal(order)}>
                            <Eye size={12} /> View items
                          </button>
                        </td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "Receiving Report Management" && (
        <section className="surface-card table-card">
          <div className="table-tools procurement-table-tools">
            <div>
              <h2 className="card-title">Receiving reports</h2>
              <p className="card-subtitle">Stock-in records with batch and expiry monitoring</p>
            </div>
            <div className="procurement-table-controls">
              <div className="procurement-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Search receiving reports" placeholder="Search PO, supplier, product or batch" value={receivingSearch} onChange={event => setReceivingSearch(event.target.value)} /></div>
            {canManagePurchasing && (
              <button
                className="button primary-action"
                disabled={isSaving}
                onClick={() => void openReceiving()}>
                <Plus size={14} /> Add receiving report
              </button>
            )}
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>Supplier</th>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Quantity</th>
                  <th>Delivery status</th>
                  <th>Expiry status</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(8, loadingSections.deliveries, deliveries.length) ||
                  (filteredReceivingRows.length === 0 ? (
                    <tr><td colSpan={8} className="muted">{receivingSearch ? "No receiving reports match this search." : "No receiving reports found."}</td></tr>
                  ) : filteredReceivingRows.map(({delivery, item}) => {
                    const expiry = expiryStatus(item.expirationDate);
                    return <tr key={item.id}>
                      <td>{delivery.poNumber}<div className="muted" style={{fontSize: 12}}>{formatDeliveryDate(delivery.deliveryDate)}</div></td>
                      <td>{delivery.supplier}</td><td>{item.product}</td><td>{item.batchNumber}</td>
                      <td>{item.expirationDate}</td><td>{item.quantityDelivered}</td><td>{delivery.deliveryStatus}</td>
                      <td><span className={`pill ${expiry.tone}`}>{expiry.label}</span></td>
                    </tr>;
                  }))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "Purchase Invoice Monitoring" && (
        <section className="surface-card table-card">
          <div className="table-tools procurement-table-tools">
            <div>
              <h2 className="card-title">Supplier invoices</h2>
              <p className="card-subtitle">Outstanding and settled purchase invoices</p>
            </div>
            <div className="procurement-table-controls">
              <div className="procurement-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Search purchase invoices" placeholder="Search invoice, supplier or PO" value={invoiceSearch} onChange={event => setInvoiceSearch(event.target.value)} /></div>
              {isInvoiceRefreshing && (
                <span className="muted" role="status">Refreshing…</span>
              )}
              <button className="button primary-action" onClick={() => setIsInvoiceOpen(true)}>
                <Plus size={14} /> Add invoice
              </button>
            </div>
          </div>
          {invoiceRefreshError && (
            <div className="inline-error" role="alert">
              <span>{invoiceRefreshError} Cached invoice data remains available.</span>
              <button
                type="button"
                className="button soft"
                disabled={isInvoiceRefreshing}
                onClick={() => void refreshInvoicesAndPayables()}>
                Retry
              </button>
            </div>
          )}
          <div className="table-scroll">
            <table className="data-table purchase-invoice-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th>Purchase order</th>
                  <th>Due date</th>
                  <th>Amount</th>
                  <th className="invoice-payment-heading">Status</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(6, loadingSections.invoices, invoices.length) ||
                  (filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        {invoiceSearch ? "No supplier invoices match this search." : "No supplier invoices found."}
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <strong>{invoice.invoiceNumber}</strong>
                        </td>
                        <td>{invoice.supplier}</td>
                        <td>{invoice.poNumber || "N/A"}</td>
                        <td>{invoice.dueDate}</td>
                        <td>
                          <strong>{money(invoice.invoiceAmount)}</strong>
                        </td>
                        <td className="invoice-payment-cell"><div className="invoice-payment-actions"><span className={`pill ${invoice.status === "Paid" ? "success" : "warning"}`}>{invoice.status === "Paid" ? "Settled" : invoice.status}</span>
                          {canManagePurchasing && invoice.status !== "Paid" && invoice.status !== "Needs Review" && <button className="button soft" onClick={() => setPaymentInvoiceId(invoice.id)}>Record payment</button>}</div></td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PO Items Modal */}
      {selectedOrderForItems &&
        createPortal(
          <div
            className="modal-backdrop"
            data-testid="modal-po-items"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setSelectedOrderForItems(null)
            }>
            <div className="modal dialog" style={{ maxWidth: 640 }}>
              <div className="modal-header">
                <div>
                  <h2>Purchase order items</h2>
                  <p className="modal-sub">
                    {selectedOrderForItems.poNumber} • {selectedOrderForItems.supplier}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelectedOrderForItems(null)}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ margin: "12px 0 20px 0" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.03)",
                    borderRadius: 8,
                    marginBottom: 14,
                    fontSize: 13,
                  }}>
                  <div>
                    <strong>Status:</strong>{" "}
                    <span className="pill neutral">{selectedOrderForItems.status}</span>
                  </div>
                  <div>
                    <strong>Placed:</strong>{" "}
                    {new Date(selectedOrderForItems.orderDate).toLocaleDateString()}
                  </div>
                  <div>
                    <strong>Total:</strong>{" "}
                    <strong>{money(selectedOrderForItems.totalOrderAmount)}</strong>
                  </div>
                </div>

                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Qty ordered</th>
                        <th>Unit cost</th>
                        <th>Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderForItems.items && selectedOrderForItems.items.length > 0 ? (
                        selectedOrderForItems.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.product}</strong>
                            </td>
                            <td>{item.sku || "N/A"}</td>
                            <td>{item.quantityOrdered}</td>
                            <td>{money(item.unitCost)}</td>
                            <td>
                              <strong>{money(item.lineTotal)}</strong>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="muted">
                            {selectedOrderForItems.itemCount} item(s) ordered (Total:{" "}
                            {money(selectedOrderForItems.totalOrderAmount)})
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {(receivingError || receivingProblem) && <div className="inline-error" role="alert">{receivingError || receivingProblem}</div>}
              <div
                className="modal-actions"
                style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  type="button"
                  className="button soft"
                  onClick={() => setSelectedOrderForItems(null)}>
                  Close
                </button>
                <button
                  type="button"
                  className="button primary-action"
                  disabled={isSaving || ["Fulfilled", "Cancelled"].includes(selectedOrderForItems.status)}
                  onClick={() => void openReceiving(selectedOrderForItems.id)}>
                  <Plus size={13} /> {isSaving ? "Preparing..." : "Receive delivery for this PO"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Create Purchase Order Modal */}
      {isCreateOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            data-testid="modal-create-po"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setIsCreateOpen(false)
            }>
            <form className="modal dialog" onSubmit={submitPurchaseOrder}>
              <div className="modal-header">
                <div>
                  <h2>Create purchase order</h2>
                  <p className="modal-sub">
                    Supplier order details and line items (starts as <strong>Draft</strong>).
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsCreateOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Supplier *</label>
                  <select
                    required
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}>
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>PO number</label>
                  <input
                    placeholder="Auto-generated if blank"
                    value={poNumber}
                    onChange={(event) => setPoNumber(event.target.value)}
                  />
                </div>
              </div>
              <div className="modal-section">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                  <h4>Line items</h4>
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      setLineItems([
                        ...lineItems,
                        { productId: "", quantityOrdered: "1", unitCost: "0" },
                      ])
                    }>
                    <Plus size={13} /> Add item
                  </button>
                </div>
                {lineItems.map((item, index) => (
                  <div
                    className="form-grid"
                    key={index}
                    style={{ alignItems: "end", marginTop: 10 }}>
                    <div className="field">
                      <label>Product *</label>
                      <select
                        required
                        aria-describedby={poError ? "po-form-error" : undefined}
                        value={item.productId}
                        onChange={(event) => {
                          const pId = event.target.value;
                          const existing = lineItems.findIndex((line, lineIndex) => lineIndex !== index && line.productId === pId);
                          if (pId && existing >= 0) { setPoError(`${products.find((p) => p.id === pId)?.name || "Product"} is already on line ${existing + 1}. Edit its quantity there.`); document.getElementById(`po-quantity-${existing}`)?.focus(); return; }
                          setPoError("");
                          const selectedProd = products.find((p) => p.id === pId);
                          let autoCost = item.unitCost;
                          if (selectedProd && (item.unitCost === "0" || !item.unitCost)) {
                            const parsedCost = parseFloat(
                              String(selectedProd.cost || selectedProd.price || "0").replace(
                                /[^0-9.]/g,
                                ""
                              )
                            );
                            if (parsedCost > 0) autoCost = String(parsedCost);
                          }
                          setLineItems(
                            lineItems.map((line, lineIndex) =>
                              lineIndex === index
                                ? {
                                    ...line,
                                    productId: pId,
                                    unitCost: autoCost,
                                  }
                                : line
                            )
                          );
                        }}>
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.sku})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Quantity *</label>
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        id={`po-quantity-${index}`}
                        aria-label={`Quantity for line ${index + 1}`}
                        value={item.quantityOrdered}
                        onChange={(event) =>
                          setLineItems(
                            lineItems.map((line, lineIndex) =>
                              lineIndex === index
                                ? { ...line, quantityOrdered: event.target.value }
                                : line
                            )
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Unit cost *</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitCost}
                        onChange={(event) =>
                          setLineItems(
                            lineItems.map((line, lineIndex) =>
                              lineIndex === index
                                ? { ...line, unitCost: event.target.value }
                                : line
                            )
                          )
                        }
                      />
                    </div>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remove line item"
                        onClick={() =>
                          setLineItems(lineItems.filter((_, lineIndex) => lineIndex !== index))
                        }>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {poError && <div id="po-form-error" className="inline-error" role="alert">{poError}</div>}
              <div className="modal-actions items-center">
                <strong>Total: {money(runningTotal)}</strong>
                <button className="button primary-action" type="submit" disabled={isSaving}>
                  <Check size={13} /> {isSaving ? "Creating..." : "Create Draft Purchase Order"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {orderToCancel && createPortal(
        <div className="modal-backdrop" data-testid="modal-cancel-po" onMouseDown={event => {
          if (event.currentTarget === event.target && !isSaving) setOrderToCancel(null);
        }}>
          <div className="modal dialog">
            <div className="modal-header"><h2>Cancel purchase order?</h2></div>
            <p>Cancel {orderToCancel.poNumber}? This closes the order to further receiving. It does not reverse any recorded delivery or inventory movement.</p>
            <div className="modal-actions">
              <button type="button" className="button soft" disabled={isSaving} onClick={() => setOrderToCancel(null)}>Keep purchase order</button>
              <button type="button" className="button primary-action" disabled={isSaving} onClick={async () => {
                await updateStatus(orderToCancel.id, "Cancelled");
                setOrderToCancel(null);
              }}>{isSaving ? "Cancelling..." : "Cancel purchase order"}</button>
            </div>
          </div>
        </div>, document.body)}

      {/* Add Receiving Report Modal */}
      {isDeliveryOpen &&
        createPortal(
          <div
            className="modal-backdrop receiving-backdrop"
            data-testid="modal-create-delivery"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setIsDeliveryOpen(false)
            }>
            <div className="receiving-dialog-frame" ref={setBatchPopupContainer}>
            <form className="modal dialog receiving-dialog" onSubmit={submitDelivery} aria-busy={isPreparingReceiving}>
              <div className="modal-header">
                <div>
                  <h2>Add receiving report</h2>
                  <p className="modal-sub">
                    Choose an order or product, then record the delivered batch and quantity.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsDeliveryOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="receiving-dialog-body" ref={receivingBody}>
              {receivingRecovery()}
              <span className="sr-only" role="status" aria-live="polite">{showReceivingLoading && isPreparingReceiving ? "Loading purchase orders and inventory…" : receivingAccess === "loading" ? "Checking receiving access…" : ""}</span>
              {receivingLoadError && <div className="inline-error receiving-load-error" role="alert"><span>{receivingLoadError}</span><button type="button" className="button soft" onClick={() => void openReceiving(deliveryForm.poId)}>Retry loading</button></div>}
              {receivingAccess === "failed" && !pendingReceiving && <div className="receiving-access-notice" role="status">
                <p className="modal-sub">{receivingError || "Receiving access is unavailable. Retry to continue."}</p>
                <button type="button" className="button soft" onClick={() => setReceivingAccessAttempt(attempt => attempt + 1)}>Retry receiving access</button>
              </div>}
              {!isPreparingReceiving && !receivingLoadError && receivingOrders.length === 0 && !pendingReceiving && <div className="receiving-empty" role="status">
                <p className="modal-sub">No open purchase orders have products left to receive. Create a purchase order with the delivered products first.</p>
                <button type="button" className="button soft" onClick={() => { setIsDeliveryOpen(false); setActiveSection("Purchase Order Monitoring"); setIsCreateOpen(true); }}>Create purchase order</button>
              </div>}
              <fieldset className="form-grid receiving-fields" disabled={receivingFieldsDisabled}>
                <div className="field">
                  <label htmlFor="receiving-order">Purchase order *</label>
                  <ReceivingChoicePicker
                    id="receiving-order"
                    label="Purchase order"
                    placeholder="Choose a purchase order"
                    searchPlaceholder="Search purchase orders"
                    emptyMessage="No outstanding purchase orders match."
                    disabled={receivingFieldsDisabled}
                    popupContainer={batchPopupContainer}
                    options={receivingOrders.map(order => ({ id: order.id, label: order.poNumber,
                      detail: `${order.supplier} · ${order.items?.filter(item => item.quantityRemaining > 0).length ?? 0} outstanding product(s)` }))}
                    value={deliveryForm.poId}
                    onChange={(selectedPoId) => {
                      const order = orders.find((o) => o.id === selectedPoId);
                      const firstItem = order?.items?.find(item => item.quantityRemaining > 0);
                      setDeliveryForm({
                        ...deliveryForm,
                        poId: selectedPoId,
                        productId:
                          firstItem?.productId || "",
                        batchNumber: "",
                        expirationDate: "",
                        quantityDelivered: firstItem
                          ? String(firstItem.quantityRemaining)
                          : "1",
                      });
                    }} />
                </div>
                <div className="field">
                  <label>Delivery status *</label>
                  <select
                    required
                    value={deliveryForm.deliveryStatus}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        deliveryStatus: event.target.value,
                      })
                    }>
                    <option>Received</option>
                    <option>Pending</option>
                    <option>Partial</option>
                    <option>Inspected</option>
                    <option>Rejected</option>
                  </select>
                </div>
                <div className="field">
                  <label>Delivery date *</label>
                  <input
                    required
                    type="date"
                    value={deliveryForm.deliveryDate}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        deliveryDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="receiving-product">Product *</label>
                  <ReceivingChoicePicker
                    id="receiving-product"
                    label="Product"
                    placeholder="Choose an outstanding product"
                    searchPlaceholder="Search products, SKU or purchase order"
                    emptyMessage="No outstanding products match."
                    disabled={receivingFieldsDisabled}
                    popupContainer={batchPopupContainer}
                    options={receivingProductChoices.map(({order, item}) => ({ id: `${order.id}:${item.productId}`,
                      label: `${item.product} (${item.sku})`, detail: `${order.poNumber} · ${order.supplier} · ${item.quantityRemaining} left to receive` }))}
                    value={deliveryForm.productId ? `${deliveryForm.poId}:${deliveryForm.productId}` : ""}
                    onChange={choiceId => {
                      const choice = receivingProductChoices.find(({order, item}) => `${order.id}:${item.productId}` === choiceId);
                      if (!choice) return;
                      setDeliveryForm(current => ({ ...current, poId: choice.order.id, productId: choice.item.productId,
                        quantityDelivered: String(choice.item.quantityRemaining), batchNumber: "", expirationDate: "" }));
                    }} />
                </div>
                <div className="field">
                  <label htmlFor="receiving-batch">Batch number *</label>
                  <ReceivingBatchPicker key={`${deliveryForm.poId}:${deliveryForm.productId}`} batches={deliveryBatches}
                    value={deliveryForm.batchNumber} popupContainer={batchPopupContainer} disabled={!receivingItem || isSaving || Boolean(pendingReceiving)}
                    onChange={(batchNumber, expirationDate) => setDeliveryForm(current => ({...current, batchNumber,
                      ...(expirationDate !== undefined ? {expirationDate} : {})}))} />
                </div>
                <div className="field">
                  <label>Expiration date *</label>
                  <input
                    required
                    type="date"
                    value={existingDeliveryBatch?.expiryDate ?? deliveryForm.expirationDate}
                    readOnly={Boolean(existingDeliveryBatch)}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        expirationDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Quantity delivered *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max={receivingItem?.quantityRemaining}
                    step="1"
                    value={deliveryForm.quantityDelivered}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        quantityDelivered: event.target.value,
                      })
                    }
                  />
                </div>
              </fieldset>
              {receivingItem && <p className="modal-sub">Ordered: {receivingItem.quantityOrdered} · Received: {receivingItem.quantityReceived} · Remaining: {receivingItem.quantityRemaining}.
                {["Received", "Inspected", "Partial"].includes(deliveryForm.deliveryStatus) ? " Saving adds the entered quantity to inventory. The PO completes when all ordered quantities are received." : " Saving this status does not change inventory."}</p>}
              {error && <div className="inline-error" role="alert">{error}</div>}
              </div>
              <div className="modal-actions">
                {pendingReceiving ? <button className="button soft" type="button" disabled={isSaving} onClick={() => setIsDeliveryOpen(false)}>Close report</button> :
                <button className="button primary-action" type="submit" disabled={isSaving || isPreparingReceiving || Boolean(receivingLoadError) || !receivingItem || !receivingReady || Boolean(pendingReceiving)}>
                  {showReceivingLoading && isPreparingReceiving ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
                  {isSaving ? "Saving..." : "Save receiving report"}
                </button>}
              </div>
            </form>
            </div>
          </div>,
          document.body
        )}

      {/* Add Supplier Invoice Modal */}
      {isInvoiceOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            data-testid="modal-create-invoice"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setIsInvoiceOpen(false)
            }>
            <form className="modal dialog" onSubmit={submitInvoice}>
              <div className="modal-header">
                <div>
                  <h2>Add supplier invoice</h2>
                  <p className="modal-sub">Record an invoice and its payment status.</p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsInvoiceOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Supplier *</label>
                  <select
                    required
                    value={invoiceForm.supplierId}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        supplierId: event.target.value,
                        poId: "",
                      })
                    }>
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Purchase order</label>
                  <select
                    value={invoiceForm.poId}
                    onChange={(event) =>
                      setInvoiceForm({ ...invoiceForm, poId: event.target.value })
                    }>
                    <option value="">None</option>
                    {orders
                      .filter(
                        (order) =>
                          !invoiceForm.supplierId ||
                          suppliers.some(
                            (supplier) =>
                              supplier.id === invoiceForm.supplierId &&
                              supplier.name === order.supplier
                          )
                      )
                      .map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.poNumber}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label>Invoice number *</label>
                  <input
                    required
                    value={invoiceForm.invoiceNumber}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        invoiceNumber: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Due date *</label>
                  <input
                    required
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        dueDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Invoice amount *</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoiceForm.invoiceAmount}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        invoiceAmount: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Payment status</label>
                  <select
                    value={invoiceForm.isPaid ? "Paid" : "Unpaid"}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        isPaid: event.target.value === "Paid",
                      })
                    }>
                    <option>Unpaid</option>

                  </select>
                </div>
              </div>
              {error && <div className="inline-error" role="alert">{error}</div>}
              <div className="modal-actions">
                <button className="button primary-action" type="submit" disabled={isSaving}>
                  <Check size={13} /> {isSaving ? "Saving..." : "Save invoice"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
}
