import {
  wholesaleAmount,
  wholesaleCents,
  wholesalePrincipalSchema,
  wholesaleInstallmentSchema,
  type WholesaleInstallment,
} from "./wholesale-payment-plan";

export type WholesalePaymentAllocation = {
  sequenceNumber: number;
  amount: string;
};
export type WholesaleInstallmentBalance = WholesaleInstallment & {
  paid: string;
  balance: string;
  status: "Paid" | "Partially paid" | "Unpaid" | "Overdue";
};

export function wholesaleInstallmentBalance(
  row: WholesaleInstallment,
  paid: string,
): WholesaleInstallmentBalance {
  const installment = wholesaleInstallmentSchema.parse(row);
  const amount = wholesaleCents(installment.amount);
  const applied = wholesaleCents(paid);
  if (applied > amount)
    throw new Error("Installment allocations exceed the scheduled amount.");
  return {
    ...installment,
    paid: wholesaleAmount(applied),
    balance: wholesaleAmount(amount - applied),
    status:
      applied === amount ? "Paid" : applied > 0n ? "Partially paid" : "Unpaid",
  };
}

/** Allocate against current unpaid obligations, never rewrite earlier allocations. */
export function allocateWholesalePayment(
  amount: string,
  installments: WholesaleInstallmentBalance[],
): WholesalePaymentAllocation[] {
  let remaining = wholesaleCents(wholesalePrincipalSchema.parse(amount));
  const ordered = installments
    .map((row) => {
      const checked = wholesaleInstallmentBalance(
        {
          sequenceNumber: row.sequenceNumber,
          dueDate: row.dueDate,
          amount: row.amount,
        },
        row.paid,
      );
      if (checked.balance !== row.balance)
        throw new Error("Installment balance is inconsistent.");
      return checked;
    })
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.sequenceNumber - b.sequenceNumber,
    );
  if (new Set(ordered.map((row) => row.sequenceNumber)).size !== ordered.length)
    throw new Error("Duplicate installment sequence.");
  if (
    remaining >
    ordered.reduce((sum, row) => sum + wholesaleCents(row.balance), 0n)
  )
    throw new Error("Payment exceeds the outstanding balance.");
  const allocations: WholesalePaymentAllocation[] = [];
  for (const row of ordered) {
    if (!remaining) break;
    const available = wholesaleCents(row.balance);
    const applied = remaining < available ? remaining : available;
    if (applied > 0n)
      allocations.push({
        sequenceNumber: row.sequenceNumber,
        amount: wholesaleAmount(applied),
      });
    remaining -= applied;
  }
  return allocations;
}
