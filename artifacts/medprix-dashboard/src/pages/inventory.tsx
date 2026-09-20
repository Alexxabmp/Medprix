import { useState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
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
  Tag,
  Trash2,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import { suppliers } from "@/lib/data";
import type { ProductItem, ProductBatch, ToastFn } from "@/lib/types";

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
  const isFrontDesk = role === "frontDesk";
  const isCashier = role === "cashier";

  const canViewAlerts = isAdmin || isFrontDesk;
  const canAddProduct = isAdmin || isFrontDesk;
  const canEditProduct = isAdmin || isFrontDesk;
  const canAddBatch = isAdmin || isFrontDesk;
  const canAddFullBatchInfo = isAdmin;
  const canRecordStockIn = isAdmin || isCashier;
  const canRecordStockOut = isAdmin || isCashier;

  // Inventory items state
  const [items, setItems] = useState<ProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [categoryFilter, setCategoryFilter] = useState("All categories");

  // Fetch inventory from backend
  const fetchInventory = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("http://localhost:5000/api/inventory");
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.products && Array.isArray(data.products)) {
          setItems(data.products);
          setIsBackendConnected(true);
          return;
        }
      }
      setIsBackendConnected(false);
    } catch (err) {
      console.warn("Backend not reachable, using offline cache:", err);
      setIsBackendConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Modals state
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<ProductItem | null>(null);
  const [editProduct, setEditProduct] = useState<ProductItem | null>(null);
  const [batchProduct, setBatchProduct] = useState<ProductItem | null>(null);
  const [stockInProduct, setStockInProduct] = useState<ProductItem | null>(null);
  const [stockOutProduct, setStockOutProduct] = useState<ProductItem | null>(null);

  // Forms state
  const [newProd, setNewProd] = useState({
    name: "",
    genericName: "",
    sku: "",
    category: "Pain relief",
    price: "₱",
    cost: "₱",
    isDangerousDrug: false,
    reorder: "20",
    batchNumber: "B2026-01",
    quantity: "50",
    expiryDate: "2027-12-31",
    mfgDate: "2025-12-01",
    dateReceived: "2025-12-10",
    supplier: "Southstar Distribution",
  });

  const [editProdData, setEditProdData] = useState({
    name: "",
    genericName: "",
    sku: "",
    category: "Pain relief",
    price: "",
    cost: "",
    isDangerousDrug: false,
    reorder: "",
  });

  const [newBatchData, setNewBatchData] = useState({
    batchNumber: "",
    quantity: "",
    expiryDate: "",
    mfgDate: "2025-01-01",
    dateReceived: new Date().toISOString().slice(0, 10),
    supplier: "Southstar Distribution",
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
        setEditProduct(null);
        setBatchProduct(null);
        setStockInProduct(null);
        setStockOutProduct(null);
        setIsAddProductOpen(false);
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
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      product.name.toLowerCase().includes(q) ||
      product.genericName.toLowerCase().includes(q) ||
      product.sku.toLowerCase().includes(q) ||
      (product.category || "").toLowerCase().includes(q) ||
      product.batches.some((b) => b.batchNumber.toLowerCase().includes(q));

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

  // Handlers
  const handleOpenAddProduct = () => {
    setNewProd({
      name: "",
      genericName: "",
      sku: `MED-${Math.floor(1000 + Math.random() * 9000)}`,
      category: availableCategories[0] || "",
      price: "₱10.00",
      cost: "₱6.00",
      isDangerousDrug: false,
      reorder: "20",
      batchNumber: `B${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`,
      quantity: "50",
      expiryDate: "2027-12-31",
      mfgDate: "2025-12-01",
      dateReceived: new Date().toISOString().slice(0, 10),
      supplier: "Southstar Distribution",
    });
    setIsAddProductOpen(true);
  };

  const handleSaveNewProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProd.name.trim() || !newProd.sku.trim()) {
      onToast("Product name and code (SKU) are required");
      return;
    }

    const priceFormatted = newProd.price.startsWith("₱")
      ? newProd.price
      : `₱${parseFloat(newProd.price.replace(/[^\d.]/g, "") || "0").toFixed(2)}`;

    const costFormatted = newProd.cost.startsWith("₱")
      ? newProd.cost
      : `₱${parseFloat(newProd.cost.replace(/[^\d.]/g, "") || "0").toFixed(2)}`;

    const parsedQty = parseInt(newProd.quantity, 10) || 0;
    const parsedReorder = parseInt(newProd.reorder, 10) || 10;

    const payload = {
      name: newProd.name.trim(),
      genericName: newProd.genericName.trim() || newProd.name.trim(),
      sku: newProd.sku.trim().toUpperCase(),
      category: newProd.category.trim(),
      price: priceFormatted,
      costPrice: costFormatted,
      isDangerousDrug: newProd.isDangerousDrug,
      reorder: parsedReorder,
      batchNumber: newProd.batchNumber.trim().toUpperCase() || "B001",
      quantity: parsedQty,
      expiryDate: newProd.expiryDate || "2027-12-31",
      mfgDate: newProd.mfgDate,
      dateReceived: newProd.dateReceived,
      supplier: newProd.supplier,
    };

    try {
      const res = await fetch("http://localhost:5000/api/inventory/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onToast(data?.error || "Failed to add product");
        return;
      }

      await fetchInventory();
      setIsAddProductOpen(false);
      onToast(`Added product "${payload.name}" with initial batch`);
    } catch (err) {
      console.error("Add product failed:", err);
      onToast("Couldn't reach the server. Product was not saved.");
    }
  };

  const handleOpenEditProduct = (product: ProductItem) => {
    setEditProdData({
      name: product.name,
      genericName: product.genericName || "",
      sku: product.sku,
      category: product.category,
      price: product.price,
      cost: product.cost,
      isDangerousDrug: product.isDangerousDrug,
      reorder: String(product.reorder),
    });
    setEditProduct(product);
  };

  const handleSaveEditProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editProduct) return;

    const priceFormatted = editProdData.price.startsWith("₱")
      ? editProdData.price
      : `₱${parseFloat(editProdData.price.replace(/[^\d.]/g, "") || "0").toFixed(2)}`;

    const costFormatted = editProdData.cost.startsWith("₱")
      ? editProdData.cost
      : `₱${parseFloat(editProdData.cost.replace(/[^\d.]/g, "") || "0").toFixed(2)}`;

    const payload = {
      name: editProdData.name.trim(),
      genericName: editProdData.genericName.trim(),
      sku: editProdData.sku.trim().toUpperCase(),
      category: editProdData.category.trim(),
      price: priceFormatted,
      costPrice: costFormatted,
      isDangerousDrug: editProdData.isDangerousDrug,
      reorder: parseInt(editProdData.reorder, 10) || 10,
    };

    try {
      const res = await fetch(`http://localhost:5000/api/inventory/products/${editProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onToast(data?.error || "Failed to update product");
        return;
      }

      await fetchInventory();
      setEditProduct(null);
      onToast(`Updated product details for "${editProdData.name}"`);
    } catch (err) {
      console.error("Edit product failed:", err);
      setItems((current) =>
        current.map((product) =>
          product.id === editProduct.id
            ? updateProductStock({
              ...product,
              name: payload.name,
              genericName: payload.genericName || payload.name,
              sku: payload.sku,
              category: payload.category,
              price: priceFormatted,
              cost: costFormatted,
              isDangerousDrug: payload.isDangerousDrug,
              reorder: payload.reorder,
            })
            : product,
        ),
      );
      setEditProduct(null);
      setIsBackendConnected(false);
      onToast(`Updated product details for "${editProdData.name}" offline`);
    }
  };

  const handleOpenAddBatch = (product: ProductItem) => {
    setNewBatchData({
      batchNumber: `B${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`,
      quantity: "50",
      expiryDate: "2028-06-30",
      mfgDate: "2026-01-01",
      dateReceived: new Date().toISOString().slice(0, 10),
      supplier: "Southstar Distribution",
    });
    setBatchProduct(product);
  };

  const handleSaveAddBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!batchProduct || !newBatchData.batchNumber.trim()) {
      onToast("Batch number is required");
      return;
    }

    const parsedQty = parseInt(newBatchData.quantity, 10) || 0;
    const newBatch = {
      batchNumber: newBatchData.batchNumber.trim().toUpperCase(),
      quantity: parsedQty,
      expiryDate: newBatchData.expiryDate || "2028-06-30",
      mfgDate: newBatchData.mfgDate,
      dateReceived: newBatchData.dateReceived,
      supplier: newBatchData.supplier,
    };

    try {
      const res = await fetch(`http://localhost:5000/api/inventory/products/${batchProduct.id}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBatch),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onToast(data?.error || "Failed to add batch");
        return;
      }

      await fetchInventory();
      setBatchProduct(null);
      onToast(`Added batch ${newBatch.batchNumber} (${parsedQty} units) to ${batchProduct.name}`);
    } catch (err) {
      console.error("Add batch failed:", err);
      onToast("Couldn't reach the server. Batch was not saved.");
    }
  };

  const handleOpenStockIn = (product: ProductItem) => {
    setStockInData({
      batchNumber: product.batches[0]?.batchNumber || "B001",
      quantity: "20",
      date: new Date().toISOString().slice(0, 10),
      reason: "Procurement Delivery",
    });
    setStockInProduct(product);
  };

  const handleSaveStockIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!stockInProduct) return;
    const qty = parseInt(stockInData.quantity, 10);
    if (!qty || qty <= 0) {
      onToast("Please enter a valid positive quantity");
      return;
    }

    try {
      const res = await fetch(`http://localhost:5000/api/inventory/products/${stockInProduct.id}/stock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchNumber: stockInData.batchNumber,
          quantity: qty,
          reason: stockInData.reason,
          date: stockInData.date,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onToast(data?.error || "Failed to record stock in");
        return;
      }

      await fetchInventory();
      setStockInProduct(null);
      onToast(`Stock In recorded: +${qty} units added to ${stockInProduct.name} (${stockInData.reason})`);
    } catch (err) {
      console.error("Stock in failed:", err);
      onToast("Couldn't reach the server. Stock in was not recorded.");
    }
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
    setStockOutProduct(product);
  };

  const handleSaveStockOut = async (e: FormEvent) => {
    e.preventDefault();
    if (!stockOutProduct) return;
    const qty = parseInt(stockOutData.quantity, 10);
    if (!qty || qty <= 0) {
      onToast("Please enter a valid positive quantity");
      return;
    }

    const targetBatch = stockOutProduct.batches.find(
      (b) => b.batchNumber === stockOutData.batchNumber,
    );

    if (!targetBatch || targetBatch.quantity < qty) {
      onToast(`Insufficient batch stock. Available in ${stockOutData.batchNumber}: ${targetBatch?.quantity || 0} units`);
      return;
    }

    try {
      const res = await fetch(`http://localhost:5000/api/inventory/products/${stockOutProduct.id}/stock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchNumber: stockOutData.batchNumber,
          quantity: qty,
          reason: stockOutData.reason,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onToast(data?.error || "Failed to record stock out");
        return;
      }

      await fetchInventory();
      setStockOutProduct(null);
      onToast(`Stock Out recorded: -${qty} units removed from ${stockOutProduct.name} (${stockOutData.reason})`);
    } catch (err) {
      console.error("Stock out failed:", err);
      onToast("Couldn't reach the server. Stock out was not recorded.");
    }
  };

  return (
    <div>
      <PageHeading
        title="Inventory"
        description="Real-time stock levels, multi-batch tracking, expiry alerts, and stock movements."
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="button soft"
              style={{ fontSize: 11, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={fetchInventory}
              title="Sync inventory with backend database"
              data-testid="button-sync-inventory"
            >
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
              <span>{isBackendConnected ? "Backend Online" : "Sync Inventory"}</span>
            </button>
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
      {/* ALERTS SECTION (ADMIN & FRONT DESK ONLY) */}
      {/* ========================================================================= */}
      {canViewAlerts && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}>
          {/* Low Stock Alert */}
          {lowStockItems.length > 0 && (
            <div
              className="surface-card"
              style={{
                padding: "14px 18px",
                background: "hsl(var(--surface))",
              }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "hsl(var(--foreground))",
                    fontSize: 13,
                  }}>
                  <AlertTriangle size={15} />
                  <span>LOW STOCK ALERT ({lowStockItems.length})</span>
                </div>
                <button
                  type="button"
                  className="button soft"
                  style={{ padding: "3px 8px", fontSize: 10 }}
                  onClick={() => setStatusFilter("Low Stock")}>
                  Filter Low Stock
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lowStockItems.slice(0, 3).map((p) => {
                  const stock = getProductTotalStock(p);
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        background: "hsl(var(--surface-soft))",
                        padding: "6px 10px",
                        borderRadius: 6,
                      }}>
                      <div>
                        <strong>{p.name}</strong>{" "}
                        <span className="muted" style={{ fontSize: 10 }}>
                          ({p.sku})
                        </span>
                      </div>
                      <div>
                        <span
                          style={{
                            color: stock === 0 ? "#ef4444" : "#b45309",
                            fontWeight: 700,
                          }}>
                          {stock} units left
                        </span>
                        <span
                          className="muted"
                          style={{ fontSize: 10, marginLeft: 6 }}>
                          (Reorder: {p.reorder})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expired / Expiring Products Alert */}
          {(expiredItems.length > 0 || expiringSoonItems.length > 0) && (
            <div
              className="surface-card"
              style={{
                padding: "14px 18px",
                background: "hsl(var(--surface))",
              }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "hsl(var(--foreground))",
                    fontSize: 13,
                  }}>
                  <AlertCircle size={15} />
                  <span>
                    EXPIRED &amp; EXPIRING PRODUCTS (
                    {expiredItems.length + expiringSoonItems.length})
                  </span>
                </div>
                <button
                  type="button"
                  className="button soft"
                  style={{ padding: "3px 8px", fontSize: 10 }}
                  onClick={() => setStatusFilter("Expired")}>
                  Filter Expired
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {expiredItems.map((p) => {
                  const info = getProductStatusData(p);
                  return info.expiredBatches.map((b) => (
                    <div
                      key={`${p.id}-${b.batchNumber}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        background: "hsl(var(--surface-soft))",
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                      }}>
                      <div>
                        <strong>{p.name}</strong>{" "}
                        <span
                          className="pill danger"
                          style={{ fontSize: 9, padding: "1px 6px", marginLeft: 4 }}>
                          EXPIRED
                        </span>
                        <div className="muted" style={{ fontSize: 10 }}>
                          Batch: {b.batchNumber} • {b.quantity} units
                        </div>
                      </div>
                      <div
                        style={{
                          color: "#dc2626",
                          fontWeight: 600,
                          fontSize: 11,
                        }}>
                        Expired: {b.expiryDate}
                      </div>
                    </div>
                  ));
                })}
                {expiringSoonItems.map((p) => {
                  const info = getProductStatusData(p);
                  return info.expiringSoonBatches.map((b) => (
                    <div
                      key={`${p.id}-${b.batchNumber}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        background: "hsl(var(--surface-soft))",
                        padding: "6px 10px",
                        borderRadius: 6,
                      }}>
                      <div>
                        <strong>{p.name}</strong>{" "}
                        <span
                          className="pill warning"
                          style={{ fontSize: 9, padding: "1px 6px", marginLeft: 4 }}>
                          EXPIRING SOON
                        </span>
                        <div className="muted" style={{ fontSize: 10 }}>
                          Batch: {b.batchNumber} • {b.quantity} units
                        </div>
                      </div>
                      <div
                        style={{
                          color: "#b45309",
                          fontWeight: 600,
                          fontSize: 11,
                        }}>
                        Expires: {b.expiryDate}
                      </div>
                    </div>
                  ));
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
        />
      </div>

      {/* ========================================================================= */}
      {/* INVENTORY TABLE & TOOLS */}
      {/* ========================================================================= */}
      <section className="surface-card table-card">
        <div
          className="table-tools"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "nowrap",
          }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: 260, height: 39 }}>
            <Search size={15} />
            <input
              data-testid="input-inventory-search"
              type="search"
              placeholder="Search product name, generic, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="select"
            data-testid="select-inventory-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: 190, minWidth: 190, maxWidth: 190, flex: "0 0 190px", height: 39 }}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="select"
            data-testid="select-inventory-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 190, minWidth: 190, maxWidth: 190, flex: "0 0 190px", height: 39 }}>
            <option>All statuses</option>
            <option>In Stock</option>
            <option>Low Stock</option>
            <option>Out of Stock</option>
            <option>Expiring Soon</option>
            <option>Expired</option>
          </select>
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
                  <th>Product</th>
                  <th>Product Code</th>
                  <th>Category</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ textAlign: "right" }}>Current Stock</th>
                  <th>Batch Number</th>
                  <th>Expiry Date</th>
                  <th>Stock Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const info = getProductStatusData(product);

                  return (
                    <tr key={product.id} data-testid={`row-product-${product.id}`}>
                      <td>
                        <div className="product-cell">
                          <span className="product-symbol">
                            <Package size={15} />
                          </span>
                          <div>
                            <strong>{product.name}</strong>
                            {product.isDangerousDrug && (
                              <span
                                className="pill danger"
                                style={{ fontSize: 8, padding: "1px 5px", marginLeft: 6 }}>
                                DD
                              </span>
                            )}
                            <div className="muted" style={{ fontSize: 10 }}>
                              {product.genericName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: 11,
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
                        <div style={{ fontSize: 11 }}>
                          {product.batches.length === 1 ? (
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
                        <div style={{ fontSize: 11 }}>
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
                              style={{ fontSize: 10, padding: "2px 8px" }}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            justifyContent: "flex-end",
                            alignItems: "center",
                            whiteSpace: "nowrap",
                          }}>
                          {/* View Details - ALL 3 ROLES */}
                          <button
                            type="button"
                            className="button soft"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => setViewProduct(product)}
                            title="View product & batches"
                            data-testid={`button-view-${product.id}`}>
                            <Eye size={12} />
                          </button>

                          {/* More Action Dropdown - ADMIN, FRONT DESK, CASHIER */}
                          {(canEditProduct || canAddBatch || canRecordStockIn || canRecordStockOut) && (
                            <DropdownMenuPrimitive.Root>
                              <DropdownMenuPrimitive.Trigger asChild>
                                <button
                                  type="button"
                                  className="button soft"
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 11,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                  title="More actions"
                                  data-testid={`button-more-action-${product.id}`}>
                                  <Ellipsis size={12} />
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
      </section>

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
                      style={{ fontSize: 9, padding: "2px 8px", marginTop: 4, display: "inline-block" }}>
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
                  <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
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
                    <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
                      Unit Price
                    </div>
                    <strong style={{ fontSize: 13 }}>{viewProduct.price}</strong>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
                      Cost Price
                    </div>
                    <strong style={{ fontSize: 13 }}>{viewProduct.cost}</strong>
                  </div>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
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
                  <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
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
                  <table className="data-table" style={{ fontSize: 11 }}>
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
                                    style={{ fontSize: 9, padding: "1px 6px" }}>
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
      {isAddProductOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setIsAddProductOpen(false)}
            data-testid="modal-add-product">
            <div
              className="modal"
              style={{ width: "min(580px, 100%)" }}>
              <div className="modal-header">
                <div>
                  <h2>Add New Product</h2>
                  <p className="modal-sub">Product details and initial batch registration</p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsAddProductOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveNewProduct}>
                <div className="form-grid">
                  <div className="field">
                    <label>Product Name *</label>
                    <input
                      required
                      placeholder="e.g. Paracetamol 500mg"
                      value={newProd.name}
                      onChange={(e) =>
                        setNewProd({ ...newProd, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Generic Name *</label>
                    <input
                      required
                      placeholder="e.g. Acetaminophen"
                      value={newProd.genericName}
                      onChange={(e) =>
                        setNewProd({ ...newProd, genericName: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Product Code (SKU) *</label>
                    <input
                      required
                      placeholder="e.g. MED-0421"
                      value={newProd.sku}
                      onChange={(e) =>
                        setNewProd({ ...newProd, sku: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Category</label>
                    <select
                      value={newProd.category}
                      onChange={(e) =>
                        setNewProd({ ...newProd, category: e.target.value })
                      }>
                      {categoryOptions.map((c) => (
                        <option key={c} value={c === "None" ? "" : c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Unit Price *</label>
                    <input
                      required
                      placeholder="₱10.00"
                      value={newProd.price}
                      onChange={(e) =>
                        setNewProd({ ...newProd, price: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Cost Price *</label>
                    <input
                      required
                      placeholder="₱6.00"
                      value={newProd.cost}
                      onChange={(e) =>
                        setNewProd({ ...newProd, cost: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Reorder Level *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newProd.reorder}
                      onChange={(e) =>
                        setNewProd({ ...newProd, reorder: e.target.value })
                      }
                    />
                  </div>
                  <div className="field full-width">
                    <label>Controlled Item</label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        minHeight: 39,
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 11,
                        background: "hsl(var(--surface-soft))",
                        padding: "8px 11px",
                      }}>
                      <div>
                        <strong style={{ display: "block", fontSize: 12 }}>
                          Dangerous drug
                        </strong>
                        <span className="muted" style={{ fontSize: 10 }}>
                          Requires controlled tracking
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`toggle ${newProd.isDangerousDrug ? "on" : ""}`}
                        aria-pressed={newProd.isDangerousDrug}
                        aria-label="Toggle dangerous drug tracking"
                        onClick={() =>
                          setNewProd({
                            ...newProd,
                            isDangerousDrug: !newProd.isDangerousDrug,
                          })
                        }>
                        <span />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Initial Batch Information */}
                <div className="modal-section">
                  <h4>Initial Batch Information</h4>
                  <div className="form-grid">
                    <div className="field">
                      <label>Batch Number *</label>
                      <input
                        required
                        placeholder="e.g. B2026-01"
                        value={newProd.batchNumber}
                        onChange={(e) =>
                          setNewProd({
                            ...newProd,
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
                        required
                        value={newProd.quantity}
                        onChange={(e) =>
                          setNewProd({ ...newProd, quantity: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Expiry Date *</label>
                      <input
                        type="date"
                        required
                        value={newProd.expiryDate}
                        onChange={(e) =>
                          setNewProd({ ...newProd, expiryDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Date Received</label>
                      <input
                        type="date"
                        value={newProd.dateReceived}
                        onChange={(e) =>
                          setNewProd({
                            ...newProd,
                            dateReceived: e.target.value,
                          })
                        }
                      />
                    </div>
                    {isAdmin && (
                      <div className="field full-width">
                        <label>Supplier</label>
                        <select
                          value={newProd.supplier}
                          onChange={(e) =>
                            setNewProd({ ...newProd, supplier: e.target.value })
                          }>
                          {suppliers.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="submit" className="button dark">
                    Save Product
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 3. EDIT PRODUCT MODAL (ADMIN & FRONT DESK) */}
      {/* ========================================================================= */}
      {editProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setEditProduct(null)}
            data-testid="modal-edit-product">
            <div className="modal dialog" style={{ maxWidth: 500 }}>
              <div className="modal-header">
                <div>
                  <h2>Update Product Information</h2>
                  <p className="modal-sub">
                    Edit product details and reorder thresholds
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setEditProduct(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveEditProduct}>
                <div className="form-grid">
                  <div className="field full-width">
                    <label>Product Name *</label>
                    <input
                      required
                      value={editProdData.name}
                      onChange={(e) =>
                        setEditProdData({ ...editProdData, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="field full-width">
                    <label>Generic Name</label>
                    <input
                      value={editProdData.genericName}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          genericName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Product Code (SKU) *</label>
                    <input
                      required
                      value={editProdData.sku}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          sku: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Category</label>
                    <select
                      value={editProdData.category}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          category: e.target.value,
                        })
                      }>
                      {categoryOptions.map((c) => (
                        <option key={c} value={c === "None" ? "" : c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Price (₱) *</label>
                    <input
                      required
                      value={editProdData.price}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          price: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Cost Price (₱) *</label>
                    <input
                      required
                      value={editProdData.cost}
                      onChange={(e) =>
                        setEditProdData({ ...editProdData, cost: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Reorder Level *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={editProdData.reorder}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          reorder: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field full-width">
                    <label>Controlled Item</label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        minHeight: 39,
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 11,
                        background: "hsl(var(--surface-soft))",
                        padding: "8px 11px",
                      }}>
                      <div>
                        <strong style={{ display: "block", fontSize: 12 }}>
                          Dangerous drug
                        </strong>
                        <span className="muted" style={{ fontSize: 10 }}>
                          Requires controlled tracking
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`toggle ${editProdData.isDangerousDrug ? "on" : ""}`}
                        aria-pressed={editProdData.isDangerousDrug}
                        aria-label="Toggle dangerous drug tracking"
                        onClick={() =>
                          setEditProdData({
                            ...editProdData,
                            isDangerousDrug: !editProdData.isDangerousDrug,
                          })
                        }>
                        <span />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="submit" className="button dark">
                    Update Details
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 4. ADD BATCH / BATCH EXPIRY DATE MODAL (ADMIN & FRONT DESK) */}
      {/* ========================================================================= */}
      {batchProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setBatchProduct(null)}
            data-testid="modal-add-batch">
            <div className="modal dialog" style={{ maxWidth: 500 }}>
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

                <div className="modal-actions">
                  <button type="submit" className="button dark">
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
            <div className="modal dialog" style={{ maxWidth: 480 }}>
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
                      value={stockInData.batchNumber}
                      onChange={(e) =>
                        setStockInData({
                          ...stockInData,
                          batchNumber: e.target.value,
                        })
                      }>
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

                <div className="modal-actions">
                  <button type="submit" className="button dark">
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
            <div className="modal dialog" style={{ maxWidth: 480 }}>
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
                      required
                      value={stockOutData.quantity}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
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

                <div className="modal-actions">
                  <button
                    type="submit"
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
    </div>
  );
}