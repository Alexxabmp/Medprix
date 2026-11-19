import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from "react";
import { ChoicePicker, type Choice } from "./choice-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectFieldProps = ComponentPropsWithoutRef<"select"> & {
  "data-testid"?: string;
  pickerLabel?: string;
  searchable?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  shouldFilter?: boolean;
  footerAction?: { label: string; onClick: () => void };
  optionsError?: string;
  optionsLoading?: boolean;
  onRetryOptions?: () => void;
};

/** One form-value bridge for custom finite selects and searchable entity lists. */
export function SelectField({
  pickerLabel,
  searchable = false,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  shouldFilter,
  footerAction,
  optionsError,
  optionsLoading,
  onRetryOptions,
  ...props
}: SelectFieldProps) {
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [options, setOptions] = useState<Choice[]>([]);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [inheritedDisabled, setInheritedDisabled] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [uncontrolled, setUncontrolled] = useState("");
  const [open, setOpen] = useState(false);
  const [itemsReady, setItemsReady] = useState(false);
  const [layout, setLayout] = useState<CSSProperties>({});
  const [layer, setLayer] = useState(1100);
  const preserveFocus = useRef(false);
  const pendingSelection = useRef<string | null>(null);
  const restoreAfterRetry = useRef(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const [inferredLabel, setInferredLabel] = useState("");
  useLayoutEffect(() => {
    const select = native.current!;
    const next = Array.from(select.options).map((option) => ({
      id: option.value,
      label: option.textContent?.trim().replace(/\s+/g, " ") ?? "",
      detail: "",
      disabled:
        option.disabled || Boolean(option.closest("optgroup")?.disabled),
    }));
    setOptions(next);
    if (props.value === undefined) setUncontrolled(select.value);
    setInferredLabel(
      select.closest(".field")?.querySelector("label")?.textContent?.trim() ??
        "Choose option",
    );
    setContainer(select.closest<HTMLElement>(".modal-backdrop"));
    const owner = select.closest<HTMLElement>(".modal, [role=dialog]");
    const ownerLayer = owner ? parseInt(getComputedStyle(owner).zIndex) : 0;
    setLayer(Math.max(1100, Number.isFinite(ownerLayer) ? ownerLayer + 1 : 0));
    const style = getComputedStyle(select);
    const inline = Boolean(select.closest("td"));
    let protectedWidth: number | undefined;
    // Only table-cell selects need an intrinsic width. Measuring every option
    // in a form select blocks opening calendars with long year lists.
    if (inline) {
      const context = document.createElement("canvas").getContext("2d")!;
      context.font =
        style.font ||
        `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const optionWidth = Math.max(
        0,
        ...next.map((option) => context.measureText(option.label).width),
      );
      protectedWidth = Math.ceil(
        optionWidth +
          parseFloat(style.paddingLeft) +
          parseFloat(style.paddingRight) +
          parseFloat(style.borderLeftWidth) +
          parseFloat(style.borderRightWidth) +
          24,
      );
    }
    setLayout({
      height: style.height === "auto" ? undefined : style.height,
      padding: style.padding === "0px" ? undefined : style.padding,
      borderRadius:
        style.borderRadius === "0px" ? undefined : style.borderRadius,
      ...(inline ? { width: "auto", minWidth: protectedWidth } : {}),
    });
    const ancestors: HTMLElement[] = [];
    let ancestor: HTMLElement | null = select;
    while (ancestor) {
      if (ancestor.tagName === "FIELDSET" || ancestor === select)
        ancestors.push(ancestor);
      ancestor = ancestor.parentElement;
    }
    const sync = () => setInheritedDisabled(select.matches(":disabled"));
    sync();
    const observer = new MutationObserver(sync);
    ancestors.forEach((element) =>
      observer.observe(element, {
        attributes: true,
        attributeFilter: ["disabled"],
      }),
    );
    return () => observer.disconnect();
  }, [props.children, props.disabled, props.value]);
  const blocked = props.disabled || inheritedDisabled;
  useLayoutEffect(() => {
    if (blocked) setOpen(false);
    if (restoreAfterRetry.current && !optionsError && !blocked) {
      restoreAfterRetry.current = false;
      // Restore keyboard continuity after loading, unless the user moved on.
      if (document.activeElement === document.body)
        trigger.current?.focus({ preventScroll: true });
    }
  }, [blocked, optionsError]);
  const value = props.value === undefined ? uncontrolled : String(props.value);
  const label = pickerLabel ?? props["aria-label"] ?? inferredLabel;
  const empty = options.find((option) => option.id === "");
  const describedBy =
    [props["aria-describedby"], validationMessage ? `${id}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const invalid =
    Boolean(validationMessage) ||
    props["aria-invalid"] === true ||
    props["aria-invalid"] === "true";
  const commit = (value: string) => {
    const select = native.current!;
    if (select.matches(":disabled")) return;
    const previousFocus = document.activeElement;
    setValidationMessage("");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    if (props.value === undefined) setUncontrolled(select.value);
    preserveFocus.current ||= document.activeElement !== previousFocus;
  };
  return (
    <>
      <select
        {...props}
        id={undefined}
        data-testid={undefined}
        ref={native}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        aria-invalid={undefined}
        aria-describedby={undefined}
        data-select-value=""
        onInvalid={(event) => {
          props.onInvalid?.(event);
          event.preventDefault();
          setValidationMessage(event.currentTarget.validationMessage);
          if (
            event.currentTarget.form?.querySelector(
              "select:invalid, input:invalid, textarea:invalid",
            ) === event.currentTarget
          )
            trigger.current?.focus();
        }}
      />
      {searchable || optionsError || optionsLoading !== undefined ? (
        <ChoicePicker
          ref={trigger}
          id={id}
          className={props.className}
          style={{ ...layout, ...props.style }}
          data-testid={props["data-testid"]}
          footerAction={footerAction}
          error={optionsError}
          loading={optionsLoading}
          onRetry={
            onRetryOptions
              ? () => {
                  restoreAfterRetry.current = true;
                  onRetryOptions();
                }
              : undefined
          }
          showSearch={searchable}
          label={label}
          placeholder={empty?.label ?? `Select ${label.toLowerCase()}`}
          searchPlaceholder={
            searchPlaceholder ?? `Search ${label.toLowerCase()}`
          }
          emptyMessage="No matching options."
          options={options.filter(
            (option) =>
              option.id !== "" || (!props.required && !option.disabled),
          )}
          value={value}
          required={Boolean(props.required)}
          invalid={invalid}
          busy={props["aria-busy"] === true || props["aria-busy"] === "true"}
          describedBy={describedBy}
          disabled={blocked}
          popupContainer={container}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          shouldFilter={shouldFilter}
          onChange={commit}
        />
      ) : (
        <Select
          open={open}
          onOpenChange={setOpen}
          disabled={blocked}
          value={
            options.some((option) => option.id === value)
              ? `option-${options.findIndex((option) => option.id === value)}`
              : ""
          }
          onValueChange={(key) => {
            // Radix's form bridge can emit an empty initialization value.
            // Only option identities may reach the existing form handler.
            if (!/^option-\d+$/.test(key)) return;
            const option = options[Number(key.slice(7))];
            if (option && !option.disabled && option.id !== value) {
              if (open) {
                // Let the modal select release its focus trap before handlers
                // validate a duplicate and focus another form field.
                pendingSelection.current = option.id;
                setOpen(false);
              } else commit(option.id);
            }
          }}
        >
          <SelectTrigger
            ref={trigger}
            id={id}
            data-testid={props["data-testid"]}
            className={`app-select-trigger ${props.className ?? ""}`}
            style={{ ...layout, ...props.style }}
            aria-label={label}
            aria-required={props.required}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            aria-busy={props["aria-busy"]}
            onFocus={(event) => {
              // Keep closed-trigger typeahead once the user focuses this select,
              // without mounting every hidden item when its parent first opens.
              setItemsReady(true);
              (
                props.onFocus as ComponentPropsWithoutRef<"button">["onFocus"]
              )?.(event);
            }}
            onBlur={
              props.onBlur as ComponentPropsWithoutRef<"button">["onBlur"]
            }
          >
            <SelectValue placeholder={empty?.label ?? "Select option"}>
              {options.find((option) => option.id === value)?.label ??
                empty?.label ??
                "Select option"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            portalContainer={container}
            className="app-select-menu"
            style={{ zIndex: layer }}
            collisionPadding={12}
            sideOffset={5}
            onEscapeKeyDown={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              if (pendingSelection.current !== null) {
                const next = pendingSelection.current;
                pendingSelection.current = null;
                commit(next);
              }
              if (preserveFocus.current) event.preventDefault();
              preserveFocus.current = false;
            }}
          >
            {(open || itemsReady) &&
              options.map((option, index) =>
                option.id === "" && option.disabled ? null : (
                  <SelectItem
                    key={`${option.id}-${index}`}
                    value={`option-${index}`}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </SelectItem>
                ),
              )}
          </SelectContent>
        </Select>
      )}
      {validationMessage && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {validationMessage}
        </span>
      )}
    </>
  );
}
