import { CalendarDays } from "lucide-react";
import { formatCalendarDate, localDateKey, parseCalendarDate } from "@/lib/business-date";

export function DateControl({ date, onDateChange, label, testId = "control-cashier-date" }: {
  date: Date;
  onDateChange: (date: Date) => void;
  label?: string;
  testId?: string;
}) {

  return (
    <label className="date-control shift-date-control" data-testid={testId}>
      <CalendarDays size={14} aria-hidden="true" />
      <span>{label || formatCalendarDate(date)}</span>
      <input
        type="date"
        aria-label={`${label || "Select date"}: ${formatCalendarDate(date)}`}
        value={localDateKey(date)}
        onClick={(event) => {
          // The native input covers the complete legacy control, not just its icon.
          try {
            if (event.currentTarget.showPicker) {
              event.currentTarget.showPicker();
              event.preventDefault();
            }
          } catch {
            // Keep the browser's native activation when showPicker is unavailable.
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          try {
            if (event.currentTarget.showPicker) {
              event.currentTarget.showPicker();
              event.preventDefault();
            }
          } catch {
            // Preserve native keyboard handling.
          }
        }}
        onChange={(event) => {
          if (!event.currentTarget.value) return;
          const selected = parseCalendarDate(event.currentTarget.value);
          if (selected) onDateChange(selected);
        }}
      />
    </label>
  );
}
