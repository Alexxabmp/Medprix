// Shared application types

export type ToastFn = (message: string | import("./feedback").Feedback) => void;

export type ReportType =
  | "sales"
  | "inventory"
  | "financial"
  | "valuation"
  | "movement"
  | "cash";

export interface UserRecord {
  id: string;
  initials: string;
  name: string;
  username: string;
  role: string;
  status: "Active" | "Inactive";
  lastActive: string;
  /** 09XXXXXXXXX, or "" when none is saved. */
  phone: string;
  /** The one administrator who may change other administrators' accounts. */
  isPrimary?: boolean;
  /** Still using a temporary password from an administrator. */
  tempPassword?: boolean;
  /** ISO time the lockout ends, while the account is locked after too many wrong passwords. */
  lockedUntil?: string | null;
}

export interface ProductBatch {
  reservedQuantity?: number;
  id?: string;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  mfgDate?: string;
  dateReceived?: string;
  supplier?: string;
}

export interface ProductCategory { id: string; name: string; isVat: boolean; }

export interface ProductItem {
  initialPrice?: string | null;
  pharmacyDate?: string;
  isVatExempt?: boolean | null;
  id: string;
  name: string;
  genericName: string;
  sku: string;
  category: string;
  price: string;
  cost?: string;
  isDangerousDrug?: boolean;
  /** Phase 2c: shows an Rx tag at the POS and reminds the cashier to check the prescription. */
  requiresPrescription?: boolean;
  reorder: number;
  batches: ProductBatch[];
  stock?: number;
  status?: string;
}

export interface SupplierItem {
  name: string;
  code: string;
  contact: string;
  orders: number;
  value: string;
  status: string;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  date: string;
  items: number;
  value: string;
  status: string;
}

export interface MovementItem {
  name: string;
  units: number;
}

export interface CashMismatch {
  date: string;
  shift: string;
  expected: string;
  recorded: string;
  difference: string;
  type: "short" | "over";
}

export interface CashReconciliationRecord {
  id: string;
  reconciliationDate: string;
  cashierId?: string | null;
  cashierName: string;
  cashOnHand: number;
  totalReportedSales: number;
  discrepancyAmount: number;
  hasFlaggedInconsistency: boolean;
  notes?: string | null;
  reconciledAt: string;
}

export interface TransactionItem {
  productId?: string;
  product: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  isVatExempt?: boolean | null;
  vatRate?: string | null;
  vat?: string;
  discount?: string;
  net?: string;
  vatRelief?: string;
}

export interface UserTransaction {
  id: string;
  source?: "canonical-retail" | "historical-normalized";
  createdAt?: string;
  transactionNumber: string;
  dateTime: string;
  user: string;
  businessType: "Retail" | "Wholesale";
  customer: string;
  total: string;
  subtotal: string;
  discount: string;
  discountType?: string;
  vat: string;
  vatRelief?: string;
  /** GCash / QR reference number or card approval code (retail sales from migration 0016 on). */
  paymentReference?: string;
  /** Senior citizen / PWD name and ID number as shown on the ID (discounted sales from migration 0017 on). */
  discountHolderName?: string;
  discountHolderId?: string;
  amountReceived: string;
  change: string;
  payment: string;
  status: "Completed" | "Voided" | "Cancelled" | "Refunded" | "Pending";
  items: TransactionItem[];
}

export interface SystemLog {
  id: string | number;
  dateTime: string;
  user: string;
  role: string;
  action: string;
  module: string;
  description: string;
  status: "Success" | "Failed" | "Warning";
  deviceIp: string;
}

export interface UserActivity {
  id: string | number;
  dateTime: string;
  user: string;
  role: string;
  activity: string;
  module: string;
  description: string;
  flag: "Normal" | "Suspicious" | "Flagged";
}

export interface ShiftReceipt {
  printSource?: {
    merchantNameAtIssue?: string;
    calculationVersion?: string;
    transactionNumber?: string;
    dateTime?: string;
    user?: string;
    payment?: string;
    status?: string;
    total?: string;
    itemsSummary?: string;
  };
  id: string;
  rawId?: string;
  time: string;
  dateTime?: string;
  items: number;
  itemsList?: Array<{ product: string; quantity: number; unitPrice?: string; subtotal?: string }>;
  itemsSummary: string;
  total: number;
  totalFormatted: string;
  subtotal?: string;
  vat?: string;
  vatRelief?: string;
  discount?: string;
  /** "Senior" or "PWD" when a 20% discount was applied; missing on older sales. */
  discountType?: string;
  paymentReference?: string;
  discountHolderName?: string;
  discountHolderId?: string;
  amountReceived?: string;
  change?: string;
  method: string;
  cashier: string;
  status: string;
}
