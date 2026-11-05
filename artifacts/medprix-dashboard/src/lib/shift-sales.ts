import type { ShiftReceipt } from "./types";

export function summarizeShiftSales(receipts: ShiftReceipt[]) {
  const completed = receipts.filter((receipt) => receipt.status.trim().toLowerCase() === "completed");
  const total = completed.reduce((sum, receipt) => sum + receipt.total, 0);
  const sumFor = (methods: string[]) => completed.reduce((sum, receipt) =>
    sum + (methods.includes(receipt.method.trim().toLowerCase()) ? receipt.total : 0), 0);
  const countFor = (methods: string[]) => completed.filter((receipt) => methods.includes(receipt.method.trim().toLowerCase())).length;
  const cardMethods = ["card", "credit", "debit", "credit card", "debit card"];
  return {
    completed, total, count: completed.length,
    average: completed.length ? total / completed.length : 0,
    cash: sumFor(["cash"]), gcash: sumFor(["gcash"]),
    card: sumFor(cardMethods),
    cashCount: countFor(["cash"]), gcashCount: countFor(["gcash"]), cardCount: countFor(cardMethods),
  };
}
