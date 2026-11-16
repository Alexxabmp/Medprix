import {
  wholesaleAmount,
  wholesaleCents,
  wholesaleCalendarDateSchema,
} from "./wholesale-payment-plan";
import {
  wholesaleInstallmentBalance,
  type WholesaleInstallmentBalance,
} from "./wholesale-payment-allocation";

/** Current obligations, independent of original schedules and actual payment dates. */
export function wholesaleReceivableAging(
  rows: WholesaleInstallmentBalance[],
  finalDueDate: string,
  today: string,
) {
  wholesaleCalendarDateSchema.parse(today);
  wholesaleCalendarDateSchema.parse(finalDueDate);
  const installments = rows.map((row) => {
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
    const overdue =
      wholesaleCents(checked.balance) > 0n && checked.dueDate < today;
    return {
      ...checked,
      overdue,
      status: overdue ? ("Overdue" as const) : checked.status,
    };
  });
  const unpaid = installments
    .filter((row) => wholesaleCents(row.balance) > 0n)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.sequenceNumber - b.sequenceNumber,
    );
  const overdue = unpaid.filter((row) => row.overdue);
  return {
    installments,
    asOfDate: today,
    overdueAmount: wholesaleAmount(
      overdue.reduce((sum, row) => sum + wholesaleCents(row.balance), 0n),
    ),
    overdueInstallmentCount: overdue.length,
    nextDueDate: unpaid[0]?.dueDate ?? null,
    nextDueAmount: unpaid[0]?.balance ?? "0.00",
    finalDeadlineBreached: unpaid.length > 0 && finalDueDate < today,
    status: !unpaid.length
      ? ("Paid" as const)
      : overdue.length
        ? ("Overdue" as const)
        : ("Outstanding" as const),
  };
}
