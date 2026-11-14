import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { safeError, readResponse } from "@/lib/feedback";
import { ProductDialog } from "@/components/custom-ui/product-dialog";
import { matchesProductSearch } from "@/lib/product-form";
import { useState, useEffect, useRef, useMemo, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { usePharmacyInventory, usePharmacyTransactions } from "@/lib/pharmacy-store";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Download,
  Ellipsis,
  Eye,
  Layers,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import { fetchSupplierRecords, type SupplierRecord } from "@/lib/supplier-store";
import type { ProductItem, ProductBatch, ToastFn } from "@/lib/types";

const MAX_STOCK_MOVEMENT_QUANTITY = 1_000_000;

function validateStockMovementQuantity(value: string):
  | { ok: true; quantity: number }
  | { ok: false; error: string } {
  if (!value.trim()) return { ok: false, error: "Quantity is required" };

  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return { ok: false, error: "Quantity must be a valid number" };
  if (!Number.isInteger(quantity)) return { ok: false, error: "Quantity must be a whole number" };
  if (quantity <= 0) return { ok: false, error: "Quantity must be greater than zero" };
  if (quantity > MAX_STOCK_MOVEMENT_QUANTITY) {
    return {
      ok: false,
      error: `Quantity cannot exceed ${MAX_STOCK_MOVEMENT_QUANTITY.toLocaleString()} units`,
    };
  }
  return { ok: true, quantity };
}

function getBatchExpiryStatus(expiryDateStr: string, qty: number) {
  if (qty <= 0) return { status: "Depleted", tone: "neutral" };
  const expiry = new Date(expiryDateStr);
  const now = new Date("2026-09-18T00:00:00");
  if (isNaN(expiry.getTime())) return { status: "Valid", tone: "success" };
  if (expiry < now) return { status: "Expired", tone: "danger" };
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 60) return { status: "Expiring Soon", tone: "warning" };
  return { status: "Valid", tone: "success" };
}

function getBatchStatusData(batch: ProductBatch, product: ProductItem) {
  const qty = Number(batch.quantity) || 0;
  const productStock = getProductTotalStock(product);
  const now = new Date("2026-09-18T00:00:00");
  const exp = new Date(batch.expiryDate);

  // Stock Level Status
  let stockLevelLabel = "In Stock";
  let stockLevelTone: "success" | "warning" | "danger" = "success";

  if (qty <= 0) {
    stockLevelLabel = "Out of Stock";
    stockLevelTone = "danger";
  } else if (productStock <= product.reorder) {
    stockLevelLabel = "Low Stock";
    stockLevelTone = "warning";
  }

  const badges: Array<{ label: string; tone: "success" | "warning" | "danger" }> = [
    { label: stockLevelLabel, tone: stockLevelTone },
  ];

  // Expiring Status
  if (!isNaN(exp.getTime())) {
    if (exp < now) {
      badges.push({ label: "Expired", tone: "danger" });
    } else {
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 60) {
        badges.push({ label: "Expiring Soon", tone: "warning" });
      }
    }
  }

  return badges;
}

function getProductTotalStock(product: ProductItem): number {
  return product.batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
}
function updateProductStock(product: ProductItem): ProductItem {
  const stock = getProductTotalStock(product);
  return {
    ...product,
    stock,
    status:
      stock === 0
        ? "Out of stock"
        : stock <= product.reorder
          ? "Low stock"
          : "Available",
  };
}

function getProductStatusData(product: ProductItem) {
  const stock = getProductTotalStock(product);
  const now = new Date("2026-09-18T00:00:00");

  const expiredBatches = product.batches.filter((b) => {
    const exp = new Date(b.expiryDate);
    return !isNaN(exp.getTime()) && exp < now && Number(b.quantity) > 0;
  });

  const expiringSoonBatches = product.batches.filter((b) => {
    const exp = new Date(b.expiryDate);
    if (isNaN(exp.getTime()) || exp < now || Number(b.quantity) <= 0) return false;
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 60;
  });

  const isLowStock = stock <= product.reorder && stock > 0;
  const isOutOfStock = stock === 0;
  const isExpired = expiredBatches.length > 0;
  const isExpiringSoon = expiringSoonBatches.length > 0;

  // Stock Level Status
  let stockLevelLabel = "In Stock";
  let stockLevelTone: "success" | "warning" | "danger" = "success";

  if (isOutOfStock) {
    stockLevelLabel = "Out of Stock";
    stockLevelTone = "danger";
  } else if (isLowStock) {
    stockLevelLabel = "Low Stock";
    stockLevelTone = "warning";
  }

  // Dual badges: stock level status + expiring status
  const badges: Array<{ label: string; tone: "success" | "warning" | "danger" }> = [
    { label: stockLevelLabel, tone: stockLevelTone },
  ];

  let expiryStatusLabel: string | null = null;
  let expiryStatusTone: "warning" | "danger" | null = null;

  if (isExpired) {
    expiryStatusLabel = "Expired";
    expiryStatusTone = "danger";
    badges.push({ label: "Expired", tone: "danger" });
  }
  if (isExpiringSoon) {
    if (!expiryStatusLabel) {
      expiryStatusLabel = "Expiring Soon";
      expiryStatusTone = "warning";
    }
    badges.push({ label: "Expiring Soon", tone: "warning" });
  }

  const statusLabel = badges.map((b) => b.label).join(" • ");
  let statusTone: "success" | "warning" | "danger" = stockLevelTone;
  if (isExpired || isOutOfStock) {
    statusTone = "danger";
  } else if (isExpiringSoon || isLowStock) {
    statusTone = "warning";
  }

  const activeBatches = product.batches.filter((b) => Number(b.quantity) > 0);
  const sortedBatches = [...(activeBatches.length > 0 ? activeBatches : product.batches)].sort(
    (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
  );
  const primaryExpiry = sortedBatches[0]?.expiryDate || "N/A";

  return {
    stock,
    statusLabel,
    statusTone,
    stockLevelLabel,
    stockLevelTone,
    expiryStatusLabel,
    expiryStatusTone,
    badges,
    isLowStock,
    isOutOfStock,
    isExpired,
    isExpiringSoon,
    expiredBatches,
    expiringSoonBatches,
    primaryExpiry,
  };
}

export default function InventoryPage({
  onToast,
  currentRole,
}: {
  onToast: ToastFn;
  currentRole?: string;
}) {
  const role = (
    currentRole ||
    localStorage.getItem("medprix-role") ||
    "Admin"
  ).toLowerCase();

  const isAdmin = role === "admin";
  const isFrontDesk = role === "frontdesk";
  const isCashier = role === "cashier";

  const canViewAlerts = isAdmin || isFrontDesk;
  const canAddProduct = isAdmin || isFrontDesk;
  const canEditProduct = isAdmin || isFrontDesk;
  const canAddBatch = isAdmin || isFrontDesk;
  const canAddFullBatchInfo = isAdmin;
  const canRecordStockIn = isAdmin || isCashier;
  const canRecordStockOut = isAdmin || isCashier;

  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  useEffect(() => {
    if (isCashier) return;
    let active = true;
    fetchSupplierRecords()
      .then((records) => {
        if (active) setSuppliers(records);
      })
      .catch((failure) => {
        if (active) onToast({ message: safeError(failure), variant: "error" });
      });
    return () => {
      active = false;
    };
  }, [isCashier, onToast]);

  // Inventory items state from shared pharmacy store
  const { items, setItems, loading: isLoading, refresh: fetchInventory, isBackendConnected, error: inventoryLoadError } = usePharmacyInventory();
  const { transactions: posTransactions } = usePharmacyTransactions();
  const [activeTab, setActiveTab] = useState<"inventory" | "movements">("inventory");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [movementSearch, setMovementSearch] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("All movement types");
  const [movementPage, setMovementPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [categoryFilter, setCategoryFilter] = useState("All categories");

  // Modals state
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<ProductItem | null>(null);
  const [editProduct, setEditProduct] = useState<ProductItem | null>(null);
  const [movementError, setMovementError] = useState("");
  const [movementSaving, setMovementSaving] = useState(false);
  const movementBusy = useRef(false);
  const [batchProduct, setBatchProduct] = useState<ProductItem | null>(null);
  const [stockInProduct, setStockInProduct] = useState<ProductItem | null>(null);
  const [stockOutProduct, setStockOutProduct] = useState<ProductItem | null>(null);
  const [alertModal, setAlertModal] = useState<"low-stock" | "expired" | null>(null);
  const [alertSearch, setAlertSearch] = useState("");

  // Forms state
  const [newBatchData, setNewBatchData] = useState({
    batchNumber: "",
    quantity: "",
    expiryDate: "",
    mfgDate: "",
    dateReceived: new Date().toISOString().slice(0, 10),
    supplier: "",
  });

  const [stockInData, setStockInData] = useState({
    batchNumber: "",
    quantity: "",
    date: new Date().toISOString().slice(0, 10),
    reason: "Procurement Delivery",
  });

  const [stockOutData, setStockOutData] = useState({
    batchNumber: "",
    quantity: "",
    date: new Date().toISOString().slice(0, 10),
    reason: "Dispensed / Sales",
  });

  // Body scroll locking and Escape key handling when any modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(
      viewProduct ||
      editProduct ||
      batchProduct ||
      stockInProduct ||
      stockOutProduct ||
      isAddProductOpen
    );

    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewProduct(null);
        setBatchProduct(null);
        setStockInProduct(null);
        setStockOutProduct(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    viewProduct,
    editProduct,
    batchProduct,
    stockInProduct,
    stockOutProduct,
    isAddProductOpen,
  ]);

  // Derived low-stock & expired items for alerts
  const lowStockItems = items.filter((p) => {
    const info = getProductStatusData(p);
    return info.isLowStock || info.isOutOfStock;
  });

  const expiredItems = items.filter((p) => {
    const info = getProductStatusData(p);
    return info.isExpired;
  });

  const expiringSoonItems = items.filter((p) => {
    const info = getProductStatusData(p);
    return info.isExpiringSoon && !info.isExpired;
  });

  // Filtered products list
  const filtered = items.filter((product) => {
    const info = getProductStatusData(product);
    const matchesSearch = matchesProductSearch(product, search);

    const matchesStatus =
      statusFilter === "All statuses" ||
      (statusFilter === "In Stock" && info.stockLevelLabel === "In Stock") ||
      (statusFilter === "Low Stock" && info.isLowStock) ||
      (statusFilter === "Out of Stock" && info.isOutOfStock) ||
      (statusFilter === "Expiring Soon" && info.isExpiringSoon) ||
      (statusFilter === "Expired" && info.isExpired);

    const normalizedCategory = product.category?.trim() || "None";
    const matchesCategory =
      categoryFilter === "All categories" || normalizedCategory === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  }).sort((a, b) => {
    const nameComparison = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (nameComparison !== 0) return nameComparison;

    const skuComparison = a.sku.localeCompare(b.sku, undefined, {
      sensitivity: "base",
      numeric: true,
    });
    return skuComparison !== 0 ? skuComparison : a.id.localeCompare(b.id);
  });

  const availableCategories = Array.from(
    new Set(
      items
        .map((product) => product.category?.trim())
        .filter((category): category is string => Boolean(category)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const hasUncategorized = items.some((product) => !product.category?.trim());
  const categoryOptions =
    availableCategories.length > 0
      ? [...availableCategories, ...(hasUncategorized ? ["None"] : [])]
      : ["None"];
  const categories = ["All categories", ...categoryOptions];

  // Summary counts
  const totalStockCount = items.reduce(
    (sum, p) => sum + getProductTotalStock(p),
    0,
  );

  const posStockMovements = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Manila",
    });
    const formatDate = (value: string) => {
      if (!value) return "—";
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : fmt.format(parsed);
    };
    const productById = new Map(items.map((p) => [p.id, p]));
    const productByName = new Map(items.map((p) => [p.name.toLowerCase(), p]));

    return posTransactions
      .filter((trx) => trx.status !== "Voided")
      .flatMap((trx, trxIdx) => {
        const formattedDate = formatDate(trx.dateTime || "");
        const reference = trx.transactionNumber || `TRX-${trx.id}`;
        const user = trx.user || "Cashier";
        return (Array.isArray(trx.items) ? trx.items : []).map((line: any, lineIdx: number) => {
          const matchedProduct =
            (line.productId && productById.get(String(line.productId))) ||
            productByName.get(String(line.product || "").toLowerCase());
          const productName = line.product || matchedProduct?.name || "Unknown Product";
          const genericName = matchedProduct?.genericName || "";
          const sku = matchedProduct?.sku || "—";
          const movementType = "POS Sale";
          return {
            id: `${trx.id ?? trxIdx}-${line.productId ?? lineIdx}`,
            dateTime: trx.dateTime || "",
            formattedDate,
            reference,
            productName,
            genericName,
            sku,
            movementType,
            quantity: Number(line.quantity) || 0,
            user,
            unitPrice: line.unitPrice || "—",
            subtotal: line.subtotal || "—",
            searchText: `${productName} ${genericName} ${sku} ${reference} ${user} ${movementType}`.toLowerCase(),
          };
        });
      });
  }, [posTransactions, items]);

  const filteredMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    return posStockMovements.filter((m) => {
      const matchesType =
        movementTypeFilter === "All movement types" || m.movementType === movementTypeFilter;
      const matchesQuery = !q || m.searchText.includes(q);
      return matchesType && matchesQuery;
    });
  }, [posStockMovements, movementSearch, movementTypeFilter]);

  const INVENTORY_PAGE_SIZE = 15;
  const totalInventoryPages = Math.max(1, Math.ceil(filtered.length / INVENTORY_PAGE_SIZE));
  const safeInventoryPage = Math.min(inventoryPage, totalInventoryPages);
  const paginatedInventory = useMemo(
    () =>
      filtered.slice(
        (safeInventoryPage - 1) * INVENTORY_PAGE_SIZE,
        safeInventoryPage * INVENTORY_PAGE_SIZE,
      ),
    [filtered, safeInventoryPage],
  );

  const MOVEMENT_PAGE_SIZE = 15;
  const totalMovementPages = Math.max(1, Math.ceil(filteredMovements.length / MOVEMENT_PAGE_SIZE));
  const safeMovementPage = Math.min(movementPage, totalMovementPages);
  const paginatedMovements = useMemo(
    () =>
      filteredMovements.slice(
        (safeMovementPage - 1) * MOVEMENT_PAGE_SIZE,
        safeMovementPage * MOVEMENT_PAGE_SIZE,
      ),
    [filteredMovements, safeMovementPage],
  );

  // Handlers
  const handleOpenAddProduct = () => setIsAddProductOpen(true);
  const handleOpenEditProduct = (product: ProductItem) => setEditProduct(product);
  const handleProductSaved = (product: ProductItem) => {
    setItems((current) => [...current.filter((item) => item.id !== product.id), updateProductStock(product)]);
    onToast(editProduct ? "Product updated successfully." : "Product added successfully.");
  };

  const handleOpenAddBatch = (product: ProductItem) => {
    setNewBatchData({
      batchNumber: "",
      quantity: "",
      expiryDate: "",
      mfgDate: "",
      dateReceived: new Date().toISOString().slice(0, 10),
      supplier: "",
    });
    setMovementError("");
    setBatchProduct(product);
  };

  const handleSaveAddBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (movementBusy.current) return;
    setMovementError("");
    if (!batchProduct || !newBatchData.batchNumber.trim()) {
      setMovementError("Batch number is required");
      return;
    }

    const validation = validateStockMovementQuantity(newBatchData.quantity);
    if (!validation.ok) {
      setMovementError(validation.error);
      return;
    }
    if (!newBatchData.expiryDate) {
      setMovementError("Expiry date is required.");
      return;
    }
    const parsedQty = validation.quantity;
    const newBatch = {
      batchNumber: newBatchData.batchNumber.trim().toUpperCase(),
      quantity: parsedQty,
      expiryDate: newBatchData.expiryDate,
      mfgDate: newBatchData.mfgDate,
      dateReceived: newBatchData.dateReceived,
      supplier: newBatchData.supplier,
    };

    movementBusy.current = true; setMovementSaving(true);
    try {
      const res = await fetch(`/api/inventory/products/${batchProduct.id}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBatch),
      });
      const data = await readResponse(res, "Could not confirm this stock change. Refresh inventory and check the batch before retrying.");
      if (!data.success || !data.product?.id) throw new Error("Stock change could not be confirmed. Refresh inventory and check the batch before retrying.");

      if (!res.ok) {
        setMovementError(safeError(data?.error || "Failed to add batch"));
        return;
      }

      await fetchInventory();
      setBatchProduct(null);
      onToast(`Added batch ${newBatch.batchNumber} (${parsedQty} units) to ${batchProduct.name}`);
    } catch (err) {
      setMovementError(safeError(err, "The stock change could not be confirmed. Your entries are retained. Refresh inventory and check the batch before retrying."));
    } finally { movementBusy.current = false; setMovementSaving(false); }
  };

  const handleOpenStockIn = (product: ProductItem) => {
    setStockInData({
      batchNumber: "",
      quantity: "",
      date: new Date().toISOString().slice(0, 10),
      reason: "Procurement Delivery",
    });
    setMovementError("");
    setStockInProduct(product);
  };

  const handleSaveStockIn = async (e: FormEvent) => {
    e.preventDefault();
    if (movementBusy.current) return;
    setMovementError("");
    if (!stockInProduct) return;
    if (!stockInData.batchNumber) {
      setMovementError("Select an existing batch. If this product has no batches, use Add Batch first.");
      return;
    }
    const validation = validateStockMovementQuantity(stockInData.quantity);
    if (!validation.ok) {
      setMovementError(validation.error);
      return;
    }
    const qty = validation.quantity;

    movementBusy.current = true; setMovementSaving(true);
    try {
      const res = await fetch(`/api/inventory/products/${stockInProduct.id}/stock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchNumber: stockInData.batchNumber,
          quantity: qty,
          reason: stockInData.reason,
          date: stockInData.date,
        }),
      });
      const data = await readResponse(res, "Could not confirm this stock change. Refresh inventory and check the batch before retrying.");
      if (!data.success || !data.product?.id) throw new Error("Stock change could not be confirmed. Refresh inventory and check the batch before retrying.");

      if (!res.ok) {
        setMovementError(safeError(data?.error || "Failed to record stock in"));
        return;
      }

      await fetchInventory();
      setStockInProduct(null);
      onToast(`Stock In recorded: +${qty} units added to ${stockInProduct.name} (${stockInData.reason})`);
    } catch (err) {
      setMovementError(safeError(err, "The stock change could not be confirmed. Your entries are retained. Refresh inventory and check the batch before retrying."));
    } finally { movementBusy.current = false; setMovementSaving(false); }
  };

  const handleOpenStockOut = (product: ProductItem) => {
    const firstAvailable =
      product.batches.find((b) => b.quantity > 0)?.batchNumber ||
      product.batches[0]?.batchNumber ||
      "";
    setStockOutData({
      batchNumber: firstAvailable,
      quantity: "5",
      date: new Date().toISOString().slice(0, 10),
      reason: "Dispensed / OTC",
    });
    setMovementError("");
    setStockOutProduct(product);
  };

  const handleSaveStockOut = async (e: FormEvent) => {
    e.preventDefault();
    if (movementBusy.current) return;
    setMovementError("");
    if (!stockOutProduct) return;
    const validation = validateStockMovementQuantity(stockOutData.quantity);
    if (!validation.ok) {
      setMovementError(validation.error);
      return;
    }
    const qty = validation.quantity;

    const targetBatch = stockOutProduct.batches.find(
      (b) => b.batchNumber === stockOutData.batchNumber,
    );

    if (!targetBatch || targetBatch.quantity < qty) {
      setMovementError(`Insufficient batch stock. Available in ${stockOutData.batchNumber}: ${targetBatch?.quantity || 0} units`);
      return;
    }

    movementBusy.current = true; setMovementSaving(true);
    try {
      const res = await fetch(`/api/inventory/products/${stockOutProduct.id}/stock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchNumber: stockOutData.batchNumber,
          quantity: qty,
          reason: stockOutData.reason,
        }),
      });
      const data = await readResponse(res, "Could not confirm this stock change. Refresh inventory and check the batch before retrying.");
      if (!data.success || !data.product?.id) throw new Error("Stock change could not be confirmed. Refresh inventory and check the batch before retrying.");

      if (!res.ok) {
        setMovementError(safeError(data?.error || "Failed to record stock out"));
        return;
      }

      await fetchInventory();
      setStockOutProduct(null);
      onToast(`Stock Out recorded: -${qty} units removed from ${stockOutProduct.name} (${stockOutData.reason})`);
    } catch (err) {
      console.error("Stock out failed:", err);
      setMovementError("Stock out could not be confirmed. Refresh inventory and check the batch before retrying.");
    } finally { movementBusy.current = false; setMovementSaving(false); }
  };

  return (
    <div>
      {inventoryLoadError && <div className="inline-error" role="alert"><span>{inventoryLoadError} Previously loaded stock may be out of date.</span><button className="button soft" onClick={() => void fetchInventory()}>Retry</button></div>}
      <PageHeading
        title="Inventory"
        description="Real-time stock levels, multi-batch tracking, expiry alerts, and stock movements."
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {canAddProduct && (
              <button
                className="button dark"
                data-testid="button-add-product"
                onClick={handleOpenAddProduct}>
                <Plus size={14} /> Add product
              </button>
            )}
          </div>
        }
      />

      {/* ========================================================================= */}
      {/* SUMMARY STRIP */}
      {/* ========================================================================= */}
      <div className="summary-strip">
        <Summary
          label="Total products"
          value={String(items.length)}
          caption={`${totalStockCount} units across shelves`}
        />
        <Summary
          label="Low stock"
          value={String(lowStockItems.length)}
          caption={
            lowStockItems.length > 0 ? "Requires reordering" : "All optimal"
          }
          tone={lowStockItems.length > 0 ? "warning" : undefined}
          action={
            <button
              type="button"
              className="button soft wholesale-summary-action"
              onClick={() => {
                setAlertSearch("");
                setAlertModal("low-stock");
              }}>
              View
            </button>
          }
        />
        <Summary
          label="Expired / Expiring"
          value={String(expiredItems.length + expiringSoonItems.length)}
          caption={
            expiredItems.length > 0
              ? `${expiredItems.length} expired batch(es)`
              : "No expired stock"
          }
          tone={expiredItems.length > 0 ? "warning" : undefined}
          action={
            <button
              type="button"
              className="button soft wholesale-summary-action"
              onClick={() => {
                setAlertSearch("");
                setAlertModal("expired");
              }}>
              View
            </button>
          }
        />
      </div>

      {/* ========================================================================= */}
      {/* MULTI-TAB LAYOUT BELOW SUMMARY BOXES */}
      {/* ========================================================================= */}
      <div className="page-tabs" role="tablist" aria-label="Inventory sections">
        <button
          type="button"
          className={`button ${activeTab === "inventory" ? "dark" : "soft"}`}
          onClick={() => setActiveTab("inventory")}
          data-testid="tab-product-inventory">
          Product Inventory
        </button>
        <button
          type="button"
          className={`button ${activeTab === "movements" ? "dark" : "soft"}`}
          onClick={() => setActiveTab("movements")}
          data-testid="tab-stock-movement-history">
          Stock Movement History
        </button>
      </div>

      {/* ========================================================================= */}
      {/* INVENTORY TABLE & TOOLS */}
      {/* ========================================================================= */}
      {activeTab === "inventory" && (
      <section className="surface-card table-card">
        <div className="table-tools">
          <div className="search-wrap">
            <Search size={15} />
            <input
              aria-label="Search products by name, generic name, code, category, or batch"
              data-testid="input-inventory-search"
              type="search"
              placeholder="Search product name, generic, SKU..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setInventoryPage(1);
              }}
            />
          </div>

          <div className="table-tools-right">
            <select
              className="select"
              aria-label="Filter products by category"
              data-testid="select-inventory-category"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setInventoryPage(1);
              }}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              className="select"
              aria-label="Filter products by status"
              data-testid="select-inventory-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setInventoryPage(1);
              }}>
              <option>All statuses</option>
              <option>In Stock</option>
              <option>Low Stock</option>
              <option>Out of Stock</option>
              <option>Expiring Soon</option>
              <option>Expired</option>
            </select>
          </div>
        </div>

        <div className="table-scroll">
          {isLoading && items.length === 0 ? (
            <div className="empty-state">
              <RefreshCw size={25} className="animate-spin" />
              <div>Loading inventory…</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 210, maxWidth: 210 }}>Product</th>
                  <th>Product Code</th>
                  <th>Category</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ textAlign: "right" }}>Current Stock</th>
                  <th>Batch Number</th>
                  <th>Expiry Date</th>
                  <th>Stock Status</th>
                  <th className="table-action-head">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedInventory.map((product) => {
                  const info = getProductStatusData(product);

                  return (
                    <tr key={product.id} data-testid={`row-product-${product.id}`}>
                      <td style={{ width: 210, maxWidth: 210 }}>
                        <div className="product-cell" style={{ maxWidth: 195 }}>
                          <span className="product-symbol" style={{ flexShrink: 0 }}>
                            <Package size={15} />
                          </span>
                          <div
                            style={{
                              maxWidth: 155,
                              overflowX: "auto",
                              whiteSpace: "nowrap",
                              scrollbarWidth: "thin",
                              paddingBottom: 2,
                            }}>
                            <strong>{product.name}</strong>
                            {product.isDangerousDrug && (
                              <span
                                className="pill danger"
                                style={{ fontSize: 12, padding: "1px 5px", marginLeft: 6 }}>
                                DD
                              </span>
                            )}
                            <div className="muted" style={{ fontSize: 12 }}>
                              {product.genericName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: 12,
                            fontWeight: 600,
                          }}>
                          {product.sku}
                        </span>
                      </td>
                      <td className="muted">{product.category?.trim() || "None"}</td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{product.price}</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong
                          style={{
                            color:
                              info.stock === 0
                                ? "#ef4444"
                                : info.isLowStock
                                  ? "#b45309"
                                  : undefined,
                          }}>
                          {info.stock}
                        </strong>{" "}
                        <span className="muted">units</span>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>
                          {product.batches.length === 0 ? (
                            <span className="muted">No batches</span>
                          ) : product.batches.length === 1 ? (
                            <span>
                              {product.batches[0].batchNumber} (
                              {product.batches[0].quantity}u)
                            </span>
                          ) : (
                            <span
                              title={product.batches
                                .map((b) => `${b.batchNumber}: ${b.quantity}u`)
                                .join(", ")}>
                              {product.batches[0]?.batchNumber} +
                              {product.batches.length - 1} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>
                          <span
                            style={{
                              color: info.isExpired
                                ? "#dc2626"
                                : info.isExpiringSoon
                                  ? "#b45309"
                                  : undefined,
                              fontWeight:
                                info.isExpired || info.isExpiringSoon
                                  ? 600
                                  : 400,
                            }}>
                            {info.primaryExpiry}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}>
                          {info.badges.map((badge, idx) => (
                            <span
                              key={idx}
                              className={`pill ${badge.tone}`}
                              style={{ fontSize: 12, padding: "2px 8px" }}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="table-action-cell">
                        <div className="table-actions">
                          {/* View Details - ALL 3 ROLES */}
                          <button
                            type="button"
                            className="button soft table-action-btn"
                            onClick={() => setViewProduct(product)}
                            title="View product & batches"
                            aria-label={`View ${product.name}`}
                            data-testid={`button-view-${product.id}`}>
                            <Eye size={13} />
                          </button>

                          {/* More Action Dropdown - ADMIN, FRONT DESK, CASHIER */}
                          {(canEditProduct || canAddBatch || canRecordStockIn || canRecordStockOut) && (
                            <DropdownMenuPrimitive.Root>
                              <DropdownMenuPrimitive.Trigger asChild>
                                <button
                                  type="button"
                                  className="button soft table-action-btn"
                                  title="More actions"
                                  aria-label={`More actions for ${product.name}`}
                                  data-testid={`button-more-action-${product.id}`}>
                                  <Ellipsis size={13} />
                                </button>
                              </DropdownMenuPrimitive.Trigger>

                              <DropdownMenuPrimitive.Portal>
                                <DropdownMenuPrimitive.Content
                                  align="end"
                                  sideOffset={4}
                                  className="action-dropdown-menu">
                                  {/* Edit Product - ADMIN & FRONT DESK */}
                                  {canEditProduct && (
                                    <DropdownMenuPrimitive.Item
                                      className="action-dropdown-item"
                                      onSelect={() => handleOpenEditProduct(product)}
                                      title="Edit product information"
                                      data-testid={`button-edit-${product.id}`}>
                                      <Pencil size={12} /> Edit
                                    </DropdownMenuPrimitive.Item>
                                  )}

                                  {/* Add Batch / Add Expiry Date - ADMIN & FRONT DESK */}
                                  {canAddBatch && (
                                    <DropdownMenuPrimitive.Item
                                      className="action-dropdown-item"
                                      onSelect={() => handleOpenAddBatch(product)}
                                      title={
                                        canAddFullBatchInfo
                                          ? "Add product batch information"
                                          : "Add batch expiry date"
                                      }
                                      data-testid={`button-batch-${product.id}`}>
                                      <Plus size={12} />{" "}
                                      {canAddFullBatchInfo ? "Batch" : "Expiry"}
                                    </DropdownMenuPrimitive.Item>
                                  )}

                                  {/* Stock In - ADMIN & CASHIER */}
                                  {canRecordStockIn && (
                                    <DropdownMenuPrimitive.Item
                                      className="action-dropdown-item"
                                      onSelect={() => handleOpenStockIn(product)}
                                      title="Record Stock In"
                                      data-testid={`button-stock-in-${product.id}`}>
                                      <ArrowDownLeft size={12} /> In
                                    </DropdownMenuPrimitive.Item>
                                  )}

                                  {/* Stock Out - ADMIN & CASHIER */}
                                  {canRecordStockOut && (
                                    <DropdownMenuPrimitive.Item
                                      className="action-dropdown-item"
                                      disabled={info.stock <= 0}
                                      onSelect={() => {
                                        if (info.stock > 0) handleOpenStockOut(product);
                                      }}
                                      title={info.stock <= 0 ? "Cannot Stock Out (0 stock)" : "Record Stock Out"}
                                      data-testid={`button-stock-out-${product.id}`}>
                                      <ArrowUpRight size={12} /> Out
                                    </DropdownMenuPrimitive.Item>
                                  )}
                                </DropdownMenuPrimitive.Content>
                              </DropdownMenuPrimitive.Portal>
                            </DropdownMenuPrimitive.Root>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="empty-state">
              <Package size={25} />
              <div>No products match that search or filter.</div>
            </div>
          )}
        </div>
        <div className="wholesale-pagination">
          <span className="muted">
            Page {safeInventoryPage} of {totalInventoryPages}
          </span>
          <button
            type="button"
            className="button soft"
            disabled={safeInventoryPage <= 1}
            onClick={() => setInventoryPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <button
            type="button"
            className="button soft"
            disabled={safeInventoryPage >= totalInventoryPages}
            onClick={() => setInventoryPage((p) => Math.min(totalInventoryPages, p + 1))}>
            Next
          </button>
        </div>
      </section>
      )}

      {/* ========================================================================= */}
      {/* STOCK MOVEMENT HISTORY TAB (POS STOCK MOVEMENTS) */}
      {/* ========================================================================= */}
      {activeTab === "movements" && (
        <section className="surface-card table-card">
          <div className="table-tools">
            <div className="search-wrap">
              <Search size={15} />
              <input
                type="search"
                placeholder="Search product, SKU, TRX #, or cashier..."
                value={movementSearch}
                onChange={(e) => {
                  setMovementSearch(e.target.value);
                  setMovementPage(1);
                }}
                data-testid="input-movement-search"
              />
            </div>
            <div className="table-tools-right">
              <select
                className="select"
                aria-label="Filter movements by movement type"
                value={movementTypeFilter}
                onChange={(e) => {
                  setMovementTypeFilter(e.target.value);
                  setMovementPage(1);
                }}
                data-testid="select-movement-type">
                <option value="All movement types">All movement types</option>
                <option value="POS Sale">POS Sale</option>
                <option value="Stock In">Stock In</option>
                <option value="Stock Out">Stock Out</option>
              </select>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Reference</th>
                  <th style={{ width: 210, maxWidth: 210 }}>Product</th>
                  <th>Product Code</th>
                  <th>Movement Type</th>
                  <th style={{ textAlign: "right" }}>Quantity</th>
                  <th>Processed By</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMovements.map((mov) => (
                  <tr key={mov.id} data-testid={`row-movement-${mov.id}`}>
                    <td className="muted">{mov.formattedDate}</td>
                    <td>
                      <strong>{mov.reference}</strong>
                    </td>
                    <td style={{ width: 210, maxWidth: 210 }}>
                      <div className="product-cell" style={{ maxWidth: 195 }}>
                        <span className="product-symbol" style={{ flexShrink: 0 }}>
                          <Package size={15} />
                        </span>
                        <div
                          style={{
                            maxWidth: 155,
                            overflowX: "auto",
                            whiteSpace: "nowrap",
                            scrollbarWidth: "thin",
                            paddingBottom: 2,
                          }}>
                          <strong>{mov.productName}</strong>
                          {mov.genericName && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {mov.genericName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          fontWeight: 600,
                        }}>
                        {mov.sku}
                      </span>
                    </td>
                    <td>
                      <span className="pill warning" style={{ fontSize: 12 }}>
                        {mov.movementType}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong style={{ color: "#ef4444" }}>-{mov.quantity}</strong>{" "}
                      <span className="muted">units</span>
                    </td>
                    <td>{mov.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMovements.length === 0 && (
              <div className="empty-state">
                <Activity size={25} />
                <div>No stock movements found matching your search or filter.</div>
              </div>
            )}
          </div>
          <div className="wholesale-pagination">
            <span className="muted">
              Page {safeMovementPage} of {totalMovementPages}
            </span>
            <button
              type="button"
              className="button soft"
              disabled={safeMovementPage <= 1}
              onClick={() => setMovementPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <button
              type="button"
              className="button soft"
              disabled={safeMovementPage >= totalMovementPages}
              onClick={() => setMovementPage((p) => Math.min(totalMovementPages, p + 1))}>
              Next
            </button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 1. VIEW PRODUCT DETAILS MODAL (ALL ROLES) */}
      {/* ========================================================================= */}
      {viewProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setViewProduct(null)}
            data-testid="modal-view-product">
            <div
              className="modal"
              style={{ width: "min(640px, 100%)" }}>
              <div className="modal-header">
                <div>
                  <h2>{viewProduct.name}</h2>
                  <p className="modal-sub">
                    Generic: {viewProduct.genericName} • Code: {viewProduct.sku}
                  </p>
                  {viewProduct.isDangerousDrug && (
                    <span
                      className="pill danger"
                      style={{ fontSize: 12, padding: "2px 8px", marginTop: 4, display: "inline-block" }}>
                      DANGEROUS DRUG
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setViewProduct(null)}>
                  <X size={16} />
                </button>
              </div>

              {/* Product Info Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 10,
                  marginBottom: 16,
                }}>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    Category
                  </div>
                  <strong style={{ fontSize: 13 }}>{viewProduct.category}</strong>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px"
                  }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                      Unit Price
                    </div>
                    <strong style={{ fontSize: 13 }}>{viewProduct.price}</strong>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                      Cost Price
                    </div>
                    <strong style={{ fontSize: 13 }}>{viewProduct.cost}</strong>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                      VAT treatment
                    </div>
                    <strong style={{ fontSize: 13 }}>
                      {viewProduct.isVatExempt === true ? "VAT-exempt" : viewProduct.isVatExempt === false ? "VATable" : "Not classified"}
                    </strong>
                  </div>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    Reorder Level
                  </div>
                  <strong style={{ fontSize: 13 }}>
                    {viewProduct.reorder} units
                  </strong>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    Total Stock
                  </div>
                  <strong style={{ fontSize: 13 }}>
                    {getProductTotalStock(viewProduct)} units
                  </strong>
                </div>
              </div>

              {/* Batches Table */}
              <div className="modal-section">
                <h4>Recorded Batches &amp; Expiry Dates ({viewProduct.batches.length})</h4>
                <div
                  style={{
                    overflowX: "auto",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 11,
                  }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Batch #</th>
                        <th style={{ textAlign: "right" }}>Quantity</th>
                        <th>Expiry Date</th>
                        <th>Status</th>
                        <th>Mfg Date</th>
                        <th>Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewProduct.batches.map((b) => {
                        const badges = getBatchStatusData(b, viewProduct);
                        return (
                          <tr key={b.batchNumber}>
                            <td>
                              <strong>{b.batchNumber}</strong>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <strong>{b.quantity}</strong> units
                            </td>
                            <td>{b.expiryDate}</td>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}>
                                {badges.map((badge, idx) => (
                                  <span
                                    key={idx}
                                    className={`pill ${badge.tone}`}
                                    style={{ fontSize: 12, padding: "1px 6px" }}>
                                    {badge.label}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="muted">{b.mfgDate || "—"}</td>
                            <td className="muted">{b.supplier || "—"}</td>
                          </tr>
                        );
                      })}
                      {viewProduct.batches.length === 0 && (
                        <tr>
                          <TableEmptyState colSpan={6} icon={Package}>
                            No batches recorded for this product.
                          </TableEmptyState>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>


            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 2. ADD PRODUCT MODAL (ADMIN & FRONT DESK) */}
      {/* ========================================================================= */}
      {(isAddProductOpen || editProduct) && <ProductDialog
        key={editProduct?.id ?? "new"}
        product={editProduct ?? undefined}
        categories={availableCategories}
        suppliers={suppliers.map((supplier) => supplier.name)}
        onClose={() => { setIsAddProductOpen(false); setEditProduct(null); }}
        onSaved={handleProductSaved}
      />}

      {/* ========================================================================= */}
      {/* 4. ADD BATCH / BATCH EXPIRY DATE MODAL (ADMIN & FRONT DESK) */}
      {/* ========================================================================= */}
      {batchProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setBatchProduct(null)}
            data-testid="modal-add-batch">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h2>
                    {isAdmin
                      ? "Add Product Batch Information"
                      : "Add Batch Expiry Date"}
                  </h2>
                  <p className="modal-sub">
                    For {batchProduct.name} ({batchProduct.sku})
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setBatchProduct(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveAddBatch}>
                <div className="form-grid">
                  <div className="field">
                    <label>Batch Number *</label>
                    <input
                      required
                      placeholder="e.g. B2026-03"
                      maxLength={100}
                      value={newBatchData.batchNumber}
                      onChange={(e) =>
                        setNewBatchData({
                          ...newBatchData,
                          batchNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      max={MAX_STOCK_MOVEMENT_QUANTITY}
                      step="1"
                      required
                      value={newBatchData.quantity}
                      onChange={(e) =>
                        setNewBatchData({
                          ...newBatchData,
                          quantity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className={canAddFullBatchInfo ? "field" : "field full-width"}>
                    <label>Expiry Date *</label>
                    <input
                      type="date"
                      required
                      value={newBatchData.expiryDate}
                      onChange={(e) =>
                        setNewBatchData({
                          ...newBatchData,
                          expiryDate: e.target.value,
                        })
                      }
                    />
                  </div>
                  {canAddFullBatchInfo && (
                    <>
                      <div className="field">
                        <label>Date Received</label>
                        <input
                          type="date"
                          value={newBatchData.dateReceived}
                          onChange={(e) =>
                            setNewBatchData({
                              ...newBatchData,
                              dateReceived: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Manufacturing Date</label>
                        <input
                          type="date"
                          value={newBatchData.mfgDate}
                          onChange={(e) =>
                            setNewBatchData({
                              ...newBatchData,
                              mfgDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="field full-width">
                        <label>Supplier</label>
                        <select
                          value={newBatchData.supplier}
                          onChange={(e) =>
                            setNewBatchData({
                              ...newBatchData,
                              supplier: e.target.value,
                            })
                          }>
                          <option value="">Select supplier (optional)</option>
                          {suppliers.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {movementSaving && <p role="status">Saving stock change…</p>}
                {movementError && <div className="inline-error" role="alert">{movementError}</div>}
                <div className="modal-actions">
                  <button type="submit" disabled={movementSaving} className="button dark">
                    Record Batch
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 5. RECORD STOCK IN MODAL (ADMIN & CASHIER) */}
      {/* ========================================================================= */}
      {stockInProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setStockInProduct(null)}
            data-testid="modal-stock-in">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h2>Record Stock In</h2>
                  <p className="modal-sub">
                    Add inventory to {stockInProduct.name} ({stockInProduct.sku})
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setStockInProduct(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveStockIn}>
                <div className="form-grid">
                  <div className="field full-width">
                    <label>Target Batch *</label>
                    <select
                      required
                      value={stockInData.batchNumber}
                      onChange={(e) =>
                        setStockInData({
                          ...stockInData,
                          batchNumber: e.target.value,
                        })
                      }>
                      <option value="">{stockInProduct.batches.length ? "Select an existing batch" : "No batches — use Add Batch first"}</option>
                      {stockInProduct.batches.map((b) => (
                        <option key={b.batchNumber} value={b.batchNumber}>
                          {b.batchNumber} (Current: {b.quantity} units, Exp:{" "}
                          {b.expiryDate})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Quantity to Add *</label>
                    <input
                      type="number"
                      min="1"
                      max={MAX_STOCK_MOVEMENT_QUANTITY}
                      step="1"
                      required
                      value={stockInData.quantity}
                      onChange={(e) =>
                        setStockInData({
                          ...stockInData,
                          quantity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Date *</label>
                    <input
                      type="date"
                      required
                      value={stockInData.date}
                      onChange={(e) =>
                        setStockInData({ ...stockInData, date: e.target.value })
                      }
                    />
                  </div>

                  <div className="field full-width">
                    <label>Reason / Reference *</label>
                    <input
                      required
                      placeholder="e.g. Procurement Delivery, Restock, Return"
                      value={stockInData.reason}
                      onChange={(e) =>
                        setStockInData({ ...stockInData, reason: e.target.value })
                      }
                    />
                  </div>
                </div>

                {movementSaving && <p role="status">Saving stock change…</p>}
                {movementError && <div className="inline-error" role="alert">{movementError}</div>}
                <div className="modal-actions">
                  <button type="submit" disabled={movementSaving} className="button dark">
                    <ArrowDownLeft size={14} /> Confirm Stock In
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 6. RECORD STOCK OUT MODAL (ADMIN & CASHIER) */}
      {/* ========================================================================= */}
      {stockOutProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setStockOutProduct(null)}
            data-testid="modal-stock-out">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h2>Record Stock Out</h2>
                  <p className="modal-sub">
                    Deduct inventory from {stockOutProduct.name} (
                    {stockOutProduct.sku})
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setStockOutProduct(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveStockOut}>
                <div className="form-grid">
                  <div className="field full-width">
                    <label>Source Batch *</label>
                    <select
                      value={stockOutData.batchNumber}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
                          batchNumber: e.target.value,
                        })
                      }>
                      {stockOutProduct.batches.map((b) => (
                        <option key={b.batchNumber} value={b.batchNumber}>
                          {b.batchNumber} (Available: {b.quantity} units, Exp:{" "}
                          {b.expiryDate})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Quantity to Deduct *</label>
                    <input
                      type="number"
                      min="1"
                      max={Math.min(
                        MAX_STOCK_MOVEMENT_QUANTITY,
                        stockOutProduct.batches.find(
                          (batch) => batch.batchNumber === stockOutData.batchNumber,
                        )?.quantity || MAX_STOCK_MOVEMENT_QUANTITY,
                      )}
                      step="1"
                      required
                      value={stockOutData.quantity}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
                          quantity: e.target.value,
                        })
                      }
                    />
                    <span className="field-hint">Whole units only</span>
                  </div>
                  <div className="field">
                    <label>Date *</label>
                    <input
                      type="date"
                      required
                      value={stockOutData.date}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
                          date: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field full-width">
                    <label>Reason *</label>
                    <select
                      value={stockOutData.reason}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
                          reason: e.target.value,
                        })
                      }>
                      <option value="Dispensed / Sales">Dispensed / Sales</option>
                      <option value="Damaged / Broken">Damaged / Broken</option>
                      <option value="Expired Product Disposal">
                        Expired Product Disposal
                      </option>
                      <option value="Inventory Audit Adjustment">
                        Inventory Audit Adjustment
                      </option>
                      <option value="Internal Use / Clinic Transfer">
                        Internal Use / Clinic Transfer
                      </option>
                    </select>
                  </div>
                </div>

                {movementSaving && <p role="status">Saving stock change…</p>}
                {movementError && <div className="inline-error" role="alert">{movementError}</div>}
                <div className="modal-actions">
                  <button
                    type="submit" disabled={movementSaving}
                    className="button dark"
                    style={{ background: "#dc2626", borderColor: "#dc2626" }}>
                    <ArrowUpRight size={14} /> Confirm Stock Out
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 7. LOW STOCK PRODUCTS MODAL */}
      {/* ========================================================================= */}
      {alertModal === "low-stock" &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setAlertModal(null)}
            data-testid="modal-low-stock-products">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h2>Low Stock Products ({lowStockItems.length})</h2>
                  <p className="modal-sub">
                    Products currently at or below minimum reorder thresholds.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setAlertModal(null)}>
                  <X size={15} />
                </button>
              </div>

              <div style={{ padding: "0 0 12px 0" }}>
                <div className="search-wrap" style={{ width: "100%", marginBottom: 12, height: 38 }}>
                  <Search size={14} style={{ flexShrink: 0 }} />
                  <input
                    type="search"
                    placeholder="Search low stock product name, generic, SKU..."
                    value={alertSearch}
                    onChange={(e) => setAlertSearch(e.target.value)}
                    style={{ border: "none", background: "transparent", boxShadow: "none", outline: "none", padding: 0, height: "100%", fontSize: 12 }}
                  />
                </div>

                <div
                  className="table-scroll"
                  style={{
                    maxHeight: 380,
                    overflowY: "auto",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 10,
                  }}>
                  <table className="data-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Product &amp; SKU</th>
                        <th>Category</th>
                        <th style={{ textAlign: "right" }}>Stock Left</th>
                        <th style={{ textAlign: "right" }}>Reorder Level</th>
                        <th>Status</th>
                        <th style={{ textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockItems
                        .filter((p) => {
                          if (!alertSearch) return true;
                          const q = alertSearch.toLowerCase();
                          return (
                            p.name.toLowerCase().includes(q) ||
                            (p.genericName && p.genericName.toLowerCase().includes(q)) ||
                            p.sku.toLowerCase().includes(q)
                          );
                        })
                        .map((p) => {
                          const stock = getProductTotalStock(p);
                          return (
                            <tr key={p.id}>
                              <td>
                                <strong style={{ display: "block" }}>{p.name}</strong>
                                <span className="muted" style={{ fontSize: 12 }}>
                                  {p.genericName ? `${p.genericName} • ` : ""}{p.sku}
                                </span>
                              </td>
                              <td className="muted" style={{ fontSize: 12 }}>{p.category}</td>
                              <td style={{ textAlign: "right" }}>
                                <strong style={{ color: stock === 0 ? "#dc2626" : "#b45309" }}>
                                  {stock} units
                                </strong>
                              </td>
                              <td style={{ textAlign: "right" }} className="muted">
                                {p.reorder}
                              </td>
                              <td>
                                <span
                                  className={`pill ${stock === 0 ? "danger" : "warning"}`}
                                  style={{ fontSize: 12 }}>
                                  {stock === 0 ? "Out of Stock" : "Low Stock"}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <button
                                  type="button"
                                  className="button soft"
                                  style={{ padding: "3px 8px", fontSize: 12 }}
                                  onClick={() => {
                                    setAlertModal(null);
                                    handleOpenStockIn(p);
                                  }}>
                                  <ArrowDownToLine size={12} style={{ marginRight: 4 }} /> Stock In
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      {lowStockItems.length === 0 && (
                        <tr>
                          <TableEmptyState colSpan={6} icon={Package}>
                            All products have optimal stock levels.
                          </TableEmptyState>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 8. EXPIRED & EXPIRING PRODUCTS MODAL */}
      {/* ========================================================================= */}
      {alertModal === "expired" &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setAlertModal(null)}
            data-testid="modal-expired-products">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h2>
                    Expired &amp; Expiring Batches ({expiredItems.length + expiringSoonItems.length})
                  </h2>
                  <p className="modal-sub">
                    Batches that are already expired or approaching expiration within 60 days.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setAlertModal(null)}>
                  <X size={15} />
                </button>
              </div>

              <div style={{ padding: "0 0 12px 0" }}>
                <div className="search-wrap" style={{ width: "100%", marginBottom: 12, height: 38 }}>
                  <Search size={14} style={{ flexShrink: 0 }} />
                  <input
                    type="search"
                    placeholder="Search product name, SKU, or batch number..."
                    value={alertSearch}
                    onChange={(e) => setAlertSearch(e.target.value)}
                    style={{ border: "none", background: "transparent", boxShadow: "none", outline: "none", padding: 0, height: "100%", fontSize: 12 }}
                  />
                </div>

                <div
                  className="table-scroll"
                  style={{
                    maxHeight: 380,
                    overflowY: "auto",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 10,
                  }}>
                  <table className="data-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Product &amp; SKU</th>
                        <th>Batch #</th>
                        <th style={{ textAlign: "right" }}>Quantity</th>
                        <th>Expiry Date</th>
                        <th>Status</th>
                        <th style={{ textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiredItems
                        .flatMap((p) => {
                          const info = getProductStatusData(p);
                          return info.expiredBatches.map((b) => ({ p, b, isExpired: true }));
                        })
                        .concat(
                          expiringSoonItems.flatMap((p) => {
                            const info = getProductStatusData(p);
                            return info.expiringSoonBatches.map((b) => ({ p, b, isExpired: false }));
                          }),
                        )
                        .filter(({ p, b }) => {
                          if (!alertSearch) return true;
                          const q = alertSearch.toLowerCase();
                          return (
                            p.name.toLowerCase().includes(q) ||
                            p.sku.toLowerCase().includes(q) ||
                            b.batchNumber.toLowerCase().includes(q)
                          );
                        })
                        .map(({ p, b, isExpired }) => (
                          <tr key={`${p.id}-${b.batchNumber}`}>
                            <td>
                              <strong style={{ display: "block" }}>{p.name}</strong>
                              <span className="muted" style={{ fontSize: 12 }}>{p.sku}</span>
                            </td>
                            <td>
                              <code>{b.batchNumber}</code>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <strong>{b.quantity} units</strong>
                            </td>
                            <td style={{ color: isExpired ? "#dc2626" : "#b45309", fontWeight: 600 }}>
                              {b.expiryDate}
                            </td>
                            <td>
                              <span
                                className={`pill ${isExpired ? "danger" : "warning"}`}
                                style={{ fontSize: 12 }}>
                                {isExpired ? "EXPIRED" : "EXPIRING SOON"}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="button soft"
                                style={{ padding: "3px 8px", fontSize: 12 }}
                                onClick={() => {
                                  setAlertModal(null);
                                  handleOpenStockOut(p);
                                }}>
                                <ArrowUpRight size={12} style={{ marginRight: 4 }} /> Dispose
                              </button>
                            </td>
                          </tr>
                        ))}
                      {expiredItems.length === 0 && expiringSoonItems.length === 0 && (
                        <tr>
                          <TableEmptyState colSpan={6} icon={Package}>
                            No expired or expiring products found in inventory.
                          </TableEmptyState>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
