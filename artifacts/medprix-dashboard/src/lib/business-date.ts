export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric",
  }).format(date);
}

export function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(0);
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return localDateKey(date) === value ? date : null;
}

const clean = (value: string) => value.normalize("NFKC").replace(/[\u200e\u200f\u061c]/g, "").toLocaleLowerCase();
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
const localeParsers = new Map<string, (value: string) => string | null>();

export function transactionDateKey(value: unknown, locale?: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(text);
  if (iso) {
    if (!parseCalendarDate(iso[1])) return null;
    if (text === iso[1]) return iso[1];
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(text)) return null;
    const date = new Date(text);
    return Number.isFinite(date.getTime()) ? localDateKey(date) : null;
  }

  const english = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(\d{4})(?=$|[^\d])/i.exec(text);
  if (english) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(english[1].slice(0, 3).toLowerCase()) + 1;
    const key = `${english[3]}-${String(month).padStart(2, "0")}-${english[2].padStart(2, "0")}`;
    return month && parseCalendarDate(key) ? key : null;
  }

  // Checkout historically stored toLocaleString({month:'short', day/year/hour/minute}).
  // Parse that known format using the current locale
  const cached = localeParsers.get(locale || "default");
  if (cached) return cached(text);
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  if (formatter.resolvedOptions().calendar !== "gregory") return null;
  const digits = Array.from({ length: 10 }, (_, digit) => new Intl.NumberFormat(locale, { useGrouping: false }).format(digit));
  const normalize = (input: string) => digits.reduce((result, digit, index) => result.split(digit).join(String(index)), clean(input));
  const months = Array.from({ length: 12 }, (_, month) => normalize(formatter.formatToParts(new Date(2006, month, 15, 13, 14)).find((part) => part.type === "month")!.value));
  const seen = new Set<string>();
  let pattern = "^";
  for (const part of formatter.formatToParts(new Date(2006, 10, 22, 13, 14))) {
    if (["year", "month", "day"].includes(part.type)) {
      seen.add(part.type);
      pattern += part.type === "month"
        ? `(?<month>${months.map(escapePattern).join("|")})`
        : `(?<${part.type}>\\d{${part.type === "year" ? "4" : "1,2"}})`;
    } else if (part.type === "literal") {
      pattern += escapePattern(normalize(part.value));
    } else break;
    if (seen.size === 3) break;
  }
  if (seen.size !== 3) return null;
  const expression = new RegExp(`${pattern}(?=$|[^\\d])`);
  const parse = (input: string) => {
    const parts = expression.exec(normalize(input))?.groups;
    if (!parts) return null;
    const month = months.indexOf(parts.month) + 1;
    const key = `${parts.year}-${String(month).padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
    return parseCalendarDate(key) ? key : null;
  };
  localeParsers.set(locale || "default", parse);
  return parse(text);
}

export function recordsOnDate<T extends { dateTime?: string; printSource?: { dateTime?: string } }>(records: T[], date: Date): T[] {
  const key = localDateKey(date);
  return records.filter((record) => transactionDateKey(record.printSource ? record.printSource.dateTime : record.dateTime) === key);
}
