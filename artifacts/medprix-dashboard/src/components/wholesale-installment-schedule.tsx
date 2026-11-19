import * as React from "react";
import type { WholesaleInstallmentSchedule } from "@workspace/api-zod";
import { formatDisplayDate } from "@/lib/business-date";
import { wholesalePeso } from "@/lib/wholesale-api";
import { ModalDataTable } from "./modal-data-table";

/** Original obligations only; actual collections remain a separate history. */
export function WholesaleInstallmentScheduleView({
  schedule,
  preview = false,
  showTerms = true,
}: {
  schedule: WholesaleInstallmentSchedule;
  preview?: boolean;
  showTerms?: boolean;
}) {
  return (
    <section
      className="modal-section"
      aria-label={
        preview
          ? "Installment schedule preview"
          : "Original installment schedule"
      }
    >
      <h3>Payment schedule</h3>
      {showTerms && (
        <p className="field-hint">
          {schedule.paymentPlan === "Net30"
            ? "Net 30 · 1 payment"
            : "Net 60 · 2 installments"}
          . Final settlement deadline:{" "}
          <strong>{formatDisplayDate(schedule.finalDueDate)}</strong>.
        </p>
      )}
      <ModalDataTable className="data-table wholesale-task-table">
        <thead>
          <tr>
            <th>Installment</th>
            <th>Due date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {schedule.installments.map((row) => (
            <tr key={row.sequenceNumber}>
              <td data-label="Installment">{row.sequenceNumber}</td>
              <td data-label="Due date">{formatDisplayDate(row.dueDate)}</td>
              <td data-label="Amount">
                {wholesalePeso(row.amount)}
                {row.amount === "0.00" ? " · No payment due" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </ModalDataTable>
    </section>
  );
}
