import * as React from "react";
import type { WholesaleInstallmentBalance } from "@workspace/api-zod";
import { formatDisplayDate } from "@/lib/business-date";
import { wholesalePeso } from "@/lib/wholesale-api";
import { ModalDataTable } from "./modal-data-table";

export function WholesaleInstallmentBalances({
  installments,
}: {
  installments: WholesaleInstallmentBalance[];
}) {
  return (
    <section className="modal-section" aria-label="Installment balances">
      <h3>Installment balances</h3>
      <ModalDataTable className="data-table">
        <thead>
          <tr>
            <th>Installment</th>
            <th>Due date</th>
            <th>Amount</th>
            <th>Total paid</th>
            <th>Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {installments.map((row) => (
            <tr key={row.sequenceNumber}>
              <td data-label="Installment">{row.sequenceNumber}</td>
              <td data-label="Due date">{formatDisplayDate(row.dueDate)}</td>
              <td data-label="Amount">{wholesalePeso(row.amount)}</td>
              <td data-label="Total paid">{wholesalePeso(row.paid)}</td>
              <td data-label="Balance">{wholesalePeso(row.balance)}</td>
              <td data-label="Status">
                {row.status === "Overdue" ? (
                  <span className="pill danger">Overdue</span>
                ) : row.amount === "0.00" ? (
                  "No payment due"
                ) : (
                  row.status
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </ModalDataTable>
    </section>
  );
}
