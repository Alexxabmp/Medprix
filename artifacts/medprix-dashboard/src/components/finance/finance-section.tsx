import { useState } from "react";
import { Link } from "wouter";
import { CircleAlert, CircleDollarSign, FileBarChart, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from "@workspace/api-zod";
import { DateField } from "@/components/custom-ui/date-field";
import { SelectField } from "@/components/custom-ui/select-field";
import { Kpi } from "@/components/custom-ui/kpi-card";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { Callout, Field, moneyInput, shortDate } from "@/components/procurement/shared";
import { buildDocumentPdf, downloadPdf } from "@/lib/document-pdf";
import { PHARMACY_PROFILE } from "@/lib/procurement-documents";
import { financeApi, FinanceRequestError, manilaToday, money, percent, type Expense, type FinanceDetails, type PeriodKey } from "@/lib/finance-api";
import { getFinanceState, refreshFinance, setFinanceCustom, setFinancePeriod, useFinance, type FinanceState } from "@/lib/finance-store";
import type { ToastFn } from "@/lib/types";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "thisMonth", label: "This month" }, { key: "lastMonth", label: "Last month" },
  { key: "thisYear", label: "This year" }, { key: "allTime", label: "All time" }, { key: "custom", label: "Custom" },
];
const DISCOUNT_LABEL: Record<string, string> = { "Senior Citizen": "Senior citizen (20%)", PWD: "PWD (20%)", "VAT Exemption": "VAT exemption (senior/PWD)" };
const rangeLabel = (f: FinanceState) => `${shortDate(f.range.from)} – ${shortDate(f.range.to)}`;
const periodName = (f: FinanceState) => (f.period === "custom" ? rangeLabel(f) : PERIODS.find(p => p.key === f.period)!.label);

/** Dashboard card: net income for the period picked in the Finance section. Clicking opens the Financial summary report. */
export function FinanceKpi({ onClick }: { onClick: () => void }) {
  const f = useFinance();
  const s = f.summary;
  return (
    <Kpi
      label={`Net income · ${periodName(f)}`}
      busy={!s && f.loading}
      value={s ? money(s.netIncome)
        : !f.error ? <span className="financial-pending" role="status"><LoaderCircle size={24} className="spin action-spinner" aria-hidden="true" /><span className="sr-only">Loading financial summary…</span></span>
        : "Unavailable"}
      change={s ? `Revenue ${money(s.revenue.total)} · Expenses ${money(s.operatingExpenses)}`
        : <span className="financial-status">{f.error && <CircleAlert size={13} aria-hidden="true" />}{f.error ? "Open report to retry" : "Loading summary…"}</span>}
      icon={CircleDollarSign}
      onClick={onClick}
      testId="card-report-financial"
    />
  );
}

/**
 * The Finance section on the dashboard (Admin and Front desk): period picker, income statement, money in/out,
 * what's owed both ways, overdue lists, recent expenses and senior/PWD/regulated sales. Always visible, never a pop-up.
 */
export function FinanceSection({ onToast, onOpenReport, showKpis = false }: { onToast: ToastFn; onOpenReport: () => void; showKpis?: boolean }) {
  const f = useFinance();
  const s = f.summary, d = f.details;
  const [adding, setAdding] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const live = f.expenses.filter(e => !e.voidedAt);
  const dangerous = d?.regulatedItems.filter(r => r.dangerousDrug) ?? [];
  const negative = s !== null && Number(s.netIncome) < 0;

  return (
    <section className="surface-card finance-section" aria-labelledby="finance-heading" data-testid="finance-section">
      <div className="fin-head">
        <h2 id="finance-heading" className="card-title">Finance</h2>
        <div className="proc-heading-actions">
          <button type="button" className="button soft" onClick={() => void refreshFinance()} disabled={f.loading} aria-label="Refresh finance figures"><RefreshCw size={14} className={f.loading ? "spin" : ""} /> Refresh</button>
          <button type="button" className="button soft" onClick={onOpenReport}><FileBarChart size={14} /> Financial summary</button>
          <button type="button" className="button primary-action" onClick={() => setAdding(true)} data-testid="button-add-expense"><Plus size={14} /> Record expense</button>
        </div>
      </div>

      <div className="fin-period" role="group" aria-label="Finance period">
        {PERIODS.map(p => <button key={p.key} type="button" className={`proc-filter${f.period === p.key ? " active" : ""}`} aria-pressed={f.period === p.key} onClick={() => setFinancePeriod(p.key)}>{p.label}</button>)}
        {f.period === "custom" && (
          <span className="fin-custom">
            <DateField aria-label="From date" value={f.custom.from} max={f.custom.to} onChange={e => setFinanceCustom({ ...f.custom, from: e.target.value })} />
            <span className="muted">to</span>
            <DateField aria-label="To date" value={f.custom.to} min={f.custom.from} max={manilaToday()} onChange={e => setFinanceCustom({ ...f.custom, to: e.target.value })} />
          </span>
        )}
        <span className="muted proc-small fin-updated" aria-live="polite">{rangeLabel(f)}{f.updatedAt ? ` · updated ${f.updatedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" })}, refreshes every 30 s` : ""}</span>
      </div>

      {f.error && <Callout tone="danger">{f.error}{s ? " Showing the last figures loaded." : ""} <button type="button" className="proc-link" onClick={() => void refreshFinance()}>Try again</button></Callout>}

      {showKpis && (
        <div className="proc-tasks fin-kpis">
          {[
            { label: "Revenue", value: s?.revenue.total, caption: s ? `Retail ${money(s.revenue.retail)} · Wholesale ${money(s.revenue.wholesale)}` : "" },
            { label: "Gross profit", value: s?.grossProfit, caption: s ? `Margin ${percent(s.grossMargin)}` : "" },
            { label: "Operating expenses", value: s?.operatingExpenses, caption: s ? `${s.operatingExpenseEntries} entr${s.operatingExpenseEntries === 1 ? "y" : "ies"}` : "" },
            { label: "Net income", value: s?.netIncome, caption: s ? `Net margin ${percent(s.netMargin)}` : "", tone: negative ? "danger" : "" },
          ].map(k => (
            <div key={k.label} className={`proc-task fin-kpi ${k.tone ?? ""}`}>
              <span className="proc-task-label">{k.label}</span>
              <span className="proc-task-value">{k.value !== undefined ? money(k.value) : "—"}</span>
              <span className="proc-task-caption">{s ? k.caption : "Loading…"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="fin-grid">
        <div className="fin-card">
          <h3>Income statement</h3>
          <IncomeStatement f={f} />
        </div>
        <div className="fin-card">
          <h3>Money in and out</h3>
          <div className="fin-flow">
            <div><span>Money in</span><strong>{money(s?.moneyIn.total)}</strong>
              <small>Retail {money(s?.moneyIn.retailSales)} · Wholesale collections {money(s?.moneyIn.wholesaleCollections)}</small></div>
            <div><span>Money out</span><strong>{money(s?.moneyOut.total)}</strong>
              <small>Suppliers {money(s?.moneyOut.supplierPayments)} · Expenses {money(s?.moneyOut.operatingExpenses)}</small></div>
          </div>
          <h3>Owed both ways (as of {s ? shortDate(s.asOf) : "today"})</h3>
          <div className="fin-flow">
            <div><span>Clients owe us</span><strong>{money(s?.accountsReceivable.outstanding)}</strong>
              <small className={s && Number(s.accountsReceivable.overdue) > 0 ? "proc-danger-text" : ""}>{money(s?.accountsReceivable.overdue)} overdue ({s?.accountsReceivable.overdueCount ?? 0})</small></div>
            <div><span>We owe suppliers</span><strong>{money(s?.accountsPayable.outstanding)}</strong>
              <small className={s && Number(s.accountsPayable.overdue) > 0 ? "proc-danger-text" : ""}>{money(s?.accountsPayable.overdue)} overdue ({s?.accountsPayable.overdueCount ?? 0})</small></div>
          </div>
          {s && s.accountsPayable.pendingVerificationCount > 0 && <p className="muted proc-small">{s.accountsPayable.pendingVerificationCount} supplier invoice(s) billed before delivery ({money(s.accountsPayable.pendingVerificationAmount)}) are awaiting verification and aren't counted yet.</p>}
          <p className="muted proc-small">Money in counts every payment method (cash, GCash, Maya, card).</p>
        </div>
      </div>

      <div className="fin-grid">
        <OverdueList title="Overdue receivables" rows={d?.overdueReceivables} empty="No overdue client balances." link="/wholesale" linkLabel="Wholesale → Receivables" amountKey="overdue" />
        <OverdueList title="Overdue payables" rows={d?.overduePayables} empty="No overdue supplier invoices." link="/supplier" linkLabel="Supplier → Payables" amountKey="balance" />
      </div>

      <div className="fin-grid">
        <div className="fin-card">
          <div className="fin-card-head"><h3>Recent expenses</h3><button type="button" className="proc-link" onClick={() => setListOpen(true)}>See all expenses</button></div>
          {live.slice(0, 5).map(e => (
            <div key={e.id} className="fin-line"><span>{shortDate(e.expenseDate)} · {EXPENSE_CATEGORY_LABEL[e.category]} · {e.description}</span><span>{money(e.amount)}</span></div>
          ))}
          {s && live.length === 0 && <p className="muted proc-small">No expenses recorded in this period. Use “Record expense” for rent, utilities, salaries and other running costs.</p>}
        </div>
        <div className="fin-card">
          <div className="fin-card-head"><h3>Senior / PWD and regulated sales</h3><button type="button" className="proc-link" onClick={onOpenReport}>Full list in the report</button></div>
          <div className="fin-discounts">
            {(d?.discounts ?? []).filter(x => x.type !== "VAT Exemption").map(x => (
              <div key={x.type}><span>{DISCOUNT_LABEL[x.type] ?? x.type}</span><strong>{money(x.amount)}</strong><small>{x.transactions} sale{x.transactions === 1 ? "" : "s"}</small></div>
            ))}
            {d && <div><span>Dangerous drugs</span><strong>{dangerous.reduce((n, r) => n + r.units, 0)} units</strong><small>{dangerous.length} medicine{dangerous.length === 1 ? "" : "s"}</small></div>}
          </div>
        </div>
      </div>

      {adding && <ExpenseDialog onClose={() => setAdding(false)} onSaved={e => { setAdding(false); onToast(`Expense of ${money(e.amount)} recorded.`); void refreshFinance(true); }} />}
      {listOpen && <ExpensesDialog f={f} onToast={onToast} onClose={() => setListOpen(false)} onAdd={() => { setListOpen(false); setAdding(true); }} />}
    </section>
  );
}

function IncomeStatement({ f }: { f: FinanceState }) {
  const s = f.summary, d = f.details;
  return (
    <table className="data-table proc-compact fin-statement">
      <tbody>
        <tr><td>Retail sales</td><td className="num">{money(s?.revenue.retail)}</td></tr>
        <tr><td>Wholesale sales (delivered)</td><td className="num">{money(s?.revenue.wholesale)}</td></tr>
        <tr className="fin-total"><td>Total revenue</td><td className="num">{money(s?.revenue.total)}</td></tr>
        <tr><td>Cost of goods sold</td><td className="num">({money(s?.costOfGoodsSold)})</td></tr>
        <tr className="fin-total"><td>Gross profit · {percent(s?.grossMargin ?? null)}</td><td className="num">{money(s?.grossProfit)}</td></tr>
        {d?.expensesByCategory.map(e => <tr key={e.category} className="fin-sub"><td>{EXPENSE_CATEGORY_LABEL[e.category]}</td><td className="num">({money(e.total)})</td></tr>)}
        <tr><td>Operating expenses</td><td className="num">({money(s?.operatingExpenses)})</td></tr>
        <tr className={`fin-total fin-net ${s && Number(s.netIncome) < 0 ? "negative" : ""}`}><td>Net income · {percent(s?.netMargin ?? null)}</td><td className="num">{money(s?.netIncome)}</td></tr>
      </tbody>
    </table>
  );
}

function OverdueList({ title, rows, empty, link, linkLabel, amountKey }: { title: string; rows?: FinanceDetails["overdueReceivables"]; empty: string; link: string; linkLabel: string; amountKey: "overdue" | "balance" }) {
  return (
    <div className="fin-card">
      <div className="fin-card-head"><h3>{title}</h3><Link className="proc-link" href={link}>{linkLabel}</Link></div>
      {rows?.map(r => (
        <div key={r.id} className="fin-line"><span><strong>{r.name}</strong>{r.reference ? ` · ${r.reference}` : ""}</span>
          <span><span className="proc-danger-text">{r.daysOverdue ?? "—"} days</span> · {money(r[amountKey])}</span></div>
      ))}
      {rows && rows.length === 0 && <p className="muted proc-small">{empty}</p>}
      {rows && rows.length === 10 && <p className="muted proc-small">Showing the 10 oldest. See the full list on the linked page.</p>}
    </div>
  );
}

/** Body of the Financial summary report pop-up (opened from the Net income card or the Finance section). */
export function FinanceReportBody() {
  const f = useFinance();
  const s = f.summary, d = f.details;
  if (!s || !d) return f.error ? <Callout tone="danger">{f.error} <button type="button" className="proc-link" onClick={() => void refreshFinance()}>Retry</button></Callout> : <p role="status">Loading financial summary…</p>;
  return (
    <div className="fin-report">
      {f.error && <Callout tone="danger">Refresh failed; showing the last figures loaded. {f.error}</Callout>}
      <div className="report-metrics">
        {[["Revenue", s.revenue.total], ["Gross profit", s.grossProfit], ["Expenses", s.operatingExpenses], ["Net income", s.netIncome]].map(([label, value]) => (
          <div key={label} className="report-metric"><span>{label}</span><strong>{money(value)}</strong></div>
        ))}
      </div>
      <h3>Income statement</h3>
      <IncomeStatement f={f} />
      <div className="fin-grid">
        <div className="fin-card"><h3>Money in / out</h3>
          <div className="fin-line"><span>Money in</span><strong>{money(s.moneyIn.total)}</strong></div>
          <div className="fin-line"><span>Money out</span><strong>{money(s.moneyOut.total)}</strong></div></div>
        <div className="fin-card"><h3>Owed both ways</h3>
          <div className="fin-line"><span>Clients owe us</span><strong>{money(s.accountsReceivable.outstanding)}</strong></div>
          <div className="fin-line"><span>We owe suppliers</span><strong>{money(s.accountsPayable.outstanding)}</strong></div>
          {Number(s.accountsPayable.overdue) > 0 && <small className="proc-danger-text">{money(s.accountsPayable.overdue)} overdue to suppliers</small>}</div>
      </div>
      <h3>Senior / PWD discounts</h3>
      <table className="data-table proc-compact fin-statement">
        <thead><tr><th>Type</th><th className="num">Sales</th><th className="num">Discount</th></tr></thead>
        <tbody>
          {d.discounts.map(x => <tr key={x.type}><td>{DISCOUNT_LABEL[x.type] ?? x.type}</td><td className="num">{x.transactions}</td><td className="num">{money(x.amount)}</td></tr>)}
          {d.discounts.length === 0 && <tr><td colSpan={3} className="muted">No senior or PWD discounts in this period.</td></tr>}
        </tbody>
      </table>
      <h3>Prescription and dangerous-drug sales</h3>
      <div className="table-scroll">
        <table className="data-table proc-compact fin-statement">
          <thead><tr><th>Medicine</th><th>Type</th><th className="num">Sales</th><th className="num">Units</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {d.regulatedItems.map(r => (
              <tr key={r.id}><td><strong>{r.name}</strong> <span className="muted">{r.sku}</span></td>
                <td>{r.dangerousDrug ? <span className="pill danger">Dangerous drug</span> : <span className="pill blue">Prescription</span>}</td>
                <td className="num">{r.transactions}</td><td className="num">{r.units}</td><td className="num">{money(r.sales)}</td></tr>
            ))}
            {d.regulatedItems.length === 0 && <tr><td colSpan={5} className="muted">No prescription or dangerous-drug sales in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted proc-small">{s.operatingExpensesNote} Cost of goods sold uses each medicine's current cost price.</p>
      {s.warnings.length > 0 && <ul className="fin-notes muted proc-small">{s.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
    </div>
  );
}

export const financePeriodSubtitle = () => `Period: ${rangeLabel(getFinanceState())} · Medprix Central`;
export const financeReady = () => getFinanceState().summary !== null && getFinanceState().details !== null;

/** PDF of what's on screen: same period and figures as the dashboard. */
export function exportFinancialSummary(onToast: ToastFn) {
  const f = getFinanceState();
  const s = f.summary, details = f.details;
  if (!s || !details) { onToast("Financial summary is unavailable. Load it before exporting."); return; }
  const rows: string[][] = [
    ["Retail sales", money(s.revenue.retail)], ["Wholesale sales (delivered)", money(s.revenue.wholesale)], ["Total revenue", money(s.revenue.total)],
    ["Cost of goods sold", `(${money(s.costOfGoodsSold)})`], ["Gross profit", money(s.grossProfit)],
    ...details.expensesByCategory.map(e => [`  ${EXPENSE_CATEGORY_LABEL[e.category]}`, `(${money(e.total)})`]),
    ["Operating expenses", `(${money(s.operatingExpenses)})`], ["Net income", money(s.netIncome)],
    ["Gross margin / net margin", `${percent(s.grossMargin)} / ${percent(s.netMargin)}`],
  ];
  const bytes = buildDocumentPdf({
    title: "Financial summary", number: rangeLabel(f), date: shortDate(manilaToday()), pharmacy: PHARMACY_PROFILE,
    boxes: [
      { heading: "Money in (period)", lines: [`Retail sales: ${money(s.moneyIn.retailSales)}`, `Wholesale collections: ${money(s.moneyIn.wholesaleCollections)}`, `Total: ${money(s.moneyIn.total)}`] },
      { heading: "Money out (period)", lines: [`Supplier payments: ${money(s.moneyOut.supplierPayments)}`, `Operating expenses: ${money(s.moneyOut.operatingExpenses)}`, `Total: ${money(s.moneyOut.total)}`] },
      { heading: `Owed to us (as of ${shortDate(s.asOf)})`, lines: [`Outstanding: ${money(s.accountsReceivable.outstanding)}`, `Overdue: ${money(s.accountsReceivable.overdue)} (${s.accountsReceivable.overdueCount})`] },
      { heading: `We owe (as of ${shortDate(s.asOf)})`, lines: [`Outstanding: ${money(s.accountsPayable.outstanding)}`, `Overdue: ${money(s.accountsPayable.overdue)} (${s.accountsPayable.overdueCount})`, ...(s.accountsPayable.pendingVerificationCount ? [`Awaiting verification: ${money(s.accountsPayable.pendingVerificationAmount)}`] : [])] },
    ],
    table: { columns: [{ label: "Income statement", width: 70 }, { label: "Amount", width: 30, align: "right" }], rows },
    extraTables: [
      { heading: "Senior / PWD discounts", columns: [{ label: "Type", width: 50 }, { label: "Sales", width: 20, align: "right" }, { label: "Discount", width: 30, align: "right" }],
        rows: details.discounts.map(x => [DISCOUNT_LABEL[x.type] ?? x.type, String(x.transactions), money(x.amount)]) },
      { heading: "Prescription and dangerous-drug sales", columns: [{ label: "Medicine", width: 44 }, { label: "Type", width: 20 }, { label: "Sales", width: 12, align: "right" }, { label: "Units", width: 10, align: "right" }, { label: "Amount", width: 14, align: "right" }],
        rows: details.regulatedItems.map(r => [`${r.name} (${r.sku})`, r.dangerousDrug ? "Dangerous drug" : "Prescription", String(r.transactions), String(r.units), money(r.sales)]) },
      ...(details.overdueReceivables.length ? [{ heading: "Overdue receivables", columns: [{ label: "Client", width: 40 }, { label: "Order", width: 20 }, { label: "Days overdue", width: 15, align: "right" as const }, { label: "Overdue", width: 25, align: "right" as const }],
        rows: details.overdueReceivables.map(r => [r.name, r.reference ?? "—", String(r.daysOverdue ?? "—"), money(r.overdue)]) }] : []),
      ...(details.overduePayables.length ? [{ heading: "Overdue payables", columns: [{ label: "Supplier", width: 40 }, { label: "Invoice", width: 20 }, { label: "Days overdue", width: 15, align: "right" as const }, { label: "Balance", width: 25, align: "right" as const }],
        rows: details.overduePayables.map(r => [r.name, r.reference ?? "—", String(r.daysOverdue ?? "—"), money(r.balance)]) }] : []),
    ],
    paragraphs: [s.operatingExpensesNote, "Cost of goods sold uses each medicine's current cost price.", ...s.warnings],
    footer: `Generated by Medprix - Financial summary ${f.range.from} to ${f.range.to}`,
  });
  downloadPdf(bytes, `financial-summary-${f.range.from}-to-${f.range.to}.pdf`);
  onToast("Financial summary exported.");
}

function ExpensesDialog({ f, onToast, onClose, onAdd }: { f: FinanceState; onToast: ToastFn; onClose: () => void; onAdd: () => void }) {
  const [showVoided, setShowVoided] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const rows = f.expenses.filter(e => showVoided || !e.voidedAt);
  if (voiding) return <VoidDialog expense={voiding} onClose={() => setVoiding(null)} onSaved={() => { setVoiding(null); onToast("Expense voided. It stays on record but no longer counts."); void refreshFinance(true); }} />;
  return (
    <WholesaleDialog title="Expenses" description={`${rangeLabel(f)} · ${money(f.summary?.operatingExpenses)} counted`} busy={false} close={onClose} className="proc-dialog proc-dialog-wide"
      footer={<>
        <button type="button" className="button soft" onClick={onClose}>Close</button>
        <button type="button" className="button primary-action" onClick={onAdd}><Plus size={14} /> Record expense</button>
      </>}>
      <label className="um-inactive-toggle"><input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} /> Show voided</label>
      <div className="table-scroll">
        <table className="data-table proc-compact">
          <thead><tr><th>Date</th><th>Category</th><th>What it was for</th><th>Paid to / ref.</th><th>Recorded by</th><th className="num">Amount</th><th className="table-action-head">Action</th></tr></thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id} className={e.voidedAt ? "fin-voided" : ""}>
                <td>{shortDate(e.expenseDate)}</td><td>{EXPENSE_CATEGORY_LABEL[e.category]}</td>
                <td>{e.description}{e.voidedAt && <div className="proc-small proc-danger-text">Voided by {e.voidedBy ?? "—"}: {e.voidReason}</div>}</td>
                <td className="muted">{[e.payee, e.referenceNumber].filter(Boolean).join(" · ") || "—"}</td>
                <td className="muted">{e.recordedBy ?? "—"}</td><td className="num">{money(e.amount)}</td>
                <td className="table-action-cell">{!e.voidedAt && <button type="button" className="button soft proc-next" onClick={() => setVoiding(e)}>Void</button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No expenses recorded in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </WholesaleDialog>
  );
}

function ExpenseDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (expense: Expense) => void }) {
  const [form, setForm] = useState({ expenseDate: manilaToday(), category: "" as ExpenseCategory | "", amount: "", description: "", payee: "", referenceNumber: "" });
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  const problems: Record<string, string> = {
    ...(!form.category ? { category: "Choose a category." } : {}),
    ...(!(Number(form.amount) > 0) ? { amount: "Enter the amount." } : {}),
    ...(form.description.trim().length < 3 ? { description: "Say what it was for." } : {}),
    ...(form.expenseDate > manilaToday() ? { expenseDate: "The date can't be in the future." } : {}),
  };
  async function submit() {
    setAttempted(true);
    if (Object.keys(problems).length || busy) return;
    setBusy(true); setError(""); setErrors({});
    try {
      const result = await financeApi.recordExpense(key, { ...form, category: form.category as ExpenseCategory, payee: form.payee || undefined, referenceNumber: form.referenceNumber || undefined });
      onSaved(result.expense);
    } catch (failure) {
      if (failure instanceof FinanceRequestError) { setError(failure.message); setErrors(failure.errors); } else setError("Nothing was saved. Try again.");
    } finally { setBusy(false); }
  }
  const err = (field: string) => (attempted && problems[field]) || errors[field];
  return (
    <WholesaleDialog title="Record expense" description="Running costs such as rent, utilities and salaries. Supplier invoices are recorded in Procurement, not here." busy={busy} close={onClose} className="proc-dialog"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="button primary-action" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save expense"}</button>
      </>}>
      <div className="form-grid">
        <Field id="exp-date" label="Date paid" error={err("expenseDate")}>
          <DateField id="exp-date" value={form.expenseDate} max={manilaToday()} onChange={e => setForm({ ...form, expenseDate: e.target.value })} />
        </Field>
        <Field id="exp-category" label="Category" error={err("category")}>
          <SelectField id="exp-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
            <option value="">Choose a category</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
          </SelectField>
        </Field>
        <Field id="exp-amount" label="Amount" error={err("amount")}>
          <div className="proc-money-input"><span>₱</span><input id="exp-amount" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: moneyInput(e.target.value) })} /></div>
        </Field>
        <Field id="exp-payee" label="Paid to" optional error={errors.payee}>
          <input id="exp-payee" value={form.payee} maxLength={120} placeholder="e.g. Davao Light" onChange={e => setForm({ ...form, payee: e.target.value })} />
        </Field>
        <Field id="exp-desc" label="What it was for" full error={err("description")}>
          <input id="exp-desc" value={form.description} maxLength={500} placeholder="e.g. November electricity bill" onChange={e => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field id="exp-ref" label="Receipt / reference no." optional error={errors.referenceNumber}>
          <input id="exp-ref" value={form.referenceNumber} maxLength={100} onChange={e => setForm({ ...form, referenceNumber: e.target.value })} />
        </Field>
      </div>
      {error && <Callout tone="danger">{error}</Callout>}
    </WholesaleDialog>
  );
}

function VoidDialog({ expense, onClose, onSaved }: { expense: Expense; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  async function submit() {
    setAttempted(true);
    if (reason.trim().length < 3 || busy) return;
    setBusy(true); setError("");
    try { await financeApi.voidExpense(expense.id, reason.trim()); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Nothing was saved. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <WholesaleDialog title="Void this expense?" description={`${EXPENSE_CATEGORY_LABEL[expense.category]} · ${money(expense.amount)} · ${shortDate(expense.expenseDate)}`} busy={busy} close={onClose} className="proc-dialog proc-dialog-narrow"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="button danger" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Void expense"}</button>
      </>}>
      <Callout tone="info">The entry stays on record (with your name and reason) but no longer counts in the totals.</Callout>
      <Field id="void-reason" label="Reason" full error={attempted && reason.trim().length < 3 ? "Write a short reason." : undefined}>
        <input id="void-reason" value={reason} maxLength={500} placeholder="e.g. entered twice" onChange={e => setReason(e.target.value)} />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
    </WholesaleDialog>
  );
}
