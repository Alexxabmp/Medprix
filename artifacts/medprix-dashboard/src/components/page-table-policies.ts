type Column = { numeric?: boolean; align?: "left" | "right" | "center"; flexible?: number; characters?: number; wrap?: boolean };
export type PageTablePolicy = { label: string; columns: Column[]; kind?: string; localScroll?: boolean; separateToolbar?: boolean };
const plain: Column = {};
const text: Column = { flexible: 1, characters: 16 };
const product: Column = { flexible: 2, characters: 22 };
const number: Column = { numeric: true, align: "right" };
const actions: Column = { align: "right" };
const address: Column = { ...text, wrap: true };
const controlHelp: Column = { wrap: true };

/** Explicit page-only opt-ins. Display headings never determine data type or alignment. */
export const pageTablePolicies: Record<string, PageTablePolicy> = {
  "wholesale-deliveries": { label: "Wholesale deliveries", columns: [plain, text, number, plain, plain, actions] },
  "supplier-directory": { label: "Supplier directory", columns: [text, text, number, number, plain, actions] },
  "supplier-payables": { label: "Supplier accounts payable", columns: [text, plain, plain, number, number, number, plain, actions] },
  "wholesale-orders": { label: "Wholesale orders", columns: [plain, text, number, plain, actions] },
  "wholesale-contracts": { label: "Client contracts", columns: [text, plain, plain, number, plain, actions] },
  "wholesale-clients": { label: "Wholesale clients", columns: [text, address, actions] },
  "wholesale-prices": { label: "Wholesale prices", columns: [product, number, plain, number, number, number, actions] },
  "wholesale-receipts": { label: "Wholesale delivery receipts", columns: [plain, plain, text, actions] },
  "wholesale-receivables": { label: "Wholesale accounts receivable", columns: [text, number, number, number, number, plain, plain, plain, actions] },
  transactions: { label: "Transactions", columns: [plain, plain, text, plain, text, number, plain, plain, actions] },
  "audit-logs": { label: "System audit logs", columns: [plain, text, text, plain, actions] },
  "user-activity": { label: "User activity", columns: [plain, text, plain, plain, plain, { ...address, flexible: 2 }] },
  inventory: { label: "Product inventory", columns: [product, plain, plain, number, number, plain, plain, plain, actions] },
  movements: { label: "Stock movement history", columns: [plain, plain, product, plain, plain, number, text] },
  "purchase-orders": { label: "Purchase order monitoring", columns: [plain, text, plain, number, number, plain, actions] },
  receiving: { label: "Receiving report management", kind: "receiving", columns: [plain, text, product, plain, number, plain, plain, plain, actions] },
  "purchase-invoices": { label: "Purchase invoice monitoring", columns: [plain, plain, text, plain, number, plain, actions] },
  users: { label: "User accounts", columns: [text, controlHelp, plain, controlHelp, plain, actions] },
  "pos-cart": { label: "Transaction items", localScroll: true, columns: [product, { numeric: true, align: "center" }, number, number, actions] },
  "pos-receipts": { label: "Recent shift receipts", separateToolbar: true, columns: [plain, plain, product, plain, number, plain, actions] },
};
