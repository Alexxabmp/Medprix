import { useEffect, useId, useRef, useState, type Ref } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  formatCalendarDate,
  localDateKey,
  parseCalendarDate,
} from "@/lib/business-date";
import { ResponsivePicker } from "./responsive-picker";
import { SelectField } from "./select-field";

export type DateTimeControlProps = {
  value: string;
  onChange: (value: string) => void;
  validate: (value: string) => string;
  label: string;
  min?: string;
  max?: string;
  id: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  triggerRef?: Ref<HTMLButtonElement>;
  testId?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");
function display(value: string) {
  const date = parseCalendarDate(value.slice(0, 10));
  if (!date) return "Select date and time";
  const hour = Number(value.slice(11, 13));
  return `${formatCalendarDate(date)} · ${pad(hour % 12 || 12)}:${value.slice(14, 16)} ${hour >= 12 ? "PM" : "AM"}`;
}

/** Local wall-clock values; timezone interpretation belongs to the caller. */
export function DateTimeControl(props: DateTimeControlProps) {
  const [open, setOpen] = useState(false);
  const [dateText, setDateText] = useState("");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [period, setPeriod] = useState("AM");
  const [month, setMonth] = useState(new Date());
  const [error, setError] = useState("");
  const anchor = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const parseDate = () => {
    const parts =
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateText.trim()) ??
      /^(\d{2})(\d{2})(\d{4})$/.exec(dateText.trim());
    return parts
      ? parseCalendarDate(
          `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`,
        )
      : null;
  };
  const selected = parseDate();
  const earliest =
    parseCalendarDate(props.min?.slice(0, 10) ?? "") ??
    parseCalendarDate("1900-01-01")!;
  const latest =
    parseCalendarDate(props.max?.slice(0, 10) ?? "") ??
    parseCalendarDate("2100-12-31")!;
  useEffect(() => {
    if (props.disabled || props.readOnly) setOpen(false);
  }, [props.disabled, props.readOnly]);
  const changeOpen = (next: boolean) => {
    if (next && (props.disabled || props.readOnly)) return;
    if (next) {
      const date = parseCalendarDate(props.value.slice(0, 10));
      const h = Number(props.value.slice(11, 13) || "0");
      setDateText(date ? formatCalendarDate(date) : "");
      const reference = date ?? new Date();
      setMonth(
        reference < earliest
          ? earliest
          : reference > latest
            ? latest
            : reference,
      );
      setHour(pad(h % 12 || 12));
      setMinute(props.value.slice(14, 16) || "00");
      setPeriod(h >= 12 ? "PM" : "AM");
      setError("");
    }
    setOpen(next);
  };
  const apply = () => {
    if (props.disabled || props.readOnly) return;
    if (!selected || selected < earliest || selected > latest) {
      setError("Enter a valid date within the allowed range as MM/DD/YYYY.");
      return;
    }
    if (
      !/^\d{1,2}$/.test(hour) ||
      Number(hour) < 1 ||
      Number(hour) > 12 ||
      !/^\d{1,2}$/.test(minute) ||
      Number(minute) > 59
    ) {
      setError("Use hours 1–12 and minutes 0–59.");
      return;
    }
    const time = `${pad((Number(hour) % 12) + (period === "PM" ? 12 : 0))}:${pad(Number(minute))}`;
    // Keep existing timestamp precision internal; users enter hours and minutes.
    const next = `${localDateKey(selected)}T${time}${props.value.slice(16)}`;
    const message = props.validate(next);
    if (message) {
      setError(message);
      return;
    }
    props.onChange(next);
    setOpen(false);
  };
  const text = display(props.value);
  const trigger = (
    <button
      ref={(node) => {
        anchor.current = node;
        if (typeof props.triggerRef === "function") props.triggerRef(node);
        else if (props.triggerRef) props.triggerRef.current = node;
      }}
      type="button"
      id={props.id}
      className={`date-control date-time-trigger ${props.className ?? ""}`}
      disabled={props.disabled || props.readOnly}
      aria-label={`${props.label}: ${text}`}
      aria-required={props.required}
      aria-invalid={props.invalid}
      aria-describedby={props.describedBy}
      data-testid={props.testId}
    >
      <CalendarDays size={14} aria-hidden="true" />
      <span>{text}</span>
    </button>
  );
  const timeField = (
    label: string,
    value: string,
    change: (value: string) => void,
    minimum: number,
    maximum: number,
  ) => (
    <label className="date-time-part">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${uid}-error` : undefined}
        maxLength={2}
        pattern="[0-9]*"
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => {
          if (value && Number(value) >= minimum) change(pad(Number(value)));
          else setError(`${label} must be from ${minimum} to ${maximum}.`);
        }}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^\d{0,2}$/.test(next) || (next && Number(next) > maximum)) {
            setError(`${label} must be from ${minimum} to ${maximum}.`);
            return;
          }
          change(next);
          setError("");
        }}
      />
    </label>
  );
  return (
    <ResponsivePicker
      open={open}
      onOpenChange={changeOpen}
      anchorRef={anchor}
      trigger={trigger}
      label={props.label}
      className="date-time-picker"
    >
      <div
        className="date-time-picker-body"
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.stopPropagation();
            apply();
          }
        }}
      >
        <div className="date-picker-entry">
          <label htmlFor={`${uid}-date`}>Date (MM/DD/YYYY)</label>
          <div className="date-picker-entry-row">
            <input
              id={`${uid}-date`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="MM/DD/YYYY"
              aria-invalid={Boolean(error)}
              aria-describedby={`${uid}-date-hint${error ? ` ${uid}-error` : ""}`}
              value={dateText}
              onChange={(event) => {
                setDateText(event.target.value);
                setError("");
              }}
            />
          </div>
          <p id={`${uid}-date-hint`}>Slashes are optional for 8 digits.</p>
        </div>
        <div
          className="date-time-entry"
          role="group"
          aria-label="Time"
          aria-describedby={error ? `${uid}-error` : undefined}
          aria-invalid={Boolean(error)}
        >
          {timeField("Hour", hour, setHour, 1, 12)}
          {timeField("Minute", minute, setMinute, 0, 59)}
          <div className="date-time-part">
            <label htmlFor={`${uid}-period`}>Period</label>
            <SelectField
              id={`${uid}-period`}
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                setError("");
              }}
            >
              <option>AM</option>
              <option>PM</option>
            </SelectField>
          </div>
        </div>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={earliest}
          endMonth={latest}
          month={month}
          onMonthChange={setMonth}
          selected={selected ?? undefined}
          required
          disabled={[{ before: earliest }, { after: latest }]}
          onSelect={(date) => {
            setDateText(formatCalendarDate(date));
            setError("");
          }}
        />
      </div>
      {error && (
        <p
          id={`${uid}-error`}
          className="date-picker-entry-error date-time-error"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="date-picker-footer date-time-actions">
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {props.value && (
          <button
            type="button"
            onClick={() => {
              if (!props.disabled && !props.readOnly) {
                props.onChange("");
                setOpen(false);
              }
            }}
          >
            Clear
          </button>
        )}
        <button type="button" className="date-time-apply" onClick={apply}>
          Apply
        </button>
      </div>
    </ResponsivePicker>
  );
}
