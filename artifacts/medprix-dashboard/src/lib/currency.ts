/** Accept API decimals and existing peso-formatted display strings without double symbols. */
export function displayPeso(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value.replace(/[₱,\s]/g, ""));
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
    : String(value);
}
