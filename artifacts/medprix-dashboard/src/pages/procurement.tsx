import { SourceProgress } from "@/components/custom-ui/source-state";
import { SelectField } from "@/components/custom-ui/select-field";
import { PageTableValue, PageTableRow, PageTableAction, usePageTableStandard } from "@/components/page-table-context";
import { AppTooltip } from "@/components/ui/tooltip";
import { ModalTableDialog, ModalDataTable } from "@/components/modal-data-table";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { parseCalendarDate, formatCalendarDate, formatDisplayDate } from "@/lib/business-date";
import { pharmacyDate, type WholesaleInstallmentBalance } from "@workspace/api-zod";
import { WholesaleInstallmentBalances } from "@/components/wholesale-installment-balances";
import { createReceivingSubmitter, type PendingReceiving } from "@/lib/receiving-submission";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { SupplierPaymentDialog, computeNextPaymentDate, PAYMENT_MODES, type PaymentMode } from "@/components/supplier-payment-dialog";
import { ReceivingBatchPicker } from "@/components/custom-ui/receiving-batch-picker";
import { ChoicePicker } from "@/components/custom-ui/choice-picker";
import { ReceivingReportDecisionDialog, type ReceivingDecision } from "@/components/receiving-report-decision-dialog";
import { safeError, readResponse } from "@/lib/feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, Package, Plus, Trash2, X, PackagePlus, Search, LoaderCircle, Banknote, CheckCircle, Ban, Pencil, Download, Layers, Truck, AlertCircle } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { ProcurementFeedback, ProcurementRefreshButton, ProcurementSummary } from "@/components/custom-ui/procurement-loading";
import type { ToastFn } from "@/lib/types";
import { fetchInventoryData, usePharmacyInventory } from "@/lib/pharmacy-store";
import { fetchAccountsPayable } from "@/lib/supplier-store";
import { downloadInvoicePdf, downloadReceivingReportPdf } from "@/lib/invoice-pdf";

type Supplier = { id: string; name: string; paymentTerms?: string };
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
  batchNumber?: string;
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
  productId?: string;
  product: string;
  sku?: string;
  batchNumber: string;
  expirationDate: string;
  quantityDelivered: number;
  notes?: string;
};
type Delivery = {
  id: string;
  poId?: string;
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  deliveryStatus: string;
  isUserEditedStatus?: boolean;
  notes?: string;
  items: DeliveryItem[];
};
type Invoice = {
  id: string;
  invoiceNumber: string;
  supplierId?: string;
  supplier: string;
  paymentTerms?: string;
  poNumber: string | null;
  dueDate: string;
  invoiceAmount: string;
  totalPaid?: string;
  balance?: string;
  payments?: Array<{
    id?: string;
    amountPaid: string | number;
    paymentDate: string;
    notes?: string | null;
  }>;
  status: string;
};

type BatchRecord = {
  id: string;
  batchNumber: string;
  product: string;
  sku: string;
  poNumber: string;
  supplier: string;
  date: string;
  expirationDate: string;
  quantity: number;
  status: string;
  receivingStatus?: string;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
};

function getItemBatchNumber(poNumber?: string | null, sku?: string | null, index = 0): string {
  const parts = String(poNumber || "").split("-");
  const lastDigits = (parts[parts.length - 1] || "").replace(/[^0-9]/g, "");
  const allDigits = String(poNumber || "").replace(/[^0-9]/g, "");
  const poSeq = (lastDigits || allDigits.slice(-3) || "001").slice(-3).padStart(3, "0");
  const cleanSku = String(sku || `MED${String(index + 1).padStart(4, "0")}`)
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  return `BAT-${poSeq}-${cleanSku}`;
}

function getPoBatchNumber(order?: { poNumber: string; items?: Array<{ sku?: string; batchNumber?: string }> } | null): string {
  if (!order?.poNumber) return "BAT-001-MED0001";
  if (order.items && order.items.length > 0) {
    return order.items
      .map((it, idx) => it.batchNumber || getItemBatchNumber(order.poNumber, it.sku, idx))
      .join(", ");
  }
  return getItemBatchNumber(order.poNumber, "MED0001", 0);
}

function getStatusPillClass(status: string): string {
  const s = String(status || "").trim();
  if (s === "Pending" || s === "Lacking" || s === "Expiring Soon") return "pill orange";
  if (s === "Waiting for delivery") return "pill yellow";
  if (s === "Delivered") return "pill blue";
  if (s === "Successful" || s === "Settled" || s === "Paid" || s === "Valid") return "pill success";
  if (s === "Rejected" || s === "Overdue" || s === "Expired" || s === "Cancelled") return "pill danger";
  return "pill neutral";
}

function normalizePoStatus(status: string): string {
  if (status === "Fulfilled" || status === "Delivered" || status === "Successful") return "Delivered";
  if (status === "Approved" || status === "Submitted" || status === "Waiting for delivery") return "Waiting for delivery";
  if (status === "Cancelled") return "Cancelled";
  return "Pending";
}

function formatReceivingDeliveryStatus(status: string): "Pending" | "Waiting for delivery" | "Rejected" | "Delivered" | "Successful" {
  const s = String(status || "").toLowerCase().trim();
  if (s === "successful") return "Successful";
  if (s === "rejected") return "Rejected";
  if (s === "delivered" || s === "received" || s === "fulfilled" || s === "inspected" || s === "lacking" || s === "partial") return "Delivered";
  if (s === "waiting for delivery" || s === "waiting" || s === "approved" || s === "submitted") return "Waiting for delivery";
  return "Pending";
}

function normalizeInvoiceStatus(invoice: { status: string; balance?: string; dueDate?: string }): string {
  if (invoice.status === "Paid" || invoice.status === "Settled" || (invoice.balance !== undefined && Number(invoice.balance) === 0)) {
    return "Settled";
  }
  const today = new Date().toISOString().slice(0, 10);
  if (invoice.status === "Overdue" || (invoice.dueDate && invoice.dueDate < today)) {
    return "Overdue";
  }
  return "Pending";
}

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

const editablePoStatuses = poStatuses.filter(item => item !== "Fulfilled");
const orderStatusOptions = {
  cancellable: editablePoStatuses.map(item => <option key={item}>{item}</option>),
  received: editablePoStatuses.map(item => <option key={item} disabled={item === "Cancelled"}>{item}</option>),
};

function matchesSearch(search: string, fields: unknown[]): boolean {
  if (!search.trim()) return true;
  const text = fields.map(value => String(value ?? "")).join(" ").toLocaleLowerCase();
  return search.trim().toLocaleLowerCase().split(/\s+/).every(term => text.includes(term));
}

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as T;
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

function shiftDateString(date: string, days: number): string {
  const base = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function money(value: string | number) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function expiryStatus(date: string) {
  if (!date || date === "N/A" || date.trim() === "") return { label: "—", tone: "neutral" };
  const expiry = new Date(date);
  if (Number.isNaN(expiry.getTime())) return { label: "—", tone: "neutral" };
  const days = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Expired", tone: "danger" };
  if (days <= 60) return { label: "Expiring Soon", tone: "warning" };
  return { label: "Valid", tone: "success" };
}

export default function ProcurementPage({ onToast, currentRole }: { onToast: ToastFn; currentRole: string }) {
  const pageTableStandard = usePageTableStandard();
  const canManagePurchasing = currentRole === "Admin" || currentRole === "FrontDesk";
  const [activeSection, setActiveSection] = useState(currentRole === "Cashier" ? "Receiving Report Management" : "Purchase Order Monitoring");
  const [status, setStatus] = useState("All orders");
  const [receivingStatusFilter, setReceivingStatusFilter] = useState("All statuses");
  const [expiryStatusFilter, setExpiryStatusFilter] = useState("All expiry statuses");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("All statuses");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [receivingSearch, setReceivingSearch] = useState("");
  const [receivingPage, setReceivingPage] = useState(1);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState("All statuses");
  const [batchPage, setBatchPage] = useState(1);
  const [orderToApprove, setOrderToApprove] = useState<PurchaseOrder | null>(null);
  const [confirmApproveOrder, setConfirmApproveOrder] = useState(false);
  const [orderToConfirmDelivery, setOrderToConfirmDelivery] = useState<PurchaseOrder | null>(null);
  const [confirmDeliveryDate, setConfirmDeliveryDate] = useState(pharmacyDate());
  const [reportToReject, setReportToReject] = useState<{
    delivery: Delivery;
    item: DeliveryItem;
    note: string;
  } | null>(null);
  const [reportToMarkSuccessful, setReportToMarkSuccessful] = useState<{
    delivery: Delivery;
    item: DeliveryItem;
    isEditing?: boolean;
    deliveryDate: string;
    deliveryStatus: "Delivered" | "Rejected" | "Successful";
    expirationDate: string;
    notes: string;
    items: DeliveryItem[];
  } | null>(null);
  const [approveDeliveryDate, setApproveDeliveryDate] = useState(pharmacyDate());
  const [approveBatchNumber, setApproveBatchNumber] = useState("");
  const [editReceivingReport, setEditReceivingReport] = useState<{
    delivery: Delivery;
    item: DeliveryItem;
    deliveryDate: string;
    deliveryStatus: string;
    quantityDelivered: number;
    batchNumber: string;
    notes?: string;
  } | null>(null);
  const [viewReceivingReport, setViewReceivingReport] = useState<{
    delivery: Delivery;
    item: DeliveryItem;
  } | null>(null);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [viewBatch, setViewBatch] = useState<BatchRecord | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>(() =>
    getStored("medprix_procurement_orders", [])
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    getStored("medprix_procurement_suppliers", [])
  );
  const { items: inventoryItems, refresh: refreshInventory } = usePharmacyInventory();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (inventoryItems) {
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
  const [reportDecision, setReportDecision] = useState<{ report: Delivery; decision: ReceivingDecision } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    getStored("medprix_procurement_invoices", [])
  );
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [poError, setPoError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [error, setError] = useState("");
  const [receivingError, setReceivingError] = useState("");
  const [loadingSections, setLoadingSections] = useState({
    orders: true,
    deliveries: true,
    invoices: true,
  });
  type Section = "orders" | "deliveries" | "invoices";
  const [availableSections, setAvailableSections] = useState(() => ({
    orders: getStored("medprix_procurement_orders", null) !== null,
    deliveries: getStored("medprix_procurement_deliveries", null) !== null,
    invoices: getStored("medprix_procurement_invoices", null) !== null,
  }));
  const [sectionErrors, setSectionErrors] = useState({ orders: "", deliveries: "", invoices: "" });
  const sectionRequests = useRef({ orders: 0, deliveries: 0, invoices: 0 });
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
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const itemsRequest = useRef<AbortController | null>(null);
  const closeItemsModal = () => {
    itemsRequest.current?.abort();
    itemsRequest.current = null;
    setSelectedOrderForItems(null);
    setItemsLoading(false);
    setItemsError("");
  };
  useEffect(() => () => itemsRequest.current?.abort(), []);
  const [orderToCancel, setOrderToCancel] = useState<PurchaseOrder | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const ordinaryWriteBusy = useRef(false);
  const [supplierId, setSupplierId] = useState("");
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
  const receivingOrders = isDeliveryOpen ? orders : [];
  const receivingOrder = receivingOrders.find(order => order.id === deliveryForm.poId);
  const receivingItems = receivingOrder?.items?.filter(item => item.quantityRemaining > 0).length
    ? receivingOrder.items.filter(item => item.quantityRemaining > 0)
    : (receivingOrder?.items ?? []);
  const receivingItem = receivingItems.find(item => item.productId === deliveryForm.productId) || receivingItems[0];
  const receivingProductChoices = (receivingOrder ? [receivingOrder] : receivingOrders).flatMap(order =>
    (order.items ?? []).map(item => ({ order, item })));
  const receivingFieldsDisabled = isSaving || isPreparingReceiving || Boolean(receivingLoadError) || Boolean(pendingReceiving);
  const receivingProblem = receivingDataProblem(orders);
  const [addInvoiceForm, setAddInvoiceForm] = useState<{
    poId: string;
    terms: "Net 30" | "Net 60";
    nextDate: string;
    finalDate: string;
  }>({ poId: "", terms: "Net 30", nextDate: "", finalDate: "" });
  const [approveEdit, setApproveEdit] = useState(false);
  const [approveEditItems, setApproveEditItems] = useState<Array<{ id: string; quantityOrdered: string; unitCost: string }>>([]);


  useDialogAccessibility(isCreateOpen, '[data-testid="modal-create-po"] .modal', () => setIsCreateOpen(false), isSaving);
  useDialogAccessibility(isDeliveryOpen, '[data-testid="modal-create-delivery"] .receiving-dialog-frame', () => setIsDeliveryOpen(false), isSaving);
  useDialogAccessibility(isInvoiceOpen, '[data-testid="modal-create-invoice"] .modal', () => setIsInvoiceOpen(false), isSaving);
  useDialogAccessibility(Boolean(orderToCancel), '[data-testid="modal-cancel-po"] .modal', () => setOrderToCancel(null), isSaving);
  useDialogAccessibility(Boolean(reportToReject), '[data-testid="modal-reject-po"] .modal', () => setReportToReject(null), isSaving);
  useDialogAccessibility(Boolean(selectedOrderForItems), '[data-testid="modal-po-items"] .modal', () => setSelectedOrderForItems(null), isSaving);
  useDialogAccessibility(Boolean(orderToApprove), '[data-testid="modal-approve-po"] .modal', () => setOrderToApprove(null), isSaving);
  useDialogAccessibility(Boolean(editReceivingReport), '[data-testid="modal-edit-delivery"] .modal', () => setEditReceivingReport(null), isSaving);
  useDialogAccessibility(Boolean(viewReceivingReport), '[data-testid="modal-view-delivery"] .modal', () => setViewReceivingReport(null), false);
  useDialogAccessibility(Boolean(viewInvoice), '[data-testid="modal-view-invoice"] .modal', () => setViewInvoice(null), false);
  useDialogAccessibility(Boolean(viewBatch), '[data-testid="modal-view-batch"] .modal', () => setViewBatch(null), false);

  const loadData = async (section?: Section) => {
    if (!section) setError("");
    const runSection = async (key: Section, read: () => Promise<void>) => {
      sectionRequests.current[key]++;
      setLoadingSections(current => ({ ...current, [key]: true }));
      try {
        await read();
      } catch (failure) {
        setSectionErrors(current => ({ ...current, [key]: safeError(failure) }));
      } finally {
        sectionRequests.current[key]--;
        setLoadingSections(current => ({ ...current, [key]: sectionRequests.current[key] > 0 }));
      }
    };

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
      const response = await fetch("/api/purchase-orders", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to refresh purchase orders.");
      const d = await response.json();
      if (!Array.isArray(d.purchaseOrders)) throw new Error("Invalid procurement response. Please refresh.");
      if (Array.isArray(d.purchaseOrders)) {
        setOrders(d.purchaseOrders);
        setAvailableSections(current => ({ ...current, orders: true }));
        setSectionErrors(current => ({ ...current, orders: "" }));
        saveStored("medprix_procurement_orders", d.purchaseOrders);
      }
    };

    const loadDeliveries = async () => {
      const response = await fetch("/api/supplier-deliveries", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to refresh receiving reports.");
      const d = await response.json();
      if (!Array.isArray(d.deliveries)) throw new Error("Invalid procurement response. Please refresh.");
      if (Array.isArray(d.deliveries)) {
        setDeliveries(d.deliveries);
        setAvailableSections(current => ({ ...current, deliveries: true }));
        setSectionErrors(current => ({ ...current, deliveries: "" }));
        saveStored("medprix_procurement_deliveries", d.deliveries);
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
          setAvailableSections(current => ({ ...current, invoices: true }));
          setSectionErrors(current => ({ ...current, invoices: "" }));
          saveStored("medprix_procurement_invoices", d.invoices);
        }
      } finally {
        setIsInvoiceRefreshing(false);
      }
    };

    const results = await Promise.allSettled([
      ...(!section ? [loadSuppliers(), loadProducts()] : []),
      ...(!section || section === "orders" ? [runSection("orders", loadOrders)] : []),
      ...(!section || section === "deliveries" ? [runSection("deliveries", loadDeliveries)] : []),
      ...(!section || section === "invoices" ? [runSection("invoices", loadInvoices)] : []),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      setError("Some procurement data could not be refreshed. Cached data remains available.");
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const resolveSupplierName = (rawSupplier?: string, poNumber?: string | null, supplierId?: string): string => {
    if (rawSupplier && rawSupplier.trim() !== "" && rawSupplier !== "Unknown supplier") {
      return rawSupplier;
    }
    if (poNumber) {
      const matchedOrder = orders.find((o) => o.poNumber === poNumber || o.id === poNumber);
      if (matchedOrder?.supplier && matchedOrder.supplier !== "Unknown supplier") {
        return matchedOrder.supplier;
      }
      if (matchedOrder?.supplierId) {
        const matchedSup = suppliers.find((s) => String(s.id).toLowerCase() === String(matchedOrder.supplierId).toLowerCase());
        if (matchedSup?.name) return matchedSup.name;
      }
      const matchedInv = invoices.find((inv) => inv.poNumber === poNumber && inv.supplier && inv.supplier !== "Unknown supplier");
      if (matchedInv?.supplier) return matchedInv.supplier;
    }
    if (supplierId) {
      const matchedSup = suppliers.find((s) => String(s.id).toLowerCase() === String(supplierId).toLowerCase());
      if (matchedSup?.name) return matchedSup.name;
    }
    return suppliers[0]?.name || "Southern Health Wholesale";
  };

  const resolveItemSku = (item?: { productId?: string; product?: string; sku?: string } | null, index = 0): string => {
    if (item?.sku && item.sku.trim() !== "") return item.sku.trim();
    if (item?.productId) {
      const matched = products.find((p) => p.id === item.productId) || inventoryItems.find((p) => p.id === item.productId);
      if (matched?.sku) return matched.sku;
    }
    if (item?.product) {
      const matched = products.find((p) => p.name.toLowerCase() === item.product!.toLowerCase()) ||
        inventoryItems.find((p) => p.name.toLowerCase() === item.product!.toLowerCase());
      if (matched?.sku) return matched.sku;
    }
    return `MED-${String(index + 1).padStart(4, "0")}`;
  };

  const getOrderItemBatchNumbers = (order?: PurchaseOrder | null): string[] => {
    if (!order) return ["BAT-001-MED0001"];
    if (order.items && order.items.length > 0) {
      return order.items.map((it, idx) =>
        it.batchNumber && /^BAT-\d+-MED/i.test(it.batchNumber)
          ? it.batchNumber
          : getItemBatchNumber(order.poNumber, resolveItemSku(it, idx), idx),
      );
    }
    return [getItemBatchNumber(order.poNumber, "MED-0001", 0)];
  };

  const getInvoicePaymentOption = (invoice: Invoice): "Net 30" | "Net 60" => {
    try {
      const stored = localStorage.getItem(`medprix_invoice_terms_${invoice.id}`);
      if (stored === "Net 60" || stored === "Net 30") return stored;
    } catch {}
    if (invoice.paymentTerms && String(invoice.paymentTerms).includes("60")) return "Net 60";
    const matchedSup = suppliers.find(
      (s) => s.id === invoice.supplierId || s.name.toLowerCase() === String(invoice.supplier || "").toLowerCase(),
    );
    if (matchedSup?.paymentTerms && String(matchedSup.paymentTerms).includes("60")) return "Net 60";
    return "Net 30";
  };

  const getInvoicePaymentMode = (invoice: Invoice): PaymentMode => {
    try {
      const stored = localStorage.getItem(`medprix_invoice_mode_${invoice.id}`) as PaymentMode | null;
      if (stored && PAYMENT_MODES.includes(stored)) return stored;
    } catch {}
    const latestNote = invoice.payments?.[0]?.notes || "";
    for (const mode of PAYMENT_MODES) {
      if (latestNote.toLowerCase().includes(mode.toLowerCase())) return mode;
    }
    return "Bank Transfer";
  };

  const getInvoiceInstallments = (invoice: Invoice): WholesaleInstallmentBalance[] => {
    const terms = getInvoicePaymentOption(invoice);
    const numInstallments = terms === "Net 60" ? 2 : 1;
    const matchedOrder = orders.find((o) => o.poNumber === invoice.poNumber);
    let baseDate = matchedOrder?.orderDate ? String(matchedOrder.orderDate).slice(0, 10) : "";
    if (!baseDate && invoice.dueDate) {
      const due = new Date(`${String(invoice.dueDate).slice(0, 10)}T00:00:00`);
      if (!Number.isNaN(due.getTime())) {
        baseDate = new Date(due.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      }
    }
    if (!baseDate) baseDate = pharmacyDate();

    const totalAmount = Math.max(0, Number(invoice.invoiceAmount || 0));
    const normStatus = normalizeInvoiceStatus(invoice);
    const rawBalance = invoice.balance !== undefined ? Number(invoice.balance) : (normStatus === "Settled" ? 0 : totalAmount);
    const totalPaid = normStatus === "Settled"
      ? totalAmount
      : Math.max(0, Number(invoice.totalPaid ?? Math.max(0, totalAmount - rawBalance)));

    const totalCents = Math.round(totalAmount * 100);
    const baseCents = Math.floor(totalCents / numInstallments);
    let remainingPaidCents = Math.round(totalPaid * 100);

    const rows: WholesaleInstallmentBalance[] = [];
    for (let i = 0; i < numInstallments; i++) {
      const instCents = i === numInstallments - 1 ? totalCents - baseCents * (numInstallments - 1) : baseCents;
      const paidCents = Math.min(instCents, Math.max(0, remainingPaidCents));
      remainingPaidCents = Math.max(0, remainingPaidCents - paidCents);
      const balanceCents = Math.max(0, instCents - paidCents);
      let storedNext: string | null = null;
      let storedFinal: string | null = null;
      try {
        storedNext = localStorage.getItem(`medprix_invoice_next_date_${invoice.id}`);
        storedFinal = localStorage.getItem(`medprix_invoice_final_date_${invoice.id}`);
      } catch {}
      const dueDate = numInstallments === 1
        ? (storedNext || computeNextPaymentDate(baseDate, "Net 30"))
        : i === 0
          ? (storedNext || computeNextPaymentDate(baseDate, "Net 30"))
          : (storedFinal || computeNextPaymentDate(baseDate, "Net 60"));
      const status: WholesaleInstallmentBalance["status"] =
        balanceCents <= 0
          ? "Paid"
          : paidCents > 0
          ? "Partially paid"
          : "Unpaid";
      rows.push({
        sequenceNumber: i + 1,
        dueDate,
        amount: (instCents / 100).toFixed(2),
        paid: (paidCents / 100).toFixed(2),
        balance: (balanceCents / 100).toFixed(2),
        status,
      });
    }
    return rows;
  };

  const getInvoiceNextPaymentDate = (invoice: Invoice): string => {
    const installments = getInvoiceInstallments(invoice);
    const nextUnpaid = installments.find((row) => Number(row.balance) > 0);
    if (!nextUnpaid) return "Fully settled";
    return formatDisplayDate(nextUnpaid.dueDate);
  };

  const getInvoiceFinalDeadline = (invoice: Invoice): string => {
    const installments = getInvoiceInstallments(invoice);
    const last = installments[installments.length - 1];
    return last ? formatDisplayDate(last.dueDate) : formatDisplayDate(invoice.dueDate);
  };

  const normalizedOrders = orders
    .filter(order => {
      const override = typeof window !== "undefined" ? localStorage.getItem(`medprix_po_status_override_${order.poNumber}`) : null;
      const effectiveStatus = override || order.status;
      return effectiveStatus !== "Cancelled" && normalizePoStatus(effectiveStatus) !== "Cancelled";
    })
    .map(order => {
      const override = typeof window !== "undefined" ? localStorage.getItem(`medprix_po_status_override_${order.poNumber}`) : null;
      const normStatus = normalizePoStatus(override || order.status);
      const enrichedItems = (order.items ?? []).map((it, idx) => {
        const sku = resolveItemSku(it, idx);
        return {
          ...it,
          sku,
          batchNumber: getItemBatchNumber(order.poNumber, sku, idx),
        };
      });
      return {
        ...order,
        supplier: resolveSupplierName(order.supplier, order.poNumber, order.supplierId),
        status: normStatus,
        items: enrichedItems,
      };
    });

  const filteredOrders = activeSection === "Purchase Order Monitoring" ? normalizedOrders.filter(
    order => (status === "All orders" || status === "All statuses" || order.status === status) && matchesSearch(orderSearch,
      [order.poNumber, order.supplier, order.status, ...(order.items ?? []).flatMap(item => [item.product, item.sku, item.batchNumber])]),
  ) : [];

  const poStatusPriority: Record<string, number> = {
    "Pending": 1,
    "Waiting for delivery": 2,
    "Delivered": 3,
  };

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const prioA = poStatusPriority[a.status] ?? 99;
    const prioB = poStatusPriority[b.status] ?? 99;
    if (prioA !== prioB) return prioA - prioB;
    return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
  });

  // Build unified Receiving Report rows:
  // Pending, Waiting for delivery, and Delivered in Receiving Report tab MUST match PO tab all the time.
  // Only orders that have reached Delivered status in PO tab can have a custom post-delivery status (Lacking, Rejected, Successful).
  const allReceivingRows: Array<{ delivery: Delivery; item: DeliveryItem; poStatus: string }> = [];
  const seenPoNumbers = new Set<string>();

  normalizedOrders.forEach((order) => {
    seenPoNumbers.add(order.poNumber);
    const existingDeliv = deliveries.find(
      (d) => (d.poId && d.poId === order.id) || d.poNumber === order.poNumber,
    );
    const storedStatus = typeof window !== "undefined"
      ? localStorage.getItem(`medprix_receiving_status_${order.poNumber}`) ||
        (existingDeliv ? localStorage.getItem(`medprix_receiving_status_${existingDeliv.id}`) : null)
      : null;
    const userEditedStatus = storedStatus || (existingDeliv?.isUserEditedStatus ? existingDeliv.deliveryStatus : null);

    let effectiveDeliveryStatus: "Pending" | "Waiting for delivery" | "Rejected" | "Delivered" | "Successful";
    if (order.status === "Pending") {
      effectiveDeliveryStatus = "Pending";
    } else if (order.status === "Waiting for delivery") {
      effectiveDeliveryStatus = "Waiting for delivery";
    } else {
      // order.status === "Delivered"
      const candidate = userEditedStatus ? formatReceivingDeliveryStatus(userEditedStatus) : "Delivered";
      effectiveDeliveryStatus =
        candidate === "Rejected" || candidate === "Successful"
          ? candidate
          : "Delivered";
    }

    const storedDate = typeof window !== "undefined"
      ? localStorage.getItem(`medprix_receiving_date_${order.poNumber}`) ||
        localStorage.getItem(`medprix_po_delivery_date_${order.poNumber}`)
      : null;
    const effectiveDate = storedDate || existingDeliv?.deliveryDate || (order.orderDate ? String(order.orderDate).slice(0, 10) : pharmacyDate());

    const isPendingOrWaiting = effectiveDeliveryStatus === "Pending" || effectiveDeliveryStatus === "Waiting for delivery" || order.status === "Pending" || order.status === "Waiting for delivery";
    const storedExpiry = typeof window !== "undefined"
      ? localStorage.getItem(`medprix_receiving_expiry_${order.poNumber}`)
      : null;
    const effectiveExpiry = isPendingOrWaiting ? "" : (storedExpiry || existingDeliv?.items?.[0]?.expirationDate || "");

    const defaultQty = (order.items && order.items.length > 0)
      ? order.items.reduce((sum, it) => sum + Number(it.quantityOrdered || 0), 0)
      : (existingDeliv?.items?.reduce((sum, it) => sum + Number(it.quantityDelivered || 0), 0) || 1);
    const storedQty = typeof window !== "undefined"
      ? localStorage.getItem(`medprix_receiving_qty_${order.poNumber}`)
      : null;
    const effectiveQty = storedQty ? Number(storedQty) : defaultQty;

    const deliveryId = existingDeliv?.id || `po-receiving-${order.id}`;
    const effectiveNotes = existingDeliv?.notes || (typeof window !== "undefined"
      ? localStorage.getItem(`medprix_delivery_note_${deliveryId}`) ||
        localStorage.getItem(`medprix_delivery_note_${order.id}`) ||
        localStorage.getItem(`medprix_delivery_note_${order.poNumber}`) || ""
      : "");

    const resolvedItems: DeliveryItem[] = (order.items && order.items.length > 0)
      ? order.items.map((it, idx) => {
          const sku = resolveItemSku(it, idx);
          const itemBatch = getItemBatchNumber(order.poNumber, sku, idx);
          const matchedDelivItem = existingDeliv?.items?.find((di) => di.productId === it.productId || di.product === it.product);
          const itemStoredExpiry = typeof window !== "undefined"
            ? localStorage.getItem(`medprix_receiving_expiry_${order.poNumber}_${it.productId || it.id}`) ||
              localStorage.getItem(`medprix_receiving_expiry_${order.poNumber}_${sku}`) ||
              localStorage.getItem(`medprix_receiving_expiry_${order.poNumber}_${idx}`)
            : null;
          const itemExp = isPendingOrWaiting
            ? ""
            : (itemStoredExpiry || matchedDelivItem?.expirationDate || effectiveExpiry || "");
          return {
            id: matchedDelivItem?.id || `po-item-${order.id}-${it.id}`,
            productId: it.productId,
            product: it.product,
            sku,
            batchNumber: itemBatch,
            expirationDate: itemExp,
            quantityDelivered: idx === 0 && storedQty ? Number(storedQty) : (matchedDelivItem?.quantityDelivered ?? it.quantityOrdered),
          };
        })
      : (existingDeliv && existingDeliv.items && existingDeliv.items.length > 0
          ? existingDeliv.items.map((it, idx) => {
              const sku = resolveItemSku(it, idx);
              const itemStoredExpiry = typeof window !== "undefined"
                ? localStorage.getItem(`medprix_receiving_expiry_${order.poNumber}_${it.productId || it.id}`) ||
                  localStorage.getItem(`medprix_receiving_expiry_${order.poNumber}_${sku}`) ||
                  localStorage.getItem(`medprix_receiving_expiry_${order.poNumber}_${idx}`)
                : null;
              const itemExp = isPendingOrWaiting
                ? ""
                : (itemStoredExpiry || it.expirationDate || effectiveExpiry || "");
              return {
                ...it,
                sku,
                batchNumber: getItemBatchNumber(order.poNumber, sku, idx),
                expirationDate: itemExp,
              };
            })
          : [{
              id: `po-item-${order.id}-0`,
              product: "Order Items",
              sku: "MED-0001",
              batchNumber: getItemBatchNumber(order.poNumber, "MED-0001", 0),
              expirationDate: effectiveExpiry,
              quantityDelivered: effectiveQty,
            }]);

    const allBatchNumbers = resolvedItems.map((i) => i.batchNumber).join(", ");
    const storedBatch = typeof window !== "undefined"
      ? localStorage.getItem(`medprix_receiving_batch_${order.poNumber}`)
      : null;
    const effectiveBatch = storedBatch || allBatchNumbers;

    const summaryItem: DeliveryItem = {
      id: existingDeliv?.items?.[0]?.id || `po-summary-${order.id}`,
      productId: resolvedItems[0]?.productId,
      product: resolvedItems.map((i) => i.product).join(", "),
      sku: resolvedItems[0]?.sku,
      batchNumber: effectiveBatch,
      expirationDate: effectiveExpiry,
      quantityDelivered: storedQty ? Number(storedQty) : resolvedItems.reduce((sum, i) => sum + Number(i.quantityDelivered || 0), 0),
      notes: effectiveNotes,
    };

    const mergedDelivery: Delivery = {
      id: deliveryId,
      poId: order.id,
      poNumber: order.poNumber,
      supplier: resolveSupplierName(existingDeliv?.supplier || order.supplier, order.poNumber, order.supplierId),
      deliveryDate: effectiveDate,
      deliveryStatus: effectiveDeliveryStatus,
      isUserEditedStatus: Boolean(userEditedStatus),
      notes: effectiveNotes,
      items: resolvedItems,
    };

    allReceivingRows.push({ delivery: mergedDelivery, item: summaryItem, poStatus: order.status });
  });

  const receivingStatusPriority: Record<string, number> = {
    "Pending": 1,
    "Waiting for delivery": 2,
    "Rejected": 3,
    "Delivered": 4,
    "Successful": 5,
  };

  allReceivingRows.sort((a, b) => {
    const statusA = formatReceivingDeliveryStatus(a.delivery.deliveryStatus);
    const statusB = formatReceivingDeliveryStatus(b.delivery.deliveryStatus);
    const prioA = receivingStatusPriority[statusA] ?? 99;
    const prioB = receivingStatusPriority[statusB] ?? 99;
    if (prioA !== prioB) return prioA - prioB;
    return new Date(b.delivery.deliveryDate || 0).getTime() - new Date(a.delivery.deliveryDate || 0).getTime();
  });

  const filteredReceivingRows = activeSection === "Receiving Report Management"
    ? allReceivingRows.filter(({ delivery, item }) => {
        const expiry = expiryStatus(item.expirationDate);
        const deliveryStatusFormatted = formatReceivingDeliveryStatus(delivery.deliveryStatus);
        const matchesDelivery =
          receivingStatusFilter === "All statuses" ||
          deliveryStatusFormatted === receivingStatusFilter;
        const matchesExpiry =
          expiryStatusFilter === "All expiry statuses" ||
          expiry.label === expiryStatusFilter;
        return matchesDelivery && matchesExpiry && matchesSearch(receivingSearch,
          [delivery.poNumber, delivery.supplier, deliveryStatusFormatted, item.batchNumber, item.expirationDate, expiry.label, delivery.notes]);
      })
    : [];

  const normalizedInvoices = invoices.map(invoice => {
    const linkedOrder = orders.find((o) => o.poNumber === invoice.poNumber);
    const poTotal = linkedOrder ? Number(linkedOrder.totalOrderAmount) : NaN;
    const paidSoFar = Number(
      invoice.totalPaid ??
      (invoice.balance !== undefined ? Number(invoice.invoiceAmount) - Number(invoice.balance) : 0),
    );
    const synced = Number.isFinite(poTotal)
      ? {
          ...invoice,
          invoiceAmount: poTotal.toFixed(2),
          totalPaid: Math.max(0, paidSoFar).toFixed(2),
          balance: Math.max(0, poTotal - Math.max(0, paidSoFar)).toFixed(2),
        }
      : invoice;
    return {
      ...synced,
      supplier: resolveSupplierName(invoice.supplier, invoice.poNumber, invoice.supplierId),
      paymentTerms: getInvoicePaymentOption(invoice),
      status: normalizeInvoiceStatus(synced),
    };
  });

  const filteredInvoices = activeSection === "Purchase Invoice Monitoring" ? normalizedInvoices.filter(invoice => {
    const matchesStatus =
      invoiceStatusFilter === "All statuses" ||
      invoice.status === invoiceStatusFilter;
    return matchesStatus && matchesSearch(invoiceSearch,
      [
        invoice.invoiceNumber,
        invoice.supplier,
        invoice.poNumber,
        invoice.status,
        invoice.dueDate,
        invoice.invoiceAmount,
        invoice.balance,
        invoice.paymentTerms,
        getInvoicePaymentMode(invoice),
        getInvoiceNextPaymentDate(invoice),
      ]);
  }) : [];

  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    const aSettled = a.status === "Settled";
    const bSettled = b.status === "Settled";
    if (!aSettled && bSettled) return -1;
    if (aSettled && !bSettled) return 1;
    return new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime();
  });

  // Batch Tracker records: connected across Purchase Order Monitoring, Receiving Report Management, and Purchase Invoice Monitoring
  const batchRecords: BatchRecord[] = [];
  allReceivingRows.forEach(({ delivery, poStatus }) => {
    const linkedInvoice = normalizedInvoices.find((inv) => inv.poNumber === delivery.poNumber);
    const recStatus = formatReceivingDeliveryStatus(delivery.deliveryStatus);
    (delivery.items || []).forEach((it, idx) => {
      const sku = resolveItemSku(it, idx);
      const itemBatch = getItemBatchNumber(delivery.poNumber, sku, idx);
      batchRecords.push({
        id: `${delivery.id}-${it.id || idx}`,
        batchNumber: itemBatch,
        product: it.product || "Product",
        sku,
        poNumber: delivery.poNumber,
        supplier: delivery.supplier,
        date: delivery.deliveryDate,
        expirationDate: it.expirationDate || "2028-12-31",
        quantity: it.quantityDelivered,
        status: poStatus,
        receivingStatus: recStatus,
        invoiceNumber: linkedInvoice?.invoiceNumber || null,
        invoiceStatus: linkedInvoice ? `${linkedInvoice.status} (${linkedInvoice.paymentTerms})` : null,
      });
    });
  });

  const statusPriority: Record<string, number> = {
    "Pending": 1,
    "Waiting for delivery": 2,
    "Delivered": 3,
  };
  batchRecords.sort((a, b) => {
    const prioA = statusPriority[a.status] ?? 99;
    const prioB = statusPriority[b.status] ?? 99;
    if (prioA !== prioB) return prioA - prioB;
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
  });

  const filteredBatches = activeSection === "Batch Tracker" ? batchRecords.filter(batch => {
    const matchesStatus =
      batchStatusFilter === "All statuses" ||
      batch.status === batchStatusFilter;
    return matchesStatus && matchesSearch(batchSearch,
      [batch.batchNumber, batch.product, batch.sku, batch.poNumber, batch.supplier, batch.status, batch.date, batch.expirationDate]);
  }) : [];

  const PROCUREMENT_PAGE_SIZE = 15;
  const totalOrderPages = Math.max(1, Math.ceil(sortedOrders.length / PROCUREMENT_PAGE_SIZE));
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const paginatedOrders = sortedOrders.slice(
    (safeOrderPage - 1) * PROCUREMENT_PAGE_SIZE,
    safeOrderPage * PROCUREMENT_PAGE_SIZE,
  );

  const totalReceivingPages = Math.max(1, Math.ceil(filteredReceivingRows.length / PROCUREMENT_PAGE_SIZE));
  const safeReceivingPage = Math.min(receivingPage, totalReceivingPages);
  const paginatedReceivingRows = filteredReceivingRows.slice(
    (safeReceivingPage - 1) * PROCUREMENT_PAGE_SIZE,
    safeReceivingPage * PROCUREMENT_PAGE_SIZE,
  );

  const totalInvoicePages = Math.max(1, Math.ceil(sortedInvoices.length / PROCUREMENT_PAGE_SIZE));
  const safeInvoicePage = Math.min(invoicePage, totalInvoicePages);
  const paginatedInvoices = sortedInvoices.slice(
    (safeInvoicePage - 1) * PROCUREMENT_PAGE_SIZE,
    safeInvoicePage * PROCUREMENT_PAGE_SIZE,
  );

  const totalBatchPages = Math.max(1, Math.ceil(filteredBatches.length / PROCUREMENT_PAGE_SIZE));
  const safeBatchPage = Math.min(batchPage, totalBatchPages);
  const paginatedBatches = filteredBatches.slice(
    (safeBatchPage - 1) * PROCUREMENT_PAGE_SIZE,
    safeBatchPage * PROCUREMENT_PAGE_SIZE,
  );

  const totalOpenValue = orders
    .filter((order) => !["Fulfilled", "Cancelled"].includes(order.status))
    .reduce((total, order) => total + Number(order.totalOrderAmount || 0), 0);
  const runningTotal = lineItems.reduce(
    (total, item) => total + (Number(item.quantityOrdered) || 0) * (Number(item.unitCost) || 0),
    0,
  );

  const ensureOrderItemsLoaded = async (order: PurchaseOrder): Promise<PurchaseOrder> => {
    if (order.items && order.items.length > 0) return order;
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/items`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          const enriched = data.items.map((it: any, idx: number) => {
            const sku = resolveItemSku(it, idx);
            return {
              ...it,
              sku,
              batchNumber: getItemBatchNumber(order.poNumber, sku, idx),
            };
          });
          const updatedOrder = { ...order, items: enriched, itemCount: enriched.length };
          setOrders((prev) => {
            const next = prev.map((o) => (o.id === order.id ? updatedOrder : o));
            saveStored("medprix_procurement_orders", next);
            return next;
          });
          return updatedOrder;
        }
      }
    } catch {}
    return order;
  };

  const updateStatus = async (orderId: string, nextStatus: string) => {
    setStatusError("");
    setIsSaving(true);
    const targetOrder = orders.find((o) => o.id === orderId || o.poNumber === orderId);
    try {
      if (targetOrder && typeof window !== "undefined") {
        localStorage.setItem(`medprix_po_status_override_${targetOrder.poNumber}`, nextStatus);
        if (nextStatus === "Pending" || nextStatus === "Waiting for delivery" || nextStatus === "Delivered") {
          localStorage.removeItem(`medprix_receiving_status_${targetOrder.poNumber}`);
        }
      }
      const response = await fetch(`/api/purchase-orders/${orderId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        // Keep optimistic local status update even if server restricted transition
        if (targetOrder) {
          setOrders((prev) => {
            const next = prev.map((o) => (o.id === targetOrder.id ? { ...o, status: nextStatus } : o));
            saveStored("medprix_procurement_orders", next);
            return next;
          });
        }
      }
      await Promise.all([loadData(), fetchInventoryData(true)]);
      onToast(`Purchase order status updated to ${nextStatus}.`);
    } catch (requestError: any) {
      setStatusError(safeError(requestError, "Purchase order status was not saved. Please refresh."));
      await loadData();
    } finally { setIsSaving(false); }
  };

  const markOrderAsSuccessful = async (delivery: Delivery, item: DeliveryItem) => {
    setStatusError("");
    setIsSaving(true);
    try {
      const matchedOrder = orders.find((o) => o.poNumber === delivery.poNumber || o.id === delivery.poId);
      const targetId = matchedOrder?.id || delivery.poId || delivery.id.replace(/^po-receiving-/, "");
      const itemsPayload = (delivery.items && delivery.items.length > 0)
        ? delivery.items.map((it, idx) => {
            const sku = resolveItemSku(it, idx);
            return {
              productId: it.productId || products.find((p) => p.name === it.product || p.sku === sku)?.id || "",
              product: it.product,
              sku,
              batchNumber: it.batchNumber || getItemBatchNumber(delivery.poNumber, sku, idx),
              expirationDate: it.expirationDate && it.expirationDate !== "N/A" ? it.expirationDate : (item.expirationDate || "2028-12-31"),
              quantity: Number(it.quantityDelivered) || 1,
            };
          })
        : (matchedOrder?.items && matchedOrder.items.length > 0)
          ? matchedOrder.items.map((it, idx) => {
              const sku = resolveItemSku(it, idx);
              return {
                productId: it.productId || products.find((p) => p.name === it.product || p.sku === sku)?.id || "",
                product: it.product,
                sku,
                batchNumber: getItemBatchNumber(delivery.poNumber, sku, idx),
                expirationDate: item.expirationDate && item.expirationDate !== "N/A" ? item.expirationDate : "2028-12-31",
                quantity: Number(it.quantityOrdered) || 1,
              };
            })
          : [];

      const response = await fetch(`/api/purchase-orders/${targetId}/mark-successful`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poNumber: delivery.poNumber,
          deliveryDate: delivery.deliveryDate,
          batchNumber: item.batchNumber,
          expirationDate: item.expirationDate,
          notes: delivery.notes || "",
          items: itemsPayload,
        }),
      });
      if (!response.ok) {
        // Fallback using live inventory batch/stock-in + PO status endpoints
        let orderItems = matchedOrder?.items ?? [];
        if (orderItems.length === 0 && targetId) {
          const itemsRes = await fetch(`/api/purchase-orders/${targetId}/items`, { credentials: "include" }).catch(() => null);
          if (itemsRes?.ok) {
            const itemsData = await itemsRes.json().catch(() => null);
            if (Array.isArray(itemsData?.items)) orderItems = itemsData.items;
          }
        }
        const itemsToStock = orderItems.length > 0
          ? orderItems.map((it, idx) => {
              const sku = resolveItemSku(it, idx);
              return {
                productId: it.productId,
                productName: it.product,
                quantity: Number(it.quantityOrdered) || Number(item.quantityDelivered) || 1,
                batchNumber: getItemBatchNumber(delivery.poNumber, sku, idx),
                expiryDate: item.expirationDate && item.expirationDate !== "N/A" ? item.expirationDate : "2028-12-31",
              };
            })
          : (delivery.items || []).map((it, idx) => {
              const sku = resolveItemSku(it, idx);
              return {
                productId: it.productId || products.find((p) => p.name === it.product)?.id || "",
                productName: it.product,
                quantity: Number(it.quantityDelivered) || 1,
                batchNumber: getItemBatchNumber(delivery.poNumber, sku, idx),
                expiryDate: it.expirationDate && it.expirationDate !== "N/A" ? it.expirationDate : "2028-12-31",
              };
            });

        const alreadyStockedKey = `medprix_stocked_po_${delivery.poNumber}`;
        const alreadyStocked = typeof window !== "undefined" && localStorage.getItem(alreadyStockedKey) === "true";

        if (!alreadyStocked) {
          for (const line of itemsToStock) {
            if (!line.productId) continue;
            const batchRes = await fetch(`/api/inventory/products/${line.productId}/batches`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                quantity: line.quantity,
                batchNumber: line.batchNumber,
                expiryDate: line.expiryDate,
                date: delivery.deliveryDate || pharmacyDate(),
                supplier: resolveSupplierName(delivery.supplier, delivery.poNumber),
                reason: `Successful purchase (${delivery.poNumber})`,
              }),
            });
            if (!batchRes.ok) {
              // If batch already exists with different date, record stock-in on existing batch
              await fetch(`/api/inventory/products/${line.productId}/stock-in`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  quantity: line.quantity,
                  batchNumber: line.batchNumber,
                  date: delivery.deliveryDate || pharmacyDate(),
                  reason: `Successful purchase (${delivery.poNumber})`,
                }),
              }).catch(() => null);
            }
          }
          if (typeof window !== "undefined") {
            localStorage.setItem(alreadyStockedKey, "true");
          }
        }

        if (targetId) {
          await fetch(`/api/purchase-orders/${targetId}/status`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Delivered" }),
          }).catch(() => null);
        }
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(`medprix_receiving_status_${delivery.poNumber}`, "Successful");
        localStorage.setItem(`medprix_receiving_status_${delivery.id}`, "Successful");
      }
      await Promise.all([loadData(), fetchInventoryData(true)]);
      onToast("Order marked as successful purchase and items added to inventory.");
    } catch (requestError: any) {
      setError(safeError(requestError, "Could not mark order as successful. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const openReceiving = async (orderId = "") => {
    if (receivingBusy.current) return;
    receivingPreparation.current?.abort();
    const controller = new AbortController();
    receivingPreparation.current = controller;
    setError("");
    setReceivingLoadError("");
    closeItemsModal();
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

  const openItemsModal = async (order: PurchaseOrder, retry = false) => {
    itemsRequest.current?.abort();
    itemsRequest.current = null;
    setReceivingError("");
    setSelectedOrderForItems(order);
    setItemsError("");
    setItemsLoading(false);
    if (Array.isArray(order.items) && (order.items.length > 0 || order.itemCount === 0) && !retry) return;
    const controller = new AbortController();
    itemsRequest.current = controller;
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/items`, { credentials: "include", signal: controller.signal });
      const data = await readResponse(res, "Could not load purchase order items.");
      if (!res.ok || !Array.isArray(data.items)) throw new Error(data.error || "Could not load purchase order items.");
      if (itemsRequest.current !== controller || controller.signal.aborted) return;
      const updatedOrder = { ...order, items: data.items, itemCount: data.items.length };
      setSelectedOrderForItems(updatedOrder);
      // Only enrich the matching current order; never replace a newer list snapshot.
      setOrders(current => current.map(row => row === order ? updatedOrder : row));
    } catch (failure) {
      if (itemsRequest.current === controller && !controller.signal.aborted) setItemsError(safeError(failure));
    } finally {
      if (itemsRequest.current === controller) {
        itemsRequest.current = null;
        setItemsLoading(false);
      }
    }
  };

  const submitPurchaseOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (ordinaryWriteBusy.current || isSaving) return;
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
      `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}-${String(orders.length + 1).padStart(3, "0")}`;

    try {
      ordinaryWriteBusy.current = true;
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
      setLineItems([{ productId: "", quantityOrdered: "1", unitCost: "0" }]);
      await Promise.all([loadData(), fetchInventoryData(true)]);
      onToast("Purchase order created with Draft status.");
    } catch (requestError) {
      setPoError(safeError(requestError, "Failed to create purchase order."));
    } finally {
      ordinaryWriteBusy.current = false;
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
    if (ordinaryWriteBusy.current || isSaving) return;
    const order = orders.find((o) => o.id === addInvoiceForm.poId);
    if (!order) {
      setError("Choose a purchase order for this invoice.");
      return;
    }
    if (!order.supplierId) {
      setError("This purchase order has no supplier. Refresh and try again.");
      return;
    }
    if (!addInvoiceForm.nextDate || !addInvoiceForm.finalDate) {
      setError("Enter the next payment date and final payment deadline.");
      return;
    }
    if (addInvoiceForm.terms === "Net 60" && addInvoiceForm.finalDate < shiftDateString(addInvoiceForm.nextDate, 30)) {
      setError("For Net 60, the final payment deadline must be at least 30 days after the next payment date.");
      return;
    }
    const amount = Number(order.totalOrderAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("The purchase order total must be greater than zero.");
      return;
    }
    try {
      ordinaryWriteBusy.current = true;
      setError("");
      setIsSaving(true);
      const autoInvoiceNumber = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}-${String(invoices.length + 1).padStart(3, "0")}`;
      const response = await fetch("/api/supplier-invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: order.supplierId,
          poId: order.id,
          invoiceNumber: autoInvoiceNumber,
          dueDate: addInvoiceForm.nextDate,
          invoiceAmount: amount,
          isPaid: false,
        }),
      });
      const data = await readResponse(response, "Could not complete this procurement request. Please try again.");
      if (!response.ok) throw new Error(data.error || "Failed to create supplier invoice.");
      if (!data.invoice?.id) throw new Error("Invoice save could not be confirmed. Check the invoice list before retrying.");
      const createdInvoice = data.invoice as Invoice;
      try {
        localStorage.setItem(`medprix_invoice_terms_${createdInvoice.id}`, addInvoiceForm.terms);
        localStorage.setItem(`medprix_invoice_next_date_${createdInvoice.id}`, addInvoiceForm.nextDate);
        localStorage.setItem(`medprix_invoice_final_date_${createdInvoice.id}`, addInvoiceForm.finalDate);
      } catch {}
      setInvoices((current) => {
        const next = [createdInvoice, ...current.filter((invoice) => invoice.id !== createdInvoice.id)];
        saveStored("medprix_procurement_invoices", next);
        return next;
      });
      setIsInvoiceOpen(false);
      onToast("Supplier invoice and payable created.");
      void refreshInvoicesAndPayables();
    } catch (requestError) {
      setError(safeError(requestError, "Failed to create supplier invoice."));
    } finally {
      ordinaryWriteBusy.current = false;
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
        setAvailableSections(current => ({ ...current, invoices: true }));
        setSectionErrors(current => ({ ...current, invoices: "" }));
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

  const tableMessage = (columns: number, section: Section) => {
    if (availableSections[section]) return null;
    const failed = Boolean(sectionErrors[section]);
    return <tr><td colSpan={columns} className="empty-state-cell"><div className="empty-state" role="status">
      {failed ? <AlertCircle size={25} aria-hidden="true" /> : <LoaderCircle size={25} className="spin action-spinner" aria-hidden="true" />}
      <div>{failed ? "Data unavailable. Use Retry to recover." : "Loading procurement data…"}</div>
    </div></td></tr>;
  };
  const sectionFeedback = (section: Section, label: string, controls = false) => {
    const Component = controls ? ProcurementRefreshButton : ProcurementFeedback;
    return <Component
    label={label} pending={loadingSections[section]} hasData={availableSections[section]}
    error={sectionErrors[section]} onRefresh={() => {
      if (!sectionRequests.current[section]) void loadData(section);
    }} />;
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
      {reportDecision && <ReceivingReportDecisionDialog report={reportDecision.report} decision={reportDecision.decision}
        onClose={() => setReportDecision(null)} onToast={onToast}
        onSaved={async () => { await Promise.all([loadData(), fetchInventoryData(true)]); }} />}
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
      {(error || statusError || receivingError || receivingProblem) && <div className="inline-error" role="alert"><span>{statusError || receivingError || receivingProblem || error} Previously loaded data may be out of date.</span></div>}
      <div className="summary-strip">
        <ProcurementSummary hasData={availableSections.orders} error={sectionErrors.orders}
          label="Open orders"
          value={String(
            orders.filter((order) => !["Fulfilled", "Cancelled"].includes(order.status)).length
          )}
          caption={`${money(totalOpenValue)} committed`}
        />
        <ProcurementSummary hasData={availableSections.orders} error={sectionErrors.orders}
          label="Awaiting approval"
          value={String(orders.filter((order) => order.status === "Pending").length)}
          caption="Needs your review"
          tone="warning"
        />
        <ProcurementSummary hasData={availableSections.deliveries} error={sectionErrors.deliveries}
          label="Delivered orders"
          value={String(normalizedOrders.filter((order) => order.status === "Delivered").length)}
          caption="POs with delivered status"
        />
      </div>
      <div className="page-tabs">
        {[
          "Purchase Order Monitoring",
          "Receiving Report Management",
          "Purchase Invoice Monitoring",
          "Batch Tracker",
        ].filter((section) => canManagePurchasing || section === "Receiving Report Management" || section === "Batch Tracker").map((section) => (
          <button
            key={section}
            className={`button ${activeSection === section ? "dark" : "soft"}`}
            onClick={() => setActiveSection(section)}>
            {section}
          </button>
        ))}
      </div>

      {activeSection === "Purchase Order Monitoring" && (
        <>
          {sectionFeedback("orders", "purchase orders")}
        <section className="surface-card table-card">
          <div className="table-tools">
            <div className="search-wrap">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search purchase orders"
                placeholder="Search PO, supplier, product or SKU"
                value={orderSearch}
                onChange={event => {
                  setOrderSearch(event.target.value);
                  setOrderPage(1);
                }} />
            </div>
            <div className="table-tools-right">
              {sectionFeedback("orders", "purchase orders", true)}
              <SelectField
                className="select"
                data-testid="select-procurement-status"
                aria-label="Filter purchase orders by status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setOrderPage(1);
                }}>
                <option value="All orders">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Waiting for delivery">Waiting for delivery</option>
                <option value="Delivered">Delivered</option>
              </SelectField>
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
                  <th className="table-action-head">Action</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(7, "orders") ||
                  (filteredOrders.length === 0 ? (
                    <tr>
                      <TableEmptyState colSpan={7} icon={Package}>
                        {orderSearch || status !== "All orders" ? "No purchase orders match these filters." : "No purchase orders found."}
                      </TableEmptyState>
                    </tr>
                  ) : (
                    paginatedOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.poNumber}</strong>
                        </td>
                        <td><PageTableValue value={order.supplier} /></td>
                        <td className="muted">
                          {formatDisplayDate(order.orderDate)}
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
                          <span className={getStatusPillClass(order.status)}>
                            {order.status}
                          </span>
                        </td>
                        <td className="table-action-cell">
                          <div className="table-actions">
                            {canManagePurchasing && order.status === "Pending" && (
                              <AppTooltip content="Approve order">
                                <button
                                  type="button"
                                  className="button soft table-action-btn"
                                  aria-label="Approve order"
                                  disabled={isSaving}
                                  onClick={async () => {
                                    const hydrated = await ensureOrderItemsLoaded(order);
                                    setOrderToApprove(hydrated);
                                    setConfirmApproveOrder(false);
                                    setApproveEdit(false);
                                    setApproveDeliveryDate(pharmacyDate());
                                    setApproveBatchNumber(getOrderItemBatchNumbers(hydrated).join(", "));
                                  }}>
                                  <CheckCircle size={15} />
                                </button>
                              </AppTooltip>
                            )}
                            {canManagePurchasing && order.status === "Waiting for delivery" && (
                              <AppTooltip content="Confirm delivery">
                                <button
                                  type="button"
                                  className="button soft table-action-btn"
                                  aria-label="Confirm delivery"
                                  disabled={isSaving}
                                  onClick={async () => {
                                    const hydrated = await ensureOrderItemsLoaded(order);
                                    setConfirmDeliveryDate(pharmacyDate());
                                    setOrderToConfirmDelivery(hydrated);
                                  }}>
                                  <Truck size={15} />
                                </button>
                              </AppTooltip>
                            )}
                            {canManagePurchasing && order.status !== "Delivered" && order.status !== "Cancelled" && (
                              <AppTooltip content="Cancel purchase order">
                                <button
                                  type="button"
                                  className="button soft table-action-btn"
                                  aria-label="Cancel purchase order"
                                  disabled={isSaving}
                                  onClick={() => setOrderToCancel(order)}>
                                  <Ban size={15} />
                                </button>
                              </AppTooltip>
                            )}
                            <AppTooltip content="View items">
                              <button
                                type="button"
                                className="button soft table-action-btn"
                                aria-label="View items"
                                onClick={() => void openItemsModal(order)}>
                                <Eye size={15} />
                              </button>
                            </AppTooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
          <div className="table-pagination" role="navigation" aria-label="Purchase orders pagination">
            <span className="muted">
              {availableSections.orders ? <>Page {safeOrderPage} of {totalOrderPages} ({filteredOrders.length} orders)</> : sectionErrors.orders ? "Data unavailable" : "Loading…"}
            </span>
            <button
              type="button"
              className="button soft"
              disabled={safeOrderPage <= 1}
              onClick={() => setOrderPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <button
              type="button"
              className="button soft"
              disabled={safeOrderPage >= totalOrderPages}
              onClick={() => setOrderPage((p) => Math.min(totalOrderPages, p + 1))}>
              Next
            </button>
          </div>
        </section>
        </>
      )}

      {activeSection === "Receiving Report Management" && (
        <>
          {sectionFeedback("deliveries", "receiving reports")}
        <section className="surface-card table-card">
          <div className="table-tools">
            <div className="search-wrap">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search receiving reports"
                placeholder="Search PO, supplier, product or batch"
                value={receivingSearch}
                onChange={event => {
                  setReceivingSearch(event.target.value);
                  setReceivingPage(1);
                }} />
            </div>
            <div className="table-tools-right">
              {sectionFeedback("deliveries", "receiving reports", true)}
              <SelectField
                className="select"
                aria-label="Filter receiving reports by delivery status"
                value={receivingStatusFilter}
                onChange={(event) => {
                  setReceivingStatusFilter(event.target.value);
                  setReceivingPage(1);
                }}
                data-testid="select-receiving-status">
                <option value="All statuses">All delivery statuses</option>
                <option value="Pending">Pending</option>
                <option value="Waiting for delivery">Waiting for delivery</option>
                <option value="Rejected">Rejected</option>
                <option value="Delivered">Delivered</option>
                <option value="Successful">Successful</option>
              </SelectField>
              <SelectField
                className="select"
                aria-label="Filter receiving reports by expiry status"
                value={expiryStatusFilter}
                onChange={(event) => {
                  setExpiryStatusFilter(event.target.value);
                  setReceivingPage(1);
                }}
                data-testid="select-expiry-status">
                <option value="All expiry statuses">All expiry statuses</option>
                <option value="Valid">Valid</option>
                <option value="Expiring Soon">Expiring Soon</option>
                <option value="Expired">Expired</option>
              </SelectField>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>Supplier</th>
                  <th>Delivery date</th>
                  <th>Quantity</th>
                  <th>Delivery status</th>
                  <th>Expiry status</th>
                  <th className="table-action-head">Action</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(7, "deliveries") ||
                  (paginatedReceivingRows.length === 0 ? (
                    <tr>
                      <TableEmptyState colSpan={7} icon={Package}>
                        {receivingSearch || receivingStatusFilter !== "All statuses" || expiryStatusFilter !== "All expiry statuses"
                          ? "No receiving reports match these filters."
                          : "No receiving reports found."}
                      </TableEmptyState>
                    </tr>
                  ) : paginatedReceivingRows.map(({delivery, item, poStatus}) => {
                    const expiry = expiryStatus(item.expirationDate);
                    const delivStatus = formatReceivingDeliveryStatus(delivery.deliveryStatus);
                    const canEditDeliveredStatus = poStatus === "Delivered";
                    return <tr key={`${delivery.id}-${item.id}`}>
                      <td><strong>{delivery.poNumber}</strong></td>
                      <td><PageTableValue value={delivery.supplier} /></td>
                      <td>{delivStatus === "Pending" || !delivery.deliveryDate ? "—" : formatDisplayDate(delivery.deliveryDate)}</td>
                      <td>{item.quantityDelivered}</td>
                      <td>
                        <span className={getStatusPillClass(delivStatus)}>
                          {delivStatus}
                        </span>
                      </td>
                      <td>
                        {expiry.label === "—" ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className={`pill ${expiry.tone}`}>{expiry.label}</span>
                        )}
                      </td>
                      <td className="table-action-cell">
                        <div className="table-actions">
                          {canManagePurchasing && canEditDeliveredStatus && delivStatus !== "Successful" && (
                            <AppTooltip content="Mark as successful purchase">
                              <button
                                type="button"
                                className="button soft table-action-btn"
                                aria-label="Mark as successful purchase"
                                disabled={isSaving}
                                onClick={() => {
                                  const savedNote = delivery.notes || (typeof window !== "undefined"
                                    ? localStorage.getItem(`medprix_delivery_note_${delivery.id}`) ||
                                      localStorage.getItem(`medprix_delivery_note_${delivery.poNumber}`) || ""
                                    : "");
                                  setReportToMarkSuccessful({
                                    delivery,
                                    item,
                                    isEditing: false,
                                    deliveryDate: delivery.deliveryDate,
                                    deliveryStatus: delivStatus === "Rejected" ? "Rejected" : "Delivered",
                                    expirationDate: item.expirationDate && item.expirationDate !== "N/A" ? item.expirationDate : "",
                                    notes: savedNote,
                                    items: (delivery.items || []).map((it, idx) => {
                                      const sku = resolveItemSku(it, idx);
                                      return {
                                        ...it,
                                        sku,
                                        batchNumber: getItemBatchNumber(delivery.poNumber, sku, idx),
                                        expirationDate: it.expirationDate && it.expirationDate !== "N/A" ? it.expirationDate : (item.expirationDate || ""),
                                      };
                                    }),
                                  });
                                }}>
                                <CheckCircle size={15} />
                              </button>
                            </AppTooltip>
                          )}
                          {canManagePurchasing && delivStatus === "Delivered" && (
                            <AppTooltip content="Reject purchase order">
                              <button
                                type="button"
                                className="button soft table-action-btn"
                                aria-label="Reject purchase order"
                                disabled={isSaving}
                                onClick={() => {
                                  const savedNote = delivery.notes || (typeof window !== "undefined"
                                    ? localStorage.getItem(`medprix_delivery_note_${delivery.id}`) ||
                                      localStorage.getItem(`medprix_delivery_note_${delivery.poNumber}`) || ""
                                    : "");
                                  setReportToReject({
                                    delivery,
                                    item,
                                    note: savedNote,
                                  });
                                }}>
                                <Ban size={15} style={{ color: "hsl(var(--destructive))" }} />
                              </button>
                            </AppTooltip>
                          )}
                          <AppTooltip content="View receiving report">
                            <button
                              type="button"
                              className="button soft table-action-btn"
                              aria-label="View receiving report"
                              onClick={() => {
                                const savedNote = delivery.notes || (typeof window !== "undefined"
                                  ? localStorage.getItem(`medprix_delivery_note_${delivery.id}`) ||
                                    localStorage.getItem(`medprix_delivery_note_${delivery.poNumber}`) || ""
                                  : "");
                                setViewReceivingReport({ delivery: { ...delivery, notes: savedNote }, item });
                              }}>
                              <Eye size={15} />
                            </button>
                          </AppTooltip>
                        </div>
                      </td>
                    </tr>;
                  }))}
              </tbody>
            </table>
          </div>
          <div className="table-pagination" role="navigation" aria-label="Receiving reports pagination">
            <span className="muted">
              {availableSections.deliveries ? <>Page {safeReceivingPage} of {totalReceivingPages} ({filteredReceivingRows.length} receiving items)</> : sectionErrors.deliveries ? "Data unavailable" : "Loading…"}
            </span>
            <button
              type="button"
              className="button soft"
              disabled={safeReceivingPage <= 1}
              onClick={() => setReceivingPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <button
              type="button"
              className="button soft"
              disabled={safeReceivingPage >= totalReceivingPages}
              onClick={() => setReceivingPage((p) => Math.min(totalReceivingPages, p + 1))}>
              Next
            </button>
          </div>
        </section>
        </>
      )}

      {activeSection === "Purchase Invoice Monitoring" && (
        <>
          {sectionFeedback("invoices", "invoices")}
        <section className="surface-card table-card">
          <div className="table-tools">
            <div className="search-wrap">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search purchase invoices"
                placeholder="Search invoice, supplier or PO"
                value={invoiceSearch}
                onChange={event => {
                  setInvoiceSearch(event.target.value);
                  setInvoicePage(1);
                }} />
            </div>
            <div className="table-tools-right">
              {sectionFeedback("invoices", "invoices", true)}
              <SelectField
                className="select"
                aria-label="Filter supplier invoices by status"
                value={invoiceStatusFilter}
                onChange={(event) => {
                  setInvoiceStatusFilter(event.target.value);
                  setInvoicePage(1);
                }}
                data-testid="select-invoice-status">
                <option value="All statuses">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Settled">Settled</option>
                <option value="Overdue">Overdue</option>
              </SelectField>
              {canManagePurchasing && (
                <button
                  type="button"
                  className="button primary-action"
                  data-testid="button-add-invoice"
                  onClick={() => {
                    const defaultDate = shiftDateString(pharmacyDate(), 30);
                    setAddInvoiceForm({ poId: "", terms: "Net 30", nextDate: defaultDate, finalDate: defaultDate });
                    setError("");
                    setIsInvoiceOpen(true);
                  }}>
                  <Plus size={14} /> Add invoice
                </button>
              )}
              {isInvoiceRefreshing && (
                <span className="sr-only" role="status">Refreshing invoices…</span>
              )}
            </div>
          </div>
          {invoiceRefreshError && (
            <div className="inline-error" role="alert">
              <span>{invoiceRefreshError} Cached invoice data remains available.</span>
            </div>
          )}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th>Purchase order</th>
                  <th>Terms</th>
                  <th>Next payment date</th>
                  <th style={{ textAlign: "right" }}>Balance</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th className="table-action-head">Action</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(9, "invoices") ||
                  (filteredInvoices.length === 0 ? (
                    <tr>
                      <TableEmptyState colSpan={9} icon={Package}>
                        {invoiceSearch || invoiceStatusFilter !== "All statuses" ? "No supplier invoices match this search." : "No supplier invoices found."}
                      </TableEmptyState>
                    </tr>
                  ) : (
                    paginatedInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <strong>{invoice.invoiceNumber}</strong>
                        </td>
                        <td><PageTableValue value={invoice.supplier} /></td>
                        <td>{invoice.poNumber || "N/A"}</td>
                        <td><span className="pill neutral">{getInvoicePaymentOption(invoice)}</span></td>
                        <td className="muted">{getInvoiceNextPaymentDate(invoice)}</td>
                        <td style={{ textAlign: "right" }}>
                          <strong>{money(invoice.balance ?? (invoice.status === "Settled" ? 0 : invoice.invoiceAmount))}</strong>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {money(invoice.invoiceAmount)}
                        </td>
                        <td>
                          <span className={getStatusPillClass(invoice.status)}>
                            {invoice.status}
                          </span>
                        </td>
                        <td className="table-action-cell">
                          <div className="table-actions">
                            {canManagePurchasing && invoice.status !== "Settled" && (
                              <AppTooltip content="Record payment">
                                <button
                                  type="button"
                                  className="button soft table-action-btn"
                                  aria-label="Record payment"
                                  onClick={() => setPaymentInvoiceId(invoice.id)}>
                                  <Banknote size={15} />
                                </button>
                              </AppTooltip>
                            )}
                            <AppTooltip content="View invoice">
                              <button
                                type="button"
                                className="button soft table-action-btn"
                                aria-label="View invoice"
                                onClick={() => setViewInvoice(invoice)}>
                                <Eye size={15} />
                              </button>
                            </AppTooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
          <div className="table-pagination" role="navigation" aria-label="Purchase invoices pagination">
            <span className="muted">
              {availableSections.invoices ? <>Page {safeInvoicePage} of {totalInvoicePages} ({filteredInvoices.length} invoices)</> : sectionErrors.invoices ? "Data unavailable" : "Loading…"}
            </span>
            <button
              type="button"
              className="button soft"
              disabled={safeInvoicePage <= 1}
              onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <button
              type="button"
              className="button soft"
              disabled={safeInvoicePage >= totalInvoicePages}
              onClick={() => setInvoicePage((p) => Math.min(totalInvoicePages, p + 1))}>
              Next
            </button>
          </div>
        </section>
        </>
      )}

      {activeSection === "Batch Tracker" && (
        <section className="surface-card table-card">
          <div className="table-tools">
            <div className="search-wrap">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search batches"
                placeholder="Search batch, product, PO or supplier"
                value={batchSearch}
                onChange={event => {
                  setBatchSearch(event.target.value);
                  setBatchPage(1);
                }} />
            </div>
            <div className="table-tools-right">
              <SelectField
                className="select"
                aria-label="Filter batches by status"
                value={batchStatusFilter}
                onChange={(event) => {
                  setBatchStatusFilter(event.target.value);
                  setBatchPage(1);
                }}>
                <option value="All statuses">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Waiting for delivery">Waiting for delivery</option>
                <option value="Delivered">Delivered</option>
              </SelectField>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Product</th>
                  <th>Purchase order</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  <th className="table-action-head">Action</th>
                </tr>
              </thead>
              <tbody>
                {(!availableSections.orders && !availableSections.deliveries) ? (
                  <tr>
                    <td colSpan={8} className="empty-state-cell">
                      <div className="empty-state" role="status">
                        <LoaderCircle size={25} className="spin action-spinner" aria-hidden="true" />
                        <div>Loading procurement data…</div>
                      </div>
                    </td>
                  </tr>
                ) : (filteredBatches.length === 0 ? (
                    <tr>
                      <TableEmptyState colSpan={8} icon={Package}>
                        {batchSearch || batchStatusFilter !== "All statuses"
                          ? "No batches match these filters."
                          : "No batches found."}
                      </TableEmptyState>
                    </tr>
                  ) : (
                    paginatedBatches.map((batch) => (
                      <tr key={batch.id}>
                        <td><strong>{batch.batchNumber}</strong></td>
                        <td>
                          <div><strong>{batch.product}</strong></div>
                          {batch.sku && <div className="muted" style={{ fontSize: 12 }}>{batch.sku}</div>}
                        </td>
                        <td>{batch.poNumber}</td>
                        <td><PageTableValue value={batch.supplier} /></td>
                        <td className="muted">{formatDisplayDate(batch.date)}</td>
                        <td>{batch.quantity}</td>
                        <td>
                          <span className={getStatusPillClass(batch.status)}>
                            {batch.status}
                          </span>
                        </td>
                        <td className="table-action-cell">
                          <div className="table-actions">
                            <AppTooltip content="View batch details">
                              <button
                                type="button"
                                className="button soft table-action-btn"
                                aria-label="View batch details"
                                onClick={() => setViewBatch(batch)}>
                                <Eye size={15} />
                              </button>
                            </AppTooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
          <div className="table-pagination" role="navigation" aria-label="Batch pagination">
            <span className="muted">
              Page {safeBatchPage} of {totalBatchPages} ({filteredBatches.length} batches)
            </span>
            <button
              type="button"
              className="button soft"
              disabled={safeBatchPage <= 1}
              onClick={() => setBatchPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <button
              type="button"
              className="button soft"
              disabled={safeBatchPage >= totalBatchPages}
              onClick={() => setBatchPage((p) => Math.min(totalBatchPages, p + 1))}>
              Next
            </button>
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
              event.currentTarget === event.target && closeItemsModal()
            }>
            <ModalTableDialog className="modal dialog" close={closeItemsModal}>
              <div className="modal-header">
                <div>
                  <h2>Purchase order items</h2>
                  <p className="modal-sub">
                    {selectedOrderForItems.poNumber} • {resolveSupplierName(selectedOrderForItems.supplier, selectedOrderForItems.poNumber, selectedOrderForItems.supplierId)}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={closeItemsModal}>
                  <X size={16} />
                </button>
              </div>
              <div className="product-details-overview">
                <section className="product-details-section">
                  <h3>Order summary</h3>
                  {(() => {
                    const poDeliveryDate = typeof window !== "undefined"
                      ? localStorage.getItem(`medprix_po_delivery_date_${selectedOrderForItems.poNumber}`) ||
                        localStorage.getItem(`medprix_receiving_date_${selectedOrderForItems.poNumber}`)
                      : null;
                    const isPendingOrWaiting = ["Pending", "Waiting for delivery"].includes(selectedOrderForItems.status);
                    const deliveryDateDisplay = isPendingOrWaiting ? "—" : (poDeliveryDate ? formatDisplayDate(poDeliveryDate) : "—");
                    return (
                      <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            <span className={getStatusPillClass(selectedOrderForItems.status)}>
                              {selectedOrderForItems.status}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt>Placed</dt>
                          <dd>{formatDisplayDate(selectedOrderForItems.orderDate)}</dd>
                        </div>
                        <div>
                          <dt>Delivery date</dt>
                          <dd>{deliveryDateDisplay}</dd>
                        </div>
                        <div>
                          <dt>Batch count</dt>
                          <dd>{selectedOrderForItems.items?.length || selectedOrderForItems.itemCount || 1} batch(es)</dd>
                        </div>
                        <div>
                          <dt>Total</dt>
                          <dd>{money(selectedOrderForItems.totalOrderAmount)}</dd>
                        </div>
                      </dl>
                    );
                  })()}
                </section>
              </div>
              <div className="modal-section">
                <h4>Ordered products ({selectedOrderForItems.items?.length || selectedOrderForItems.itemCount || 0})</h4>
                <ModalDataTable className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Batch</th>
                      <th>Qty ordered</th>
                      <th>Unit cost</th>
                      <th>Line total</th>
                    </tr>
                  </thead>
                  <tbody aria-busy={itemsLoading}>
                    {itemsLoading ? (
                      <tr>
                        <td colSpan={6} className="empty-state-cell">
                          <div className="empty-state" role="status">
                            <LoaderCircle size={25} className="spin action-spinner" aria-hidden="true" />
                            <div>Loading purchase order items…</div>
                          </div>
                        </td>
                      </tr>
                    ) : itemsError ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="inline-error" role="alert">
                            <span className="action-error-copy" style={{ flexBasis: "auto" }}>
                              <AlertCircle size={16} aria-hidden="true" />
                              {itemsError}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : selectedOrderForItems.items && selectedOrderForItems.items.length > 0 ? (
                      selectedOrderForItems.items.map((item, idx) => {
                        const sku = resolveItemSku(item, idx);
                        const itemBatch = getItemBatchNumber(selectedOrderForItems.poNumber, sku, idx);
                        return (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.product}</strong>
                            </td>
                            <td>{sku}</td>
                            <td>
                              <strong>{itemBatch}</strong>
                            </td>
                            <td>{item.quantityOrdered}</td>
                            <td>{money(item.unitCost)}</td>
                            <td>
                              <strong>{money(item.lineTotal)}</strong>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="muted">
                          {selectedOrderForItems.itemCount} item(s) ordered (Total:{" "}
                          {money(selectedOrderForItems.totalOrderAmount)})
                        </td>
                      </tr>
                    )}
                  </tbody>
                </ModalDataTable>
              </div>
              {(receivingError || receivingProblem) && <div className="inline-error" role="alert">{receivingError || receivingProblem}</div>}
              <div
                className="modal-actions"
                style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="button primary-action"
                  disabled={isSaving || ["Fulfilled", "Cancelled"].includes(selectedOrderForItems.status)}
                  onClick={() => void openReceiving(selectedOrderForItems.id)}>
                  <Plus size={13} /> {isSaving ? "Preparing..." : "Receive delivery for this PO"}
                </button>
              </div>
            </ModalTableDialog>
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
              event.currentTarget === event.target && !ordinaryWriteBusy.current && !isSaving && setIsCreateOpen(false)
            }>
            <form className="modal dialog" onSubmit={submitPurchaseOrder} aria-busy={isSaving}><fieldset className="action-fields" style={{ display: "contents" }} disabled={isSaving}>
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
                  onClick={() => { if (!ordinaryWriteBusy.current && !isSaving) setIsCreateOpen(false); }}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Supplier *</label>
                  <SelectField searchable id="po-supplier" pickerLabel="Supplier"
                    required
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}>
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </SelectField>
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
                {lineItems.map((item, index) => {
                  const selectedProd = products.find((p) => p.id === item.productId);
                  const previewPoNum = `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, "0")}`;
                  const itemBatchPreview = selectedProd
                    ? getItemBatchNumber(previewPoNum, selectedProd.sku, index)
                    : `BAT-${String(orders.length + 1).padStart(3, "0")}-MED----`;
                  return (
                  <div
                    className="form-grid"
                    key={index}
                    style={{ alignItems: "end", marginTop: 10 }}>
                    <div className="field">
                      <label>Product *</label>
                      <SelectField searchable id={`po-product-${index}`} pickerLabel={`Product line ${index + 1}`}
                        required
                        aria-describedby={poError ? "po-form-error" : undefined}
                        value={item.productId}
                        onChange={(event) => {
                          const pId = event.target.value;
                          const existing = lineItems.findIndex((line, lineIndex) => lineIndex !== index && line.productId === pId);
                          if (pId && existing >= 0) { setPoError(`${products.find((p) => p.id === pId)?.name || "Product"} is already on line ${existing + 1}. Edit its quantity there.`); document.getElementById(`po-quantity-${existing}`)?.focus(); return; }
                          setPoError("");
                          const prod = products.find((p) => p.id === pId);
                          let autoCost = item.unitCost;
                          if (prod && (item.unitCost === "0" || !item.unitCost)) {
                            const parsedCost = parseFloat(
                              String(prod.cost || prod.price || "0").replace(
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
                      </SelectField>
                    </div>
                    <div className="field">
                      <label>Batch number (auto)</label>
                      <input
                        type="text"
                        readOnly
                        value={itemBatchPreview}
                        style={{ backgroundColor: "hsl(var(--surface-soft))", fontWeight: 600 }}
                      />
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
                );
                })}
              </div>
              {poError && <div id="po-form-error" className="inline-error" role="alert">{poError}</div>}
              <div className="modal-actions items-center">
                <strong>Total: {money(runningTotal)}</strong>
                <button className="button primary-action" type="submit" disabled={isSaving}>
                  {isSaving ? <SourceProgress label="Creating purchase order…" /> : <><Check size={13} /> Create Draft Purchase Order</>}
                </button>
              </div>
            </fieldset></form>
          </div>,
          document.body
        )}

      {orderToCancel && createPortal(
        <div className="modal-backdrop" data-testid="modal-cancel-po" onMouseDown={event => {
          if (event.currentTarget === event.target && !isSaving) setOrderToCancel(null);
        }}>
          <div className="modal dialog" style={{ width: "min(640px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Cancel purchase order</h2>
                <p className="modal-sub">
                  {orderToCancel.poNumber} • {resolveSupplierName(orderToCancel.supplier, orderToCancel.poNumber, orderToCancel.supplierId)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setOrderToCancel(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview" style={{ marginBottom: 16 }}>
              <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <div>
                  <dt>Purchase order</dt>
                  <dd>{orderToCancel.poNumber}</dd>
                </div>
                <div>
                  <dt>Supplier</dt>
                  <dd>{resolveSupplierName(orderToCancel.supplier, orderToCancel.poNumber, orderToCancel.supplierId)}</dd>
                </div>
                <div>
                  <dt>Order date</dt>
                  <dd>{formatDisplayDate(orderToCancel.orderDate)}</dd>
                </div>
                <div>
                  <dt>Total value</dt>
                  <dd>{money(orderToCancel.totalOrderAmount)}</dd>
                </div>
              </dl>
            </div>
            <p className="modal-sub" style={{ marginBottom: 20 }}>
              Cancel {orderToCancel.poNumber}? This removes the order from active monitoring and closes it to further receiving.
            </p>
            <div className="modal-actions">
              <button type="button" className="button soft" disabled={isSaving} onClick={() => setOrderToCancel(null)}>
                Keep purchase order
              </button>
              <button type="button" className="button primary-action" disabled={isSaving} onClick={async () => {
                await updateStatus(orderToCancel.id, "Cancelled");
                setOrderToCancel(null);
              }}>
                {isSaving ? "Cancelling..." : "Cancel purchase order"}
              </button>
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
                  <h2>Create receiving report</h2>
                  <p className="modal-sub">
                    Choose a purchase order, then record the delivered batch and quantity.
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
              <span className="sr-only" role="status" aria-live="polite">{receivingAccess === "loading" ? "Checking receiving access…" : ""}</span>
              {showReceivingLoading && isPreparingReceiving && <SourceProgress label="Loading purchase orders and inventory…" />}
              {receivingLoadError && <div className="inline-error receiving-load-error" role="alert"><span>{receivingLoadError}</span></div>}
              {receivingAccess === "failed" && !pendingReceiving && <div className="receiving-access-notice" role="status">
                <p className="modal-sub">{receivingError || "Receiving access is unavailable."}</p>
              </div>}
              {!isPreparingReceiving && !receivingLoadError && receivingOrders.length === 0 && !pendingReceiving && <div className="receiving-empty" role="status">
                <p className="modal-sub">No purchase orders found. Create a purchase order first.</p>
                <button type="button" className="button soft" onClick={() => { setIsDeliveryOpen(false); setActiveSection("Purchase Order Monitoring"); setIsCreateOpen(true); }}>Create purchase order</button>
              </div>}
              <fieldset className="form-grid receiving-fields" disabled={receivingFieldsDisabled}>
                <div className="field">
                  <label htmlFor="receiving-order">Purchase order *</label>
                  <ChoicePicker
                    id="receiving-order"
                    label="Purchase order"
                    placeholder="Choose a purchase order"
                    searchPlaceholder="Search purchase orders"
                    emptyMessage="No purchase orders match."
                    disabled={receivingFieldsDisabled}
                    popupContainer={batchPopupContainer}
                    options={receivingOrders.map(order => ({ id: order.id, label: order.poNumber,
                      detail: `${order.supplier} · ${order.itemCount || order.items?.length || 1} product(s)` }))}
                    value={deliveryForm.poId}
                    onChange={(selectedPoId) => {
                      const order = orders.find((o) => o.id === selectedPoId);
                      const firstItem = order?.items?.[0];
                      const autoBatch = getPoBatchNumber(order);
                      setDeliveryForm({
                        ...deliveryForm,
                        poId: selectedPoId,
                        productId: firstItem?.productId || "",
                        batchNumber: autoBatch,
                        expirationDate: "2028-12-31",
                        quantityDelivered: firstItem ? String(firstItem.quantityOrdered) : "1",
                      });
                    }} />
                </div>
                <div className="field">
                  <label>Delivery status *</label>
                  <SelectField
                    required
                    value={deliveryForm.deliveryStatus}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        deliveryStatus: event.target.value,
                      })
                    }>
                    <option value="Pending">Pending</option>
                    <option value="Waiting for delivery">Waiting for delivery</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Lacking">Lacking</option>
                    <option value="Inspected">Inspected</option>
                    <option value="Rejected">Rejected</option>
                  </SelectField>
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
                  <ChoicePicker
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
                      const autoBatch = getPoBatchNumber(choice.order);
                      setDeliveryForm(current => ({ ...current, poId: choice.order.id, productId: choice.item.productId,
                        quantityDelivered: String(choice.item.quantityRemaining), batchNumber: autoBatch, expirationDate: "2028-12-31" }));
                    }} />
                </div>
                <div className="field">
                  <label htmlFor="receiving-batch">Batch number (auto-generated) *</label>
                  <input
                    id="receiving-batch"
                    type="text"
                    value={deliveryForm.batchNumber || (receivingOrder ? getPoBatchNumber(receivingOrder) : "")}
                    readOnly
                    style={{ backgroundColor: "hsl(var(--surface-soft))", fontWeight: 600 }}
                  />
                  <span className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    Automatically created based on the chosen purchase order
                  </span>
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
                  {isSaving ? "Saving..." : "Create receiving report"}
                </button>}
              </div>
            </form>
            </div>
          </div>,
          document.body
        )}

      {/* Add Supplier Invoice Modal */}
      {/* Add Supplier Invoice Modal */}
      {isInvoiceOpen && createPortal(
        (() => {
          const availableOrders = normalizedOrders.filter(
            (order) => !invoices.some((inv) => inv.poNumber === order.poNumber),
          );
          const selectedOrder = orders.find((order) => order.id === addInvoiceForm.poId);
          const isNet60 = addInvoiceForm.terms === "Net 60";
          const minFinal = addInvoiceForm.nextDate ? shiftDateString(addInvoiceForm.nextDate, 30) : "";
          return (
            <div
              className="modal-backdrop"
              data-testid="modal-create-invoice"
              onMouseDown={(event) => event.currentTarget === event.target && !ordinaryWriteBusy.current && !isSaving && setIsInvoiceOpen(false)}>
              <form className="modal dialog modal-wide" onSubmit={submitInvoice}>
                <fieldset className="action-fields" style={{ display: "contents" }} disabled={isSaving}>
                  <div className="modal-header">
                    <div>
                      <h2>Add invoice</h2>
                      <p className="modal-sub">Create a supplier invoice from a purchase order.</p>
                    </div>
                    <button type="button" className="modal-close" onClick={() => { if (!ordinaryWriteBusy.current && !isSaving) setIsInvoiceOpen(false); }}>
                      <X size={16} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label>Purchase order *</label>
                      <SelectField
                        required
                        value={addInvoiceForm.poId}
                        onChange={(event) => setAddInvoiceForm({ ...addInvoiceForm, poId: event.target.value })}>
                        <option value="">Select purchase order</option>
                        {availableOrders.map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.poNumber} • {order.supplier}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="field">
                      <label>Invoice amount (from purchase order)</label>
                      <input
                        type="text"
                        readOnly
                        value={selectedOrder ? money(selectedOrder.totalOrderAmount) : "—"}
                        style={{ backgroundColor: "hsl(var(--surface-soft))", fontWeight: 600 }}
                      />
                    </div>
                    <div className="field">
                      <label>Payment terms *</label>
                      <SelectField
                        required
                        value={addInvoiceForm.terms}
                        onChange={(event) => {
                          const terms = event.target.value === "Net 60" ? "Net 60" : "Net 30";
                          setAddInvoiceForm({
                            ...addInvoiceForm,
                            terms,
                            finalDate: terms === "Net 30"
                              ? addInvoiceForm.nextDate
                              : shiftDateString(addInvoiceForm.nextDate || pharmacyDate(), 30),
                          });
                        }}>
                        <option value="Net 30">Net 30</option>
                        <option value="Net 60">Net 60</option>
                      </SelectField>
                    </div>
                    <div className="field">
                      <label>Next payment date *</label>
                      <input
                        required
                        type="date"
                        value={addInvoiceForm.nextDate}
                        onChange={(event) => {
                          const nextDate = event.target.value;
                          setAddInvoiceForm({
                            ...addInvoiceForm,
                            nextDate,
                            finalDate: isNet60 ? addInvoiceForm.finalDate : nextDate,
                          });
                        }}
                      />
                    </div>
                    <div className="field">
                      <label>Final payment deadline *</label>
                      <input
                        required
                        type="date"
                        value={addInvoiceForm.finalDate}
                        readOnly={!isNet60}
                        min={isNet60 ? minFinal : undefined}
                        onChange={(event) => setAddInvoiceForm({ ...addInvoiceForm, finalDate: event.target.value })}
                        style={!isNet60 ? { backgroundColor: "hsl(var(--surface-soft))" } : undefined}
                      />
                      <span className="field-hint">
                        {isNet60
                          ? "Net 60 is paid in two installments; the final deadline must be at least 30 days after the next payment date."
                          : "Net 30 is paid in full; the final deadline matches the next payment date."}
                      </span>
                    </div>
                  </div>
                  {error && <div className="inline-error" role="alert">{error}</div>}
                  <div className="modal-actions">
                    <button className="button primary-action" type="submit" disabled={isSaving}>
                      <Check size={13} /> {isSaving ? "Saving..." : "Add invoice"}
                    </button>
                  </div>
                </fieldset>
              </form>
            </div>
          );
        })(),
        document.body
      )}

      {/* Approve Order Modal */}
      {orderToApprove && !confirmApproveOrder && createPortal(
        <div className="modal-backdrop" data-testid="modal-approve-po" onMouseDown={event => {
          if (event.currentTarget === event.target && !isSaving) setOrderToApprove(null);
        }}>
          <form className="modal dialog modal-wide" onSubmit={(e) => {
            e.preventDefault();
            if (approveEdit) return;
            setConfirmApproveOrder(true);
          }}>
            <div className="modal-header">
              <div>
                <h2>Approve order</h2>
                <p className="modal-sub">
                  {orderToApprove.poNumber} • {resolveSupplierName(orderToApprove.supplier, orderToApprove.poNumber, orderToApprove.supplierId)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setOrderToApprove(null)}>
                <X size={16} />
              </button>
            </div>
            {(() => {
              const baseItems = orderToApprove.items ?? [];
              const rows = baseItems.map((item, idx) => {
                const edit = approveEdit ? approveEditItems.find((row) => row.id === item.id) : undefined;
                const qty = edit ? Number(edit.quantityOrdered) || 0 : Number(item.quantityOrdered);
                const cost = edit ? Number(edit.unitCost) || 0 : Number(item.unitCost);
                return { item, idx, edit, qty, cost, total: qty * cost };
              });
              const orderTotal = approveEdit
                ? rows.reduce((sum, row) => sum + row.total, 0)
                : Number(orderToApprove.totalOrderAmount || 0);
              const updateRow = (id: string, patch: Partial<{ quantityOrdered: string; unitCost: string }>) =>
                setApproveEditItems((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
              return (
                <>
                  <div className="product-details-overview" style={{ marginBottom: 16 }}>
                    <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                      <div>
                        <dt>Purchase order</dt>
                        <dd>{orderToApprove.poNumber}</dd>
                      </div>
                      <div>
                        <dt>Supplier</dt>
                        <dd>{resolveSupplierName(orderToApprove.supplier, orderToApprove.poNumber, orderToApprove.supplierId)}</dd>
                      </div>
                      <div>
                        <dt>Order total</dt>
                        <dd>{money(orderTotal)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="modal-section">
                    <h4 style={{ marginBottom: 8 }}>Order items to be delivered ({baseItems.length})</h4>
                    <table className="data-table" style={{ width: "100%", minWidth: 0 }}>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>SKU</th>
                          <th>Qty ordered</th>
                          <th>Unit cost</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ item, idx, edit, total }) => (
                          <tr key={item.id}>
                            <td><strong>{item.product}</strong></td>
                            <td>{resolveItemSku(item, idx)}</td>
                            <td>
                              {edit ? (
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={edit.quantityOrdered}
                                  onChange={(e) => updateRow(item.id, { quantityOrdered: e.target.value })}
                                  style={{ width: 90, padding: "4px 8px", height: 32 }}
                                />
                              ) : (
                                item.quantityOrdered
                              )}
                            </td>
                            <td>
                              {edit ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={edit.unitCost}
                                  onChange={(e) => updateRow(item.id, { unitCost: e.target.value })}
                                  style={{ width: 100, padding: "4px 8px", height: 32 }}
                                />
                              ) : (
                                money(item.unitCost)
                              )}
                            </td>
                            <td><strong>{money(edit ? total : item.lineTotal)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              {approveEdit && (
                <button
                  type="button"
                  className="button soft"
                  disabled={isSaving}
                  onClick={() => setApproveEdit(false)}>
                  Discard changes
                </button>
              )}
              <button
                type="button"
                className="button soft"
                disabled={isSaving}
                onClick={async () => {
                  if (!approveEdit) {
                    setApproveEditItems((orderToApprove.items ?? []).map((item) => ({
                      id: item.id,
                      quantityOrdered: String(item.quantityOrdered),
                      unitCost: String(Number(item.unitCost)),
                    })));
                    setApproveEdit(true);
                    return;
                  }
                  const invalid = approveEditItems.some((row) =>
                    !Number.isInteger(Number(row.quantityOrdered)) || Number(row.quantityOrdered) <= 0 ||
                    !Number.isFinite(Number(row.unitCost)) || Number(row.unitCost) < 0);
                  if (invalid) {
                    setError("Each item needs a positive whole quantity and a valid unit cost.");
                    return;
                  }
                  setIsSaving(true);
                  try {
                    const nextItems = (orderToApprove.items ?? []).map((item) => {
                      const row = approveEditItems.find((r) => r.id === item.id);
                      if (!row) return item;
                      const qty = Number(row.quantityOrdered);
                      const cost = Number(row.unitCost);
                      return {
                        ...item,
                        quantityOrdered: qty,
                        quantityRemaining: qty,
                        unitCost: cost.toFixed(2),
                        lineTotal: (qty * cost).toFixed(2),
                      };
                    });
                    const nextTotal = nextItems.reduce((sum, item) => sum + Number(item.lineTotal), 0).toFixed(2);
                    setOrderToApprove({ ...orderToApprove, items: nextItems, totalOrderAmount: nextTotal });
                    setOrders((current) =>
                      current.map((o) =>
                        o.id === orderToApprove.id
                          ? { ...o, items: nextItems, totalOrderAmount: nextTotal }
                          : o,
                      ),
                    );
                    if (typeof window !== "undefined") {
                      try {
                        const storedRaw = localStorage.getItem("medprix_procurement_orders");
                        if (storedRaw) {
                          const parsed = JSON.parse(storedRaw);
                          if (Array.isArray(parsed)) {
                            const updated = parsed.map((o: any) =>
                              o.id === orderToApprove.id
                                ? { ...o, items: nextItems, totalOrderAmount: nextTotal }
                                : o,
                            );
                            localStorage.setItem("medprix_procurement_orders", JSON.stringify(updated));
                          }
                        }
                      } catch {
                        // ignore local storage error
                      }
                    }
                    await fetch(`/api/purchase-orders/${orderToApprove.id}/items`, {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        items: approveEditItems.map((row) => ({
                          id: row.id,
                          quantityOrdered: Number(row.quantityOrdered),
                          unitCost: Number(row.unitCost),
                        })),
                      }),
                    }).catch(() => null);
                    setApproveEdit(false);
                    onToast("Purchase order updated.");
                    void loadData();
                  } catch (err: any) {
                    setError(safeError(err, "Could not save order changes."));
                  } finally {
                    setIsSaving(false);
                  }
                }}>
                {approveEdit ? (isSaving ? "Saving..." : "Save changes") : "Edit order"}
              </button>
              <button type="submit" className="button primary-action" disabled={isSaving || approveEdit}>
                <Check size={15} /> Approve order
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Confirm Order Approval Modal */}
      {orderToApprove && confirmApproveOrder && createPortal(
        <div className="modal-backdrop" data-testid="modal-confirm-approve-po" onMouseDown={event => {
          if (event.currentTarget === event.target && !isSaving) setConfirmApproveOrder(false);
        }}>
          <div className="modal dialog modal-wide">
            <div className="modal-header">
              <div>
                <h2>Confirm order approval</h2>
                <p className="modal-sub">
                  {orderToApprove.poNumber} • {resolveSupplierName(orderToApprove.supplier, orderToApprove.poNumber, orderToApprove.supplierId)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setConfirmApproveOrder(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview" style={{ marginBottom: 16 }}>
              <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div>
                  <dt>Purchase order</dt>
                  <dd>{orderToApprove.poNumber}</dd>
                </div>
                <div>
                  <dt>Supplier</dt>
                  <dd>{resolveSupplierName(orderToApprove.supplier, orderToApprove.poNumber, orderToApprove.supplierId)}</dd>
                </div>
                <div>
                  <dt>Order total</dt>
                  <dd>{money(orderToApprove.totalOrderAmount)}</dd>
                </div>
              </dl>
            </div>
            <p className="modal-sub" style={{ marginBottom: 20 }}>
              Approve {orderToApprove.poNumber} and move its status to <strong>Waiting for delivery</strong>?
            </p>
            <div className="modal-actions">
              <button type="button" className="button soft" disabled={isSaving} onClick={() => setConfirmApproveOrder(false)}>
                Back
              </button>
              <button
                type="button"
                className="button primary-action"
                disabled={isSaving}
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    await updateStatus(orderToApprove.id, "Waiting for delivery");
                    setConfirmApproveOrder(false);
                    setOrderToApprove(null);
                    onToast("Purchase order approved.");
                  } catch (err: any) {
                    setError(safeError(err, "Failed to approve purchase order."));
                  } finally {
                    setIsSaving(false);
                  }
                }}>
                <Check size={15} /> {isSaving ? "Approving..." : "Confirm approval"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Delivery Modal (for POs with Waiting for delivery status) */}
      {orderToConfirmDelivery && createPortal(
        <div className="modal-backdrop" data-testid="modal-confirm-delivery-po" onMouseDown={event => {
          if (event.currentTarget === event.target && !isSaving) setOrderToConfirmDelivery(null);
        }}>
          <div className="modal dialog modal-wide">
            <div className="modal-header">
              <div>
                <h2>Confirm delivery</h2>
                <p className="modal-sub">
                  {orderToConfirmDelivery.poNumber} • {resolveSupplierName(orderToConfirmDelivery.supplier, orderToConfirmDelivery.poNumber, orderToConfirmDelivery.supplierId)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setOrderToConfirmDelivery(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview" style={{ marginBottom: 16 }}>
              <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div>
                  <dt>Purchase order</dt>
                  <dd>{orderToConfirmDelivery.poNumber}</dd>
                </div>
                <div>
                  <dt>Supplier</dt>
                  <dd>{resolveSupplierName(orderToConfirmDelivery.supplier, orderToConfirmDelivery.poNumber, orderToConfirmDelivery.supplierId)}</dd>
                </div>
                <div>
                  <dt>Total value</dt>
                  <dd>{money(orderToConfirmDelivery.totalOrderAmount)}</dd>
                </div>
              </dl>
            </div>
            {(orderToConfirmDelivery.items ?? []).length > 0 && (
              <div className="modal-section" style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8 }}>Delivered medicines ({(orderToConfirmDelivery.items ?? []).length})</h4>
                <table className="data-table" style={{ width: "100%", minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Batch</th>
                      <th>Qty ordered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orderToConfirmDelivery.items ?? []).map((it, idx) => {
                      const sku = resolveItemSku(it, idx);
                      return (
                        <tr key={it.id}>
                          <td><strong>{it.product}</strong></td>
                          <td>{sku}</td>
                          <td><strong>{getItemBatchNumber(orderToConfirmDelivery.poNumber, sku, idx)}</strong></td>
                          <td>{it.quantityOrdered}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="field" style={{ marginBottom: 16, maxWidth: 280 }}>
              <label htmlFor="confirm-delivery-date" style={{ fontWeight: 600 }}>Delivery date *</label>
              <input
                id="confirm-delivery-date"
                required
                type="date"
                value={confirmDeliveryDate}
                onChange={(e) => setConfirmDeliveryDate(e.target.value)}
              />
            </div>
            <p className="modal-sub" style={{ marginBottom: 20 }}>
              Confirm that {orderToConfirmDelivery.poNumber} has arrived? This updates its status to <strong>Delivered</strong> in Purchase Order Monitoring, Receiving Report Management, and Batch Tracker.
            </p>
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <button
                type="button"
                className="button primary-action"
                disabled={isSaving}
                onClick={async () => {
                  const target = orderToConfirmDelivery;
                  setIsSaving(true);
                  try {
                    if (typeof window !== "undefined") {
                      localStorage.setItem(`medprix_po_delivery_date_${target.poNumber}`, confirmDeliveryDate);
                      localStorage.setItem(`medprix_receiving_date_${target.poNumber}`, confirmDeliveryDate);
                    }
                    await updateStatus(target.id, "Delivered");
                    setDeliveries((current) =>
                      current.map((d) => {
                        if (d.id !== target.id && d.poNumber !== target.poNumber) return d;
                        return {
                          ...d,
                          deliveryDate: confirmDeliveryDate,
                          deliveryStatus: "Delivered",
                        };
                      }),
                    );
                    setOrderToConfirmDelivery(null);
                    onToast("Delivery confirmed and status set to Delivered.");
                  } catch (err: any) {
                    setError(safeError(err, "Failed to confirm delivery."));
                  } finally {
                    setIsSaving(false);
                  }
                }}>
                <Check size={15} /> {isSaving ? "Confirming..." : "Confirm delivery"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Reject Purchase Order Modal */}
      {reportToReject && createPortal(
        <div className="modal-backdrop" data-testid="modal-reject-po" onMouseDown={event => {
          if (event.currentTarget === event.target && !isSaving) setReportToReject(null);
        }}>
          <div className="modal dialog modal-wide" style={{ maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>
            <div className="modal-header">
              <div>
                <h2>Reject purchase order</h2>
                <p className="modal-sub">
                  {reportToReject.delivery.poNumber} • {resolveSupplierName(reportToReject.delivery.supplier, reportToReject.delivery.poNumber)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setReportToReject(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview" style={{ marginBottom: 14 }}>
              <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div>
                  <dt>Purchase order</dt>
                  <dd>{reportToReject.delivery.poNumber}</dd>
                </div>
                <div>
                  <dt>Supplier</dt>
                  <dd>{resolveSupplierName(reportToReject.delivery.supplier, reportToReject.delivery.poNumber)}</dd>
                </div>
                <div>
                  <dt>Current delivery status</dt>
                  <dd>
                    <span className={getStatusPillClass(reportToReject.delivery.deliveryStatus)}>
                      {reportToReject.delivery.deliveryStatus}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
            {(reportToReject.delivery.items || []).length > 0 && (
              <div className="modal-section" style={{ marginBottom: 14 }}>
                <h4 style={{ marginBottom: 8 }}>Order medicines ({(reportToReject.delivery.items || []).length})</h4>
                <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid hsl(var(--border))", borderRadius: 8 }}>
                  <table className="data-table" style={{ width: "100%", minWidth: 0, margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Batch</th>
                        <th>Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportToReject.delivery.items || []).map((it, idx) => {
                        const sku = resolveItemSku(it, idx);
                        return (
                          <tr key={it.id}>
                            <td><strong>{it.product}</strong></td>
                            <td>{sku}</td>
                            <td><strong>{getItemBatchNumber(reportToReject.delivery.poNumber, sku, idx)}</strong></td>
                            <td>{it.quantityDelivered}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="modal-sub" style={{ marginBottom: 12 }}>
              Confirm rejection of purchase order <strong>{reportToReject.delivery.poNumber}</strong>? This will set its status to <strong>Rejected</strong> across all procurement tabs.
            </p>
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="reject-reason-note" style={{ fontWeight: 600 }}>Rejection note / reason</label>
              <textarea
                id="reject-reason-note"
                rows={2}
                placeholder="Enter notes or reason for rejection (e.g. damaged goods, wrong medicines, expired)..."
                value={reportToReject.note}
                onChange={(e) => setReportToReject({ ...reportToReject, note: e.target.value })}
                style={{ width: "100%", padding: 10 }}
              />
            </div>
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "nowrap", marginTop: 16, paddingBottom: 12 }}>
              <button
                type="button"
                className="button soft"
                disabled={isSaving}
                onClick={() => setReportToReject(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="button primary-action"
                style={{ backgroundColor: "hsl(var(--destructive))", borderColor: "hsl(var(--destructive))", color: "#fff" }}
                disabled={isSaving}
                onClick={async () => {
                  const target = reportToReject;
                  const poNumber = target.delivery.poNumber;
                  setIsSaving(true);
                  try {
                    if (typeof window !== "undefined") {
                      localStorage.setItem(`medprix_receiving_status_${poNumber}`, "Rejected");
                      localStorage.setItem(`medprix_receiving_status_${target.delivery.id}`, "Rejected");
                      localStorage.setItem(`medprix_delivery_note_${target.delivery.id}`, target.note || "");
                      localStorage.setItem(`medprix_delivery_note_${poNumber}`, target.note || "");
                      localStorage.setItem(`medprix_po_status_${poNumber}`, "Rejected");
                    }
                    setDeliveries((current) =>
                      current.map((d) => {
                        if (d.id !== target.delivery.id && d.poNumber !== poNumber) return d;
                        return {
                          ...d,
                          deliveryStatus: "Rejected",
                          isUserEditedStatus: true,
                          notes: target.note,
                        };
                      }),
                    );
                    const matchedOrder = orders.find((o) => o.poNumber === poNumber || o.id === target.delivery.poId);
                    if (matchedOrder) {
                      setOrders((current) =>
                        current.map((o) => (o.id === matchedOrder.id ? { ...o, status: "Rejected" } : o)),
                      );
                      await fetch(`/api/purchase-orders/${matchedOrder.id}/status`, {
                        method: "PATCH",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "Rejected" }),
                      }).catch(() => null);
                    }
                    if (!target.delivery.id.startsWith("po-receiving-")) {
                      await fetch(`/api/supplier-deliveries/${target.delivery.id}`, {
                        method: "PATCH",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          poId: target.delivery.poId,
                          deliveryDate: target.delivery.deliveryDate,
                          deliveryStatus: "Rejected",
                          notes: target.note,
                        }),
                      }).catch(() => null);
                    }
                    setReportToReject(null);
                    onToast("Purchase order marked as Rejected.");
                    await loadData();
                  } catch (err: any) {
                    setError(safeError(err, "Failed to reject purchase order."));
                  } finally {
                    setIsSaving(false);
                  }
                }}>
                <Ban size={14} /> {isSaving ? "Rejecting..." : "Confirm rejection"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Mark as Successful Purchase Modal (with in-place Edit details mode) */}
      {reportToMarkSuccessful && createPortal(
        <div className="modal-backdrop" data-testid="modal-confirm-successful-po" onMouseDown={event => {
          if (event.currentTarget === event.target && !isSaving) setReportToMarkSuccessful(null);
        }}>
          <div className="modal dialog modal-wide">
            <div className="modal-header">
              <div>
                <h2>Mark as successful purchase</h2>
                <p className="modal-sub">
                  {reportToMarkSuccessful.delivery.poNumber} • {resolveSupplierName(reportToMarkSuccessful.delivery.supplier, reportToMarkSuccessful.delivery.poNumber)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setReportToMarkSuccessful(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview" style={{ marginBottom: 16 }}>
              <section className="product-details-section">
                <h3>Delivery &amp; order summary</h3>
                <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <div>
                    <dt>Purchase order</dt>
                    <dd>{reportToMarkSuccessful.delivery.poNumber}</dd>
                  </div>
                  <div>
                    <dt>Supplier</dt>
                    <dd>{resolveSupplierName(reportToMarkSuccessful.delivery.supplier, reportToMarkSuccessful.delivery.poNumber)}</dd>
                  </div>
                  <div>
                    <dt>Delivery status</dt>
                    <dd>
                      <span className={getStatusPillClass(reportToMarkSuccessful.deliveryStatus)}>
                        {reportToMarkSuccessful.deliveryStatus}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Delivery date</dt>
                    <dd>
                      {reportToMarkSuccessful.isEditing ? (
                        <input
                          type="date"
                          value={reportToMarkSuccessful.deliveryDate}
                          onChange={(e) =>
                            setReportToMarkSuccessful({
                              ...reportToMarkSuccessful,
                              deliveryDate: e.target.value,
                            })
                          }
                        />
                      ) : (
                        formatDisplayDate(reportToMarkSuccessful.deliveryDate)
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Total quantity to stock in</dt>
                    <dd>
                      {reportToMarkSuccessful.items.reduce((sum, i) => sum + Number(i.quantityDelivered || 0), 0)} units
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="product-details-section">
                <h3>Note</h3>
                <dl className="product-details-facts" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                  <div>
                    <dd style={{ fontWeight: 400 }}>
                      {reportToMarkSuccessful.isEditing ? (
                        <textarea
                          rows={2}
                          value={reportToMarkSuccessful.notes}
                          onChange={(e) =>
                            setReportToMarkSuccessful({
                              ...reportToMarkSuccessful,
                              notes: e.target.value,
                            })
                          }
                          placeholder="Enter receiving remarks or inspection notes..."
                          style={{ width: "100%" }}
                        />
                      ) : (
                        reportToMarkSuccessful.notes || "No notes recorded."
                      )}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
            {reportToMarkSuccessful.items && reportToMarkSuccessful.items.length > 0 && (
              <div className="modal-section" style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8 }}>Items to add to inventory ({reportToMarkSuccessful.items.length})</h4>
                <div className="table-scroll" style={{ overflowX: "visible" }}>
                  <table className="data-table" style={{ width: "100%", minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Batch</th>
                        <th>Expiration date</th>
                        <th>Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportToMarkSuccessful.items.map((it, idx) => {
                        const sku = resolveItemSku(it, idx);
                        return (
                          <tr key={it.id}>
                            <td><strong>{it.product}</strong></td>
                            <td>{sku}</td>
                            <td><strong>{getItemBatchNumber(reportToMarkSuccessful.delivery.poNumber, sku, idx)}</strong></td>
                            <td>
                              {reportToMarkSuccessful.isEditing ? (
                                <input
                                  type="date"
                                  required
                                  value={it.expirationDate || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setReportToMarkSuccessful({
                                      ...reportToMarkSuccessful,
                                      items: reportToMarkSuccessful.items.map((row, rIdx) =>
                                        rIdx === idx ? { ...row, expirationDate: val } : row,
                                      ),
                                    });
                                  }}
                                  style={{ padding: "4px 8px", height: 32 }}
                                />
                              ) : (
                                it.expirationDate ? formatDisplayDate(it.expirationDate) : (
                                  <span className="muted" style={{ fontStyle: "italic", color: "hsl(var(--destructive))" }}>
                                    Blank (Required)
                                  </span>
                                )
                              )}
                            </td>
                            <td>
                              {reportToMarkSuccessful.isEditing ? (
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={it.quantityDelivered}
                                  onChange={(e) => {
                                    const val = Math.max(1, Number(e.target.value) || 1);
                                    setReportToMarkSuccessful({
                                      ...reportToMarkSuccessful,
                                      items: reportToMarkSuccessful.items.map((row, rIdx) =>
                                        rIdx === idx ? { ...row, quantityDelivered: val } : row,
                                      ),
                                    });
                                  }}
                                  style={{ width: 90, padding: "4px 8px", height: 32 }}
                                />
                              ) : (
                                `${it.quantityDelivered} units`
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="modal-sub" style={{ marginBottom: 20 }}>
              Confirm marking {reportToMarkSuccessful.delivery.poNumber} as a <strong>Successful</strong> purchase? All listed medicine items and quantities will be added to Inventory.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button soft"
                disabled={isSaving}
                onClick={async () => {
                  if (!reportToMarkSuccessful.isEditing) {
                    setReportToMarkSuccessful({
                      ...reportToMarkSuccessful,
                      isEditing: true,
                    });
                    return;
                  }
                  const poNumber = reportToMarkSuccessful.delivery.poNumber;
                  const totalQty = reportToMarkSuccessful.items.reduce(
                    (sum, i) => sum + Number(i.quantityDelivered || 0),
                    0,
                  );
                  if (typeof window !== "undefined") {
                    localStorage.setItem(`medprix_receiving_status_${poNumber}`, reportToMarkSuccessful.deliveryStatus);
                    localStorage.setItem(`medprix_receiving_status_${reportToMarkSuccessful.delivery.id}`, reportToMarkSuccessful.deliveryStatus);
                    localStorage.setItem(`medprix_receiving_date_${poNumber}`, reportToMarkSuccessful.deliveryDate);
                    localStorage.setItem(`medprix_receiving_expiry_${poNumber}`, reportToMarkSuccessful.expirationDate || reportToMarkSuccessful.items[0]?.expirationDate || "");
                    localStorage.setItem(`medprix_receiving_qty_${poNumber}`, String(totalQty));
                    localStorage.setItem(`medprix_delivery_note_${reportToMarkSuccessful.delivery.id}`, reportToMarkSuccessful.notes || "");
                    localStorage.setItem(`medprix_delivery_note_${poNumber}`, reportToMarkSuccessful.notes || "");
                    reportToMarkSuccessful.items.forEach((it, idx) => {
                      if (it.expirationDate) {
                        localStorage.setItem(`medprix_receiving_expiry_${poNumber}_${it.productId || it.id}`, it.expirationDate);
                        localStorage.setItem(`medprix_receiving_expiry_${poNumber}_${it.sku || idx}`, it.expirationDate);
                        localStorage.setItem(`medprix_receiving_expiry_${poNumber}_${idx}`, it.expirationDate);
                      }
                    });
                  }
                  setDeliveries((current) =>
                    current.map((d) => {
                      if (d.id !== reportToMarkSuccessful.delivery.id && d.poNumber !== poNumber) return d;
                      return {
                        ...d,
                        deliveryDate: reportToMarkSuccessful.deliveryDate,
                        deliveryStatus: reportToMarkSuccessful.deliveryStatus,
                        isUserEditedStatus: true,
                        notes: reportToMarkSuccessful.notes || "",
                        items: reportToMarkSuccessful.items,
                      };
                    }),
                  );
                  setReportToMarkSuccessful({
                    ...reportToMarkSuccessful,
                    isEditing: false,
                  });
                  onToast("Receiving report details updated.");
                }}>
                {reportToMarkSuccessful.isEditing ? "Save details" : "Edit details"}
              </button>
              <button
                type="button"
                className="button primary-action"
                disabled={isSaving}
                onClick={async () => {
                  const target = reportToMarkSuccessful;
                  const poNumber = target.delivery.poNumber;
                  const missingExp = target.items.some(
                    (it) => !it.expirationDate || it.expirationDate === "N/A" || it.expirationDate.trim() === "",
                  );
                  if (missingExp) {
                    setError("Please edit details and fill in the expiration date for each medicine before marking as successful.");
                    setReportToMarkSuccessful({ ...target, isEditing: true });
                    return;
                  }
                  const totalQty = target.items.reduce((sum, i) => sum + Number(i.quantityDelivered || 0), 0);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(`medprix_receiving_date_${poNumber}`, target.deliveryDate);
                    localStorage.setItem(`medprix_receiving_expiry_${poNumber}`, target.expirationDate);
                    localStorage.setItem(`medprix_receiving_qty_${poNumber}`, String(totalQty));
                    localStorage.setItem(`medprix_delivery_note_${target.delivery.id}`, target.notes || "");
                    localStorage.setItem(`medprix_delivery_note_${poNumber}`, target.notes || "");
                  }
                  if (target.deliveryStatus === "Rejected") {
                    if (typeof window !== "undefined") {
                      localStorage.setItem(`medprix_receiving_status_${poNumber}`, "Rejected");
                      localStorage.setItem(`medprix_receiving_status_${target.delivery.id}`, "Rejected");
                    }
                    await loadData();
                    setReportToMarkSuccessful(null);
                    onToast("Receiving report marked as Rejected.");
                    return;
                  }
                  await markOrderAsSuccessful(
                    {
                      ...target.delivery,
                      deliveryDate: target.deliveryDate,
                      notes: target.notes,
                      items: target.items,
                    },
                    {
                      ...target.item,
                      expirationDate: target.expirationDate,
                      quantityDelivered: totalQty,
                    },
                  );
                  setReportToMarkSuccessful(null);
                }}>
                <Check size={14} /> {isSaving ? "Saving..." : "Mark as successful purchase"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Receiving Report Modal */}
      {editReceivingReport && createPortal(
        <div className="modal-backdrop" data-testid="modal-edit-delivery" onMouseDown={event => {
          if (event.currentTarget === event.target && !isSaving) setEditReceivingReport(null);
        }}>
          <form className="modal dialog" style={{ width: "min(640px, 100%)" }} onSubmit={async (e) => {
            e.preventDefault();
            setIsSaving(true);
            try {
              const poNumber = editReceivingReport.delivery.poNumber;
              if (typeof window !== "undefined") {
                localStorage.setItem(`medprix_receiving_status_${poNumber}`, editReceivingReport.deliveryStatus);
                localStorage.setItem(`medprix_receiving_status_${editReceivingReport.delivery.id}`, editReceivingReport.deliveryStatus);
                localStorage.setItem(`medprix_receiving_date_${poNumber}`, editReceivingReport.deliveryDate);
                localStorage.setItem(`medprix_receiving_batch_${poNumber}`, editReceivingReport.batchNumber);
                localStorage.setItem(`medprix_receiving_qty_${poNumber}`, String(editReceivingReport.quantityDelivered));
                localStorage.setItem(`medprix_delivery_note_${editReceivingReport.delivery.id}`, editReceivingReport.notes || "");
                localStorage.setItem(`medprix_delivery_note_${poNumber}`, editReceivingReport.notes || "");
              }
              if (editReceivingReport.deliveryStatus === "Successful") {
                await markOrderAsSuccessful(
                  {
                    ...editReceivingReport.delivery,
                    deliveryDate: editReceivingReport.deliveryDate,
                    notes: editReceivingReport.notes || "",
                  },
                  {
                    ...editReceivingReport.item,
                    batchNumber: editReceivingReport.batchNumber,
                    quantityDelivered: Number(editReceivingReport.quantityDelivered),
                  },
                );
                setEditReceivingReport(null);
                return;
              }
              if (!editReceivingReport.delivery.id.startsWith("po-receiving-")) {
                await fetch(`/api/supplier-deliveries/${editReceivingReport.delivery.id}`, {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    poId: editReceivingReport.delivery.poId,
                    deliveryDate: editReceivingReport.deliveryDate,
                    deliveryStatus: editReceivingReport.deliveryStatus,
                    quantityDelivered: editReceivingReport.quantityDelivered,
                    batchNumber: editReceivingReport.batchNumber,
                    notes: editReceivingReport.notes || "",
                  }),
                }).catch(() => null);
              }
              setDeliveries(current => current.map(d => {
                if (d.id !== editReceivingReport.delivery.id && d.poNumber !== poNumber) return d;
                return {
                  ...d,
                  deliveryDate: editReceivingReport.deliveryDate,
                  deliveryStatus: editReceivingReport.deliveryStatus,
                  isUserEditedStatus: true,
                  notes: editReceivingReport.notes || "",
                  items: d.items.map(it => it.id === editReceivingReport.item.id ? {
                    ...it,
                    batchNumber: editReceivingReport.batchNumber,
                    quantityDelivered: Number(editReceivingReport.quantityDelivered),
                  } : it),
                };
              }));
              setEditReceivingReport(null);
              onToast(
                editReceivingReport.deliveryStatus === "Successful"
                  ? "Receiving report marked as successful and items added to inventory."
                  : "Receiving report updated successfully.",
              );
              await Promise.all([loadData(), fetchInventoryData(true)]);
            } catch (err: any) {
              setError(safeError(err, "Failed to update receiving report."));
            } finally {
              setIsSaving(false);
            }
          }}>
            <div className="modal-header">
              <div>
                <h2>Edit receiving report</h2>
                <p className="modal-sub">
                  {editReceivingReport.delivery.poNumber} • {resolveSupplierName(editReceivingReport.delivery.supplier, editReceivingReport.delivery.poNumber)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setEditReceivingReport(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview" style={{ marginBottom: 16 }}>
              <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div>
                  <dt>Purchase order</dt>
                  <dd>{editReceivingReport.delivery.poNumber}</dd>
                </div>
                <div>
                  <dt>Supplier</dt>
                  <dd>{resolveSupplierName(editReceivingReport.delivery.supplier, editReceivingReport.delivery.poNumber)}</dd>
                </div>
                <div>
                  <dt>Delivery status</dt>
                  <dd>
                    <span className={getStatusPillClass(editReceivingReport.deliveryStatus)}>
                      {editReceivingReport.deliveryStatus}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Delivery date *</label>
                <input
                  required
                  type="date"
                  value={editReceivingReport.deliveryDate}
                  onChange={(e) => setEditReceivingReport({ ...editReceivingReport, deliveryDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Batch number(s) *</label>
                <input
                  required
                  type="text"
                  value={editReceivingReport.batchNumber}
                  readOnly
                  style={{ backgroundColor: "hsl(var(--surface-soft))", fontWeight: 600 }}
                />
              </div>
              <div className="field">
                <label>Quantity delivered *</label>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={editReceivingReport.quantityDelivered}
                  onChange={(e) => setEditReceivingReport({ ...editReceivingReport, quantityDelivered: Number(e.target.value) })}
                />
              </div>
              <div className="field full-width">
                <label htmlFor="edit-delivery-notes">Note</label>
                <textarea
                  id="edit-delivery-notes"
                  rows={3}
                  value={editReceivingReport.notes || ""}
                  onChange={(e) => setEditReceivingReport({ ...editReceivingReport, notes: e.target.value })}
                  placeholder="Enter receiving remarks or inspection notes..."
                />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button type="button" className="button soft" disabled={isSaving} onClick={() => setEditReceivingReport(null)}>
                Cancel
              </button>
              <button type="submit" className="button primary-action" disabled={isSaving}>
                <Check size={14} /> {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* View Receiving Report Details Modal */}
      {viewReceivingReport && createPortal(
        <div className="modal-backdrop" data-testid="modal-view-delivery" onMouseDown={event => {
          if (event.currentTarget === event.target) setViewReceivingReport(null);
        }}>
          <ModalTableDialog className="modal dialog modal-wide" close={() => setViewReceivingReport(null)}>
            <div className="modal-header">
              <div>
                <h2>Receiving report details</h2>
                <p className="modal-sub">
                  {viewReceivingReport.delivery.poNumber} • {resolveSupplierName(viewReceivingReport.delivery.supplier, viewReceivingReport.delivery.poNumber)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setViewReceivingReport(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview">
              <section className="product-details-section">
                <h3>Delivery information</h3>
                <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <div>
                    <dt>Purchase order</dt>
                    <dd>{viewReceivingReport.delivery.poNumber}</dd>
                  </div>
                  <div>
                    <dt>Supplier</dt>
                    <dd>{resolveSupplierName(viewReceivingReport.delivery.supplier, viewReceivingReport.delivery.poNumber)}</dd>
                  </div>
                  <div>
                    <dt>Delivery date</dt>
                    <dd>{formatReceivingDeliveryStatus(viewReceivingReport.delivery.deliveryStatus) === "Pending" ? "—" : formatDisplayDate(viewReceivingReport.delivery.deliveryDate)}</dd>
                  </div>
                  <div>
                    <dt>Delivery status</dt>
                    <dd>
                      {(() => {
                        const status = formatReceivingDeliveryStatus(viewReceivingReport.delivery.deliveryStatus);
                        return (
                          <span className={getStatusPillClass(status)}>
                            {status}
                          </span>
                        );
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt>Quantity delivered</dt>
                    <dd>{viewReceivingReport.item.quantityDelivered} <span>units</span></dd>
                  </div>
                </dl>
              </section>
              <section className="product-details-section">
                <h3>Note</h3>
                <dl className="product-details-facts" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                  <div>
                    <dd style={{ fontWeight: 400 }}>
                      {viewReceivingReport.delivery.notes ||
                        (typeof window !== "undefined"
                          ? localStorage.getItem(`medprix_delivery_note_${viewReceivingReport.delivery.id}`) ||
                            localStorage.getItem(`medprix_delivery_note_${viewReceivingReport.delivery.poNumber}`) || ""
                          : "") ||
                        "No notes recorded."}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
            {viewReceivingReport.delivery.items && viewReceivingReport.delivery.items.length > 0 && (
              <div className="modal-section">
                <h4>Report items ({viewReceivingReport.delivery.items.length})</h4>
                <ModalDataTable className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Batch number</th>
                      <th>Expiration date</th>
                      <th>Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewReceivingReport.delivery.items.map((it, idx) => {
                      const sku = resolveItemSku(it, idx);
                      return (
                        <tr key={it.id}>
                          <td><strong>{it.product}</strong></td>
                          <td>{sku}</td>
                          <td><strong>{getItemBatchNumber(viewReceivingReport.delivery.poNumber, sku, idx)}</strong></td>
                          <td>{it.expirationDate && it.expirationDate !== "N/A" ? formatDisplayDate(it.expirationDate) : "—"}</td>
                          <td>{it.quantityDelivered} units</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ModalDataTable>
              </div>
            )}
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <button
                type="button"
                className="button primary-action"
                onClick={() => {
                  const status = formatReceivingDeliveryStatus(viewReceivingReport.delivery.deliveryStatus);
                  const note =
                    viewReceivingReport.delivery.notes ||
                    (typeof window !== "undefined"
                      ? localStorage.getItem(`medprix_delivery_note_${viewReceivingReport.delivery.id}`) ||
                        localStorage.getItem(`medprix_delivery_note_${viewReceivingReport.delivery.poNumber}`) || ""
                      : "") ||
                    "No notes recorded.";
                  downloadReceivingReportPdf({
                    poNumber: viewReceivingReport.delivery.poNumber,
                    supplier: resolveSupplierName(viewReceivingReport.delivery.supplier, viewReceivingReport.delivery.poNumber),
                    deliveryDate: formatDisplayDate(viewReceivingReport.delivery.deliveryDate),
                    deliveryStatus: status,
                    batchNumber: viewReceivingReport.item.batchNumber,
                    quantityDelivered: viewReceivingReport.item.quantityDelivered,
                    expirationDate: viewReceivingReport.item.expirationDate && viewReceivingReport.item.expirationDate !== "N/A"
                      ? formatDisplayDate(viewReceivingReport.item.expirationDate)
                      : "N/A",
                    expiryStatus: expiryStatus(viewReceivingReport.item.expirationDate).label,
                    notes: note,
                    items: viewReceivingReport.delivery.items,
                  });
                  onToast("Receiving report PDF exported successfully.");
                }}>
                <Download size={14} /> Export report
              </button>
            </div>
          </ModalTableDialog>
        </div>,
        document.body
      )}

      {/* View Invoice Modal */}
      {viewInvoice && createPortal(
        <div className="modal-backdrop" data-testid="modal-view-invoice" onMouseDown={event => {
          if (event.currentTarget === event.target) setViewInvoice(null);
        }}>
          <div className="modal dialog modal-wide" style={{ maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>
            <div className="modal-header">
              <div>
                <h2>Invoice</h2>
                <p className="modal-sub">
                  {viewInvoice.invoiceNumber} • {resolveSupplierName(viewInvoice.supplier, viewInvoice.poNumber, viewInvoice.supplierId)}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setViewInvoice(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview" style={{ marginBottom: 16 }}>
              <section className="product-details-section">
                <h3>Invoice summary</h3>
                <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className={getStatusPillClass(viewInvoice.status)}>
                        {viewInvoice.status}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Purchase order</dt>
                    <dd>{viewInvoice.poNumber || "—"}</dd>
                  </div>
                  <div>
                    <dt>Payment terms</dt>
                    <dd><span className="pill neutral">{getInvoicePaymentOption(viewInvoice)}</span></dd>
                  </div>
                  <div>
                    <dt>Mode of payment</dt>
                    <dd>{getInvoicePaymentMode(viewInvoice)}</dd>
                  </div>
                  <div>
                    <dt>Next payment date</dt>
                    <dd>{getInvoiceNextPaymentDate(viewInvoice)}</dd>
                  </div>
                  <div>
                    <dt>Due date</dt>
                    <dd>{formatDisplayDate(viewInvoice.dueDate)}</dd>
                  </div>
                </dl>
              </section>
              <section className="product-details-section">
                <h3>Financial breakdown</h3>
                <dl className="product-details-facts product-details-pricing">
                  <div>
                    <dt>Invoice amount</dt>
                    <dd>{money(viewInvoice.invoiceAmount)}</dd>
                  </div>
                  <div>
                    <dt>Total paid</dt>
                    <dd>{money(viewInvoice.totalPaid ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd>{money(viewInvoice.balance ?? (viewInvoice.status === "Settled" ? 0 : viewInvoice.invoiceAmount))}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="modal-section" style={{ marginBottom: 16 }}>
              <h4 style={{ marginBottom: 8 }}>Installment balances</h4>
              <table className="data-table" style={{ width: "100%", minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Installment</th>
                    <th>Due date</th>
                    <th>Amount</th>
                    <th>Total paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {getInvoiceInstallments(viewInvoice).map((row) => (
                    <tr key={row.sequenceNumber}>
                      <td>{row.sequenceNumber}</td>
                      <td>{formatDisplayDate(row.dueDate)}</td>
                      <td>{money(row.amount)}</td>
                      <td>{money(row.paid)}</td>
                      <td>{money(row.balance)}</td>
                      <td>
                        <span className={
                          row.status === "Paid" ? "pill success" :
                          row.status === "Partially paid" ? "pill warning" :
                          row.status === "Overdue" ? "pill danger" : "pill neutral"
                        }>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <button
                type="button"
                className="button primary-action"
                onClick={() => {
                  downloadInvoicePdf({
                    invoiceNumber: viewInvoice.invoiceNumber,
                    poNumber: viewInvoice.poNumber,
                    supplier: resolveSupplierName(viewInvoice.supplier, viewInvoice.poNumber, viewInvoice.supplierId),
                    paymentTerms: getInvoicePaymentOption(viewInvoice),
                    modeOfPayment: getInvoicePaymentMode(viewInvoice),
                    nextPaymentDate: getInvoiceNextPaymentDate(viewInvoice),
                    dueDate: viewInvoice.dueDate,
                    invoiceAmount: viewInvoice.invoiceAmount,
                    totalPaid: viewInvoice.totalPaid ?? 0,
                    balance: viewInvoice.balance ?? (viewInvoice.status === "Settled" ? 0 : viewInvoice.invoiceAmount),
                    status: viewInvoice.status,
                    payments: viewInvoice.payments,
                  });
                  onToast("Invoice PDF exported successfully.");
                }}>
                <Download size={15} /> Export invoice
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View Batch Details Modal */}
      {viewBatch && createPortal(
        <div className="modal-backdrop" data-testid="modal-view-batch" onMouseDown={event => {
          if (event.currentTarget === event.target) setViewBatch(null);
        }}>
          <div className="modal dialog" style={{ width: "min(640px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Batch details</h2>
                <p className="modal-sub">{viewBatch.batchNumber} • {viewBatch.product}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setViewBatch(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="product-details-overview" style={{ marginBottom: 0 }}>
              <section className="product-details-section">
                <h3>Batch information</h3>
                <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  <div>
                    <dt>Batch number</dt>
                    <dd>{viewBatch.batchNumber}</dd>
                  </div>
                  <div>
                    <dt>PO Status</dt>
                    <dd>
                      <span className={getStatusPillClass(viewBatch.status)}>
                        {viewBatch.status}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Product</dt>
                    <dd>
                      {viewBatch.product}
                      {viewBatch.sku && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{viewBatch.sku}</div>}
                    </dd>
                  </div>
                  <div>
                    <dt>Purchase order</dt>
                    <dd>{viewBatch.poNumber}</dd>
                  </div>
                  <div>
                    <dt>Supplier</dt>
                    <dd>{resolveSupplierName(viewBatch.supplier, viewBatch.poNumber)}</dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>{viewBatch.quantity} <span>units</span></dd>
                  </div>
                  <div>
                    <dt>Receiving report status</dt>
                    <dd>
                      <span className={getStatusPillClass(viewBatch.receivingStatus || viewBatch.status)}>
                        {viewBatch.receivingStatus || viewBatch.status}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{formatDisplayDate(viewBatch.date)}</dd>
                  </div>
                  {viewBatch.invoiceNumber && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <dt>Connected invoice</dt>
                      <dd>{viewBatch.invoiceNumber} • {viewBatch.invoiceStatus}</dd>
                    </div>
                  )}
                </dl>
              </section>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
