/** Operating expense categories (migration 0026). Supplier purchases are not expenses here: they reach profit as cost of goods sold. */
export const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Salaries", "Supplies", "PermitsTaxes", "Maintenance", "Transport", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  Rent: "Rent", Utilities: "Utilities (power, water, internet)", Salaries: "Salaries and wages", Supplies: "Store supplies",
  PermitsTaxes: "Permits and taxes", Maintenance: "Repairs and maintenance", Transport: "Transport and delivery", Other: "Other",
};
export const isExpenseCategory = (value: unknown): value is ExpenseCategory =>
  typeof value === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
