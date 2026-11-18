import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { DateControl } from "./date-control";
import { localDateKey, parseCalendarDate } from "@/lib/business-date";

type DateFieldProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "value" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
  "data-testid"?: string;
};

/** Preserve native date validation and form values behind the shared picker. */
export function DateField(props: DateFieldProps) {
  const native = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const [uncontrolled, setUncontrolled] = useState(props.defaultValue ?? "");
  const [label, setLabel] = useState("Select date");
  const [inheritedDisabled, setInheritedDisabled] = useState(false);
  const [error, setError] = useState("");
  const value = props.value ?? uncontrolled;

  useLayoutEffect(() => {
    const input = native.current!;
    if (input.validity.valid) setError("");
    const fieldLabel = input.closest(".field")?.querySelector("label");
    setLabel(
      props["aria-label"] ??
        fieldLabel?.textContent?.trim().replace(/\s*\*$/, "") ??
        "Select date",
    );
    if (fieldLabel && !fieldLabel.htmlFor) fieldLabel.htmlFor = id;
    const syncDisabled = () => setInheritedDisabled(input.matches(":disabled"));
    syncDisabled();
    const observer = new MutationObserver(syncDisabled);
    for (
      let owner: HTMLElement | null = input;
      owner;
      owner = owner.parentElement
    ) {
      if (owner === input || owner.tagName === "FIELDSET") {
        observer.observe(owner, {
          attributes: true,
          attributeFilter: ["disabled"],
        });
      }
    }
    // Read after the browser has performed the reset's default action.
    const reset = () =>
      window.setTimeout(() => {
        if (props.value === undefined) setUncontrolled(input.value);
        setError("");
      }, 0);
    const form = input.form;
    form?.addEventListener("reset", reset);
    return () => {
      observer.disconnect();
      form?.removeEventListener("reset", reset);
    };
  }, [id, props.disabled, props.value, props["aria-label"]]);

  const commit = (next: string) => {
    const input = native.current!;
    if (input.matches(":disabled") || input.readOnly) return;
    setError("");
    // Bypass React's value tracker so the real input event reaches onChange.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (props.value === undefined) setUncontrolled(input.value);
  };

  return (
    <div className="date-field">
      <input
        {...props}
        id={undefined}
        data-testid={undefined}
        type="date"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        data-date-value=""
        ref={native}
        onInvalid={(event) => {
          props.onInvalid?.(event);
          event.preventDefault();
          setError(event.currentTarget.validationMessage);
          if (
            event.currentTarget.form?.querySelector(
              "input:invalid, select:invalid, textarea:invalid",
            ) === event.currentTarget
          )
            trigger.current?.focus();
        }}
        onChange={(event) => {
          setError("");
          props.onChange?.(event);
        }}
      />
      <DateControl
        id={id}
        triggerRef={trigger}
        className={`date-field-trigger ${props.className ?? ""}`}
        date={parseCalendarDate(value) ?? undefined}
        onDateChange={(selected) => commit(localDateKey(selected))}
        onClear={() => commit("")}
        minDate={
          props.min
            ? (parseCalendarDate(String(props.min)) ?? undefined)
            : undefined
        }
        maxDate={
          props.max
            ? (parseCalendarDate(String(props.max)) ?? undefined)
            : undefined
        }
        label={label}
        disabled={props.disabled || inheritedDisabled}
        readOnly={props.readOnly}
        required={props.required}
        invalid={
          Boolean(error) ||
          props["aria-invalid"] === true ||
          props["aria-invalid"] === "true"
        }
        describedBy={
          [props["aria-describedby"], error ? `${id}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        testId={props["data-testid"] ?? `date-field-${id}`}
      />
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
