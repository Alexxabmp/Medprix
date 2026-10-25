import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatCalendarDate, localDateKey } from "@/lib/business-date";

/** Display-only calendar control; it never changes a sale's timestamp. */
export function DateControl({ label, testId = "control-cashier-date" }: {
  label?: string;
  testId?: string;
}) {
  const [date, setDate] = useState(() => new Date());
  const [followingToday, setFollowingToday] = useState(true);

  useEffect(() => {
    const update = () => {
      if (followingToday) setDate(new Date());
    };
    const interval = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [followingToday]);

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
          const [year, month, day] = event.currentTarget.value.split("-").map(Number);
          const selected = new Date(year, month - 1, day);
          if (!Number.isFinite(selected.getTime())) return;
          setDate(selected);
          setFollowingToday(localDateKey(selected) === localDateKey());
        }}
      />
    </label>
  );
}
