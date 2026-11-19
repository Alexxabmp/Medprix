import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ProcurementRequestError } from "@/lib/procurement-api";

/** Field wrapper: label, control, hint and the server's field error in one place. */
export function Field({ id, label, hint, error, children, full = false, optional = false }: {
  id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode; full?: boolean; optional?: boolean;
}) {
  return (
    <div className={`field${full ? " full-width" : ""}`}>
      <label htmlFor={id}>{label}{optional && <span className="proc-optional"> (optional)</span>}</label>
      {children}
      {error ? <span className="field-error" id={`${id}-error`} role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

/** Radio buttons drawn as chips (payment mode, how a PO was sent, invoice type). */
export function Chips<T extends string>({ legend, name, value, options, onChange, disabled }: {
  legend: string; name: string; value: NoInfer<T> | ""; options: { value: T; label: string; hint?: string }[]; onChange: (value: NoInfer<T>) => void; disabled?: boolean;
}) {
  return (
    <fieldset className="proc-chips" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="proc-chip-row">
        {options.map(option => (
          <label key={option.value} className={`proc-chip${value === option.value ? " selected" : ""}${option.hint ? " with-hint" : ""}`}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span className="proc-chip-label">{option.label}</span>
            {option.hint && <span className="proc-chip-hint">{option.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Callout({ tone, children }: { tone: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`proc-callout ${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/** Runs one save: tracks busy state, keeps field errors, never double-submits. */
export function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (busy) return undefined;
    setBusy(true); setError(""); setFieldErrors({});
    try { return await work(); }
    catch (failure) {
      if (failure instanceof ProcurementRequestError) { setError(failure.message); setFieldErrors(failure.errors); }
      else setError("Something went wrong. Nothing was saved; try again.");
      return undefined;
    } finally { setBusy(false); }
  }
  return { busy, error, fieldErrors, run, setError };
}

export const todayManila = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
export const shortDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = isDay ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: isDay ? "UTC" : "Asia/Manila" });
};
export const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}
export const moneyInput = (value: string) => value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").replace(/^(\d*\.\d{0,2}).*$/, "$1");
