import { useState } from "react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { ReportModal } from "@/components/custom-ui/report-modal";
import { FinanceSection } from "@/components/finance/finance-section";
import { CustomersCard } from "@/components/custom-ui/customers-card";
import type { ToastFn } from "@/lib/types";

/**
 * Front desk's dashboard: the same Finance section the Admin sees (the backlog gives Front desk the
 * AR/AP, expense-tracking and income-report stories). Admin's sales, inventory and movement cards stay Admin-only.
 */
export default function FrontDeskDashboardPage({ onToast }: { onToast: ToastFn }) {
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeading title="Hello, Front desk!" description="Money in, money out, and what's owed both ways." />
      <FinanceSection onToast={onToast} onOpenReport={() => setReportOpen(true)} showKpis />
      <CustomersCard onToast={onToast} />
      {reportOpen && <ReportModal type="financial" onClose={() => setReportOpen(false)} onToast={onToast} />}
    </div>
  );
}
