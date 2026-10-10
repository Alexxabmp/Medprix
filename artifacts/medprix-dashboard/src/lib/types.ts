// Shared application types

export type ToastFn = (message: string) => void;

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
  phone: string;
}

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
  cost?: string;
  isDangerousDrug?: boolean;
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

export interface TransactionItem {
  product: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface UserTransaction {
  id: number;
  transactionNumber: string;
  dateTime: string;
  user: string;
  businessType: "Retail" | "Wholesale";
  customer: string;
  total: string;
  subtotal: string;
  discount: string;
  vat: string;
  amountReceived: string;
  change: string;
  payment: string;
  status: "Completed" | "Voided" | "Refunded" | "Pending";
  items: TransactionItem[];
}

export interface SystemLog {
  id: number;
  dateTime: string;
  user: string;
  role: string;
  action: string;
  module: string;
  description: string;
  status: "Success" | "Failed";
  deviceIp: string;
}

export interface UserActivity {
  id: number;
  dateTime: string;
  user: string;
  role: string;
  activity: string;
  module: string;
  description: string;
  flag: "Normal" | "Suspicious" | "Flagged";
}

export interface ShiftReceipt {
  id: string;
  rawId?: number;
  time: string;
  dateTime?: string;
  items: number;
  itemsList?: Array<{ product: string; quantity: number; unitPrice?: string; subtotal?: string }>;
  itemsSummary: string;
  total: number;
  totalFormatted: string;
  subtotal?: string;
  vat?: string;
  discount?: string;
  amountReceived?: string;
  change?: string;
  method: string;
  cashier: string;
  status: string;
}
