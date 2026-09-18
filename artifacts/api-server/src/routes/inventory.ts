import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

export interface ProductBatch {
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  mfgDate?: string;
  dateReceived?: string;
  supplier?: string;
}

export interface ProductItem {
  id: string;
  name: string;
  genericName: string;
  sku: string;
  category: string;
  price: string;
  reorder: number;
  batches: ProductBatch[];
  stock?: number;
  status?: string;
}

// Initial in-memory product data with multi-batch records
export const inventoryProducts: ProductItem[] = [
  {
    id: "p1",
    name: "Paracetamol 500mg",
    genericName: "Acetaminophen",
    sku: "MED-0421",
    category: "Pain relief",
    reorder: 40,
    price: "₱5.00",
    batches: [
      {
        batchNumber: "B2026-01",
        quantity: 70,
        expiryDate: "2027-08-15",
        mfgDate: "2025-08-01",
        dateReceived: "2025-08-20",
        supplier: "Southstar Distribution",
      },
      {
        batchNumber: "B2026-02",
        quantity: 50,
        expiryDate: "2027-11-20",
        mfgDate: "2025-11-01",
        dateReceived: "2025-11-25",
        supplier: "Southstar Distribution",
      },
    ],
  },
  {
    id: "p2",
    name: "Amoxicillin 500mg",
    genericName: "Amoxicillin Trihydrate",
    sku: "MED-0184",
    category: "Antibiotics",
    reorder: 30,
    price: "₱12.00",
    batches: [
      {
        batchNumber: "AMX-801",
        quantity: 8,
        expiryDate: "2027-04-10",
        mfgDate: "2025-04-01",
        dateReceived: "2025-04-15",
        supplier: "Mercury Health Partners",
      },
    ],
  },
  {
    id: "p3",
    name: "Vitamin C 1000mg",
    genericName: "Ascorbic Acid + Zinc",
    sku: "VIT-0223",
    category: "Vitamins",
    reorder: 25,
    price: "₱8.00",
    batches: [
      {
        batchNumber: "VIT-102",
        quantity: 0,
        expiryDate: "2027-01-15",
        mfgDate: "2025-01-01",
        dateReceived: "2025-01-20",
        supplier: "Wellness Direct PH",
      },
    ],
  },
  {
    id: "p4",
    name: "Cough relief syrup",
    genericName: "Dextromethorphan HBr",
    sku: "MED-0552",
    category: "Respiratory",
    reorder: 20,
    price: "₱145.00",
    batches: [
      {
        batchNumber: "CRS-404",
        quantity: 63,
        expiryDate: "2027-06-30",
        mfgDate: "2025-06-01",
        dateReceived: "2025-06-15",
        supplier: "Southstar Distribution",
      },
    ],
  },
  {
    id: "p5",
    name: "Cetirizine 10mg",
    genericName: "Cetirizine Dihydrochloride",
    sku: "MED-0350",
    category: "Allergy",
    reorder: 18,
    price: "₱7.50",
    batches: [
      {
        batchNumber: "CTZ-201",
        quantity: 36,
        expiryDate: "2026-10-15",
        mfgDate: "2024-10-01",
        dateReceived: "2024-10-20",
        supplier: "Mercury Health Partners",
      },
    ],
  },
  {
    id: "p6",
    name: "Skin cream 30g",
    genericName: "Hydrocortisone 1%",
    sku: "DER-0108",
    category: "Dermatology",
    reorder: 15,
    price: "₱220.00",
    batches: [
      {
        batchNumber: "SKN-099",
        quantity: 12,
        expiryDate: "2026-08-01",
        mfgDate: "2024-08-01",
        dateReceived: "2024-08-15",
        supplier: "Wellness Direct PH",
      },
    ],
  },
];

// Helper to calculate total stock
function getTotalStock(product: ProductItem): number {
  return product.batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
}

// 1. GET /api/inventory - Retrieve all products and summary stats
router.get("/inventory", (_req: Request, res: Response) => {
  const now = new Date("2026-09-18T00:00:00");
  const enriched = inventoryProducts.map((p) => {
    const stock = getTotalStock(p);
    const expiredBatches = p.batches.filter((b) => {
      const exp = new Date(b.expiryDate);
      return !isNaN(exp.getTime()) && exp < now && Number(b.quantity) > 0;
    });
    const expiringSoonBatches = p.batches.filter((b) => {
      const exp = new Date(b.expiryDate);
      if (isNaN(exp.getTime()) || exp < now || Number(b.quantity) <= 0) return false;
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 60;
    });

    let status = "In Stock";
    if (expiredBatches.length > 0) status = "Expired";
    else if (stock === 0) status = "Out of Stock";
    else if (expiringSoonBatches.length > 0) status = "Expiring Soon";
    else if (stock <= p.reorder) status = "Low Stock";

    return {
      ...p,
      stock,
      status,
      expiredBatches,
      expiringSoonBatches,
    };
  });

  res.json({
    success: true,
    totalProducts: enriched.length,
    products: enriched,
  });
});

// 2. POST /api/inventory/products - Add a new product with initial batch
router.post("/inventory/products", (req: Request, res: Response) => {
  const { name, genericName, sku, category, price, reorder, batchNumber, quantity, expiryDate, mfgDate, dateReceived, supplier } = req.body;

  if (!name || !sku) {
    return res.status(400).json({ success: false, error: "Product name and SKU are required." });
  }

  const newProduct: ProductItem = {
    id: `p${inventoryProducts.length + 1}-${Date.now()}`,
    name: String(name).trim(),
    genericName: String(genericName || name).trim(),
    sku: String(sku).trim().toUpperCase(),
    category: String(category || "General"),
    price: String(price || "₱0.00"),
    reorder: Number(reorder) || 10,
    batches: [
      {
        batchNumber: String(batchNumber || "B001").trim().toUpperCase(),
        quantity: Number(quantity) || 0,
        expiryDate: String(expiryDate || "2027-12-31"),
        mfgDate,
        dateReceived: dateReceived || new Date().toISOString().slice(0, 10),
        supplier: supplier || "Direct Delivery",
      },
    ],
  };

  inventoryProducts.unshift(newProduct);
  res.status(201).json({ success: true, product: newProduct });
});

// 3. PUT /api/inventory/products/:id - Update product details
router.put("/inventory/products/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, genericName, sku, category, price, reorder } = req.body;

  const product = inventoryProducts.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  if (name) product.name = String(name).trim();
  if (genericName) product.genericName = String(genericName).trim();
  if (sku) product.sku = String(sku).trim().toUpperCase();
  if (category) product.category = String(category);
  if (price) product.price = String(price);
  if (reorder !== undefined) product.reorder = Number(reorder);

  res.json({ success: true, product });
});

// 4. POST /api/inventory/products/:id/batches - Add a batch to an existing product
router.post("/inventory/products/:id/batches", (req: Request, res: Response) => {
  const { id } = req.params;
  const { batchNumber, quantity, expiryDate, mfgDate, dateReceived, supplier } = req.body;

  const product = inventoryProducts.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  if (!batchNumber || !expiryDate) {
    return res.status(400).json({ success: false, error: "Batch number and expiry date are required." });
  }

  const newBatch: ProductBatch = {
    batchNumber: String(batchNumber).trim().toUpperCase(),
    quantity: Number(quantity) || 0,
    expiryDate: String(expiryDate),
    mfgDate,
    dateReceived: dateReceived || new Date().toISOString().slice(0, 10),
    supplier: supplier || "Direct Supplier",
  };

  product.batches.push(newBatch);
  res.status(201).json({ success: true, product, batch: newBatch });
});

// 5. POST /api/inventory/products/:id/stock-in - Record stock in
router.post("/inventory/products/:id/stock-in", (req: Request, res: Response) => {
  const { id } = req.params;
  const { batchNumber, quantity, reason, date } = req.body;

  const product = inventoryProducts.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, error: "Positive quantity required." });
  }

  const targetBatch = product.batches.find((b) => b.batchNumber === batchNumber);
  if (targetBatch) {
    targetBatch.quantity += qty;
  } else {
    product.batches.push({
      batchNumber: String(batchNumber || "B-NEW").trim().toUpperCase(),
      quantity: qty,
      expiryDate: "2028-12-31",
      dateReceived: date || new Date().toISOString().slice(0, 10),
    });
  }

  res.json({
    success: true,
    message: `Stock in recorded: +${qty} units (${reason || "Restock"})`,
    product,
  });
});

// 6. POST /api/inventory/products/:id/stock-out - Record stock out
router.post("/inventory/products/:id/stock-out", (req: Request, res: Response) => {
  const { id } = req.params;
  const { batchNumber, quantity, reason } = req.body;

  const product = inventoryProducts.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, error: "Positive quantity required." });
  }

  const targetBatch = product.batches.find((b) => b.batchNumber === batchNumber);
  if (!targetBatch || targetBatch.quantity < qty) {
    return res.status(400).json({
      success: false,
      error: `Insufficient stock in batch ${batchNumber}. Current: ${targetBatch?.quantity || 0}`,
    });
  }

  targetBatch.quantity -= qty;
  res.json({
    success: true,
    message: `Stock out recorded: -${qty} units (${reason || "Dispensed"})`,
    product,
  });
});

export default router;
