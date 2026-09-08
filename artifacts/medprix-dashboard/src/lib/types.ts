// ─── Shared app-wide types ────────────────────────────────────────────────────

export type ToastFn = (message: string) => void;

export type ReportType =
  | "sales"
  | "inventory"
  | "financial"
  | "valuation"
  | "movement"
  | "cash";

export type UserRecord = {
  id: number;
  initials: string;
  name: string;
  username: string;
  role: string;
  status: "Active" | "Inactive";
  lastActive: string;
  phone: string;
};

export type TransactionItem = {
  product: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

export type UserTransaction = {
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
};

export type SystemLog = {
  id: number;
  dateTime: string;
  user: string;
  role: string;
  action: string;
  module: string;
  description: string;
  status: "Success" | "Failed";
  deviceIp: string;
};

export type UserActivity = {
  id: number;
  dateTime: string;
  user: string;
  role: string;
  activity: string;
  module: string;
  description: string;
  flag: "Normal" | "Suspicious" | "Flagged";
};
