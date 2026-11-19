import { useEffect, useId, useRef, useState, type Ref } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { ResponsivePicker } from "./responsive-picker";
import { formatCalendarDate, parseCalendarDate } from "@/lib/business-date";

export function DateControl({
  date,
  onDateChange,
  label,
  startMonth,
  endMonth,
  minDate,
  maxDate,
  onClear,
  id,
  disabled,
  readOnly,
  required,
  className,
  describedBy,
  invalid,
  triggerRef,
  testId = "control-cashier-date",
}: {
  date?: Date;
  onDateChange: (date: Date) => void;
  label?: string;
  startMonth?: Date;
  endMonth?: Date;
  minDate?: Date;
  maxDate?: Date;
  onClear?: () => void;
  id?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  className?: string;
  describedBy?: string;
  invalid?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const referenceDate = date ?? new Date();
  const [month, setMonth] = useState(referenceDate);
  const [draft, setDraft] = useState(() =>
    date ? formatCalendarDate(date) : "",
  );
  useEffect(() => {
    if (disabled || readOnly) setOpen(false);
  }, [disabled, readOnly]);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [inputError, setInputError] = useState("");
  const inputId = useId();
  const firstMonth =
    startMonth ??
    minDate ??
    new Date(Math.min(1900, referenceDate.getFullYear()), 0);
  const lastMonth =
    endMonth ??
    maxDate ??
    new Date(Math.max(2100, referenceDate.getFullYear()), 11);
  const earliestDate =
    minDate ?? new Date(firstMonth.getFullYear(), firstMonth.getMonth(), 1);
  const latestDate =
    maxDate ?? new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
  const inRange = (value: Date) => value >= earliestDate && value <= latestDate;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen && (disabled || readOnly)) return;
    if (nextOpen) {
      setMonth(inRange(referenceDate) ? referenceDate : earliestDate);
      setDraft(date ? formatCalendarDate(date) : "");
      setInputError("");
    }
    setOpen(nextOpen);
  };

  const selectDate = (selected: Date) => {
    if (disabled || readOnly || !inRange(selected)) return;
    onDateChange(selected);
    setOpen(false);
  };

  const applyTypedDate = () => {
    const value = draft.trim();
    const parts =
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value) ??
      /^(\d{2})(\d{2})(\d{4})$/.exec(value);
    const selected =
      parts &&
      parseCalendarDate(
        `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`,
      );
    if (!selected) {
      setInputError(
        value ? "Enter a valid date as MM/DD/YYYY." : "Enter a date.",
      );
      return;
    }
    if (!inRange(selected)) {
      setInputError(
        `Choose a date from ${formatCalendarDate(earliestDate)} to ${formatCalendarDate(latestDate)}.`,
      );
      return;
    }
    selectDate(selected);
  };

  const trigger = (
    <button
      ref={(node) => {
        buttonRef.current = node;
        if (typeof triggerRef === "function") triggerRef(node);
        else if (triggerRef) triggerRef.current = node;
      }}
      id={id}
      type="button"
      className={`date-control ${className ?? ""}`}
      disabled={disabled || readOnly}
      aria-required={required}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      data-testid={testId}
      aria-label={`${label || "Select date"}: ${date ? formatCalendarDate(date) : "No date selected"}`}
      title={date ? formatCalendarDate(date) : undefined}
    >
      <CalendarDays size={14} aria-hidden="true" />
      <span>{date ? formatCalendarDate(date) : "Select date"}</span>
    </button>
  );
  const calendar = (
    <>
      <div className="date-picker-entry">
        <label htmlFor={inputId}>Date (MM/DD/YYYY)</label>
        <div className="date-picker-entry-row">
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            placeholder="MM/DD/YYYY"
            aria-invalid={Boolean(inputError)}
            aria-describedby={`${inputId}-hint${inputError ? ` ${inputId}-error` : ""}`}
            onChange={(event) => {
              setDraft(event.target.value);
              setInputError("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              event.stopPropagation();
              applyTypedDate();
            }}
          />
          <button type="button" onClick={applyTypedDate}>
            Apply
          </button>
        </div>
        <p id={`${inputId}-hint`}>Slashes are optional for 8 digits.</p>
        {inputError && (
          <p
            id={`${inputId}-error`}
            className="date-picker-entry-error"
            role="alert"
          >
            {inputError}
          </p>
        )}
      </div>
      <Calendar
        mode="single"
        captionLayout="dropdown"
        startMonth={firstMonth}
        endMonth={lastMonth}
        disabled={[{ before: earliestDate }, { after: latestDate }]}
        required
        selected={date}
        onSelect={selectDate}
        month={month}
        onMonthChange={setMonth}
      />
      <div className="date-picker-footer">
        <span>{date ? formatCalendarDate(date) : "No date selected"}</span>
        {onClear && date && (
          <button
            type="button"
            onClick={() => {
              if (disabled || readOnly) return;
              onClear();
              setOpen(false);
            }}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          disabled={!inRange(today)}
          onClick={() => selectDate(today)}
        >
          Today
        </button>
      </div>
    </>
  );

  return (
    <ResponsivePicker
      open={open}
      onOpenChange={changeOpen}
      anchorRef={buttonRef}
      trigger={trigger}
      label={label || "Select date"}
    >
      {calendar}
    </ResponsivePicker>
  );
}
