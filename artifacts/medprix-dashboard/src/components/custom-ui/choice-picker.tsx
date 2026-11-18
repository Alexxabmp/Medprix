import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { AlertCircle, Check, ChevronDown, LoaderCircle } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type Choice = {
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
};
export type ChoicePickerProps = {
  id: string;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: Choice[];
  value: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  loading?: boolean;
  busy?: boolean;
  error?: string;
  onRetry?: () => void;
  popupContainer: HTMLElement | null;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  shouldFilter?: boolean;
  className?: string;
  style?: CSSProperties;
  showSearch?: boolean;
  "data-testid"?: string;
  footerAction?: { label: string; onClick: () => void };
  onChange: (id: string) => void;
};

/** Shared searchable single choice; parents own fetching, validity and domain effects. */
export const ChoicePicker = forwardRef<HTMLButtonElement, ChoicePickerProps>(
  function ChoicePicker(
    {
      id,
      label,
      placeholder,
      searchPlaceholder,
      emptyMessage,
      options,
      value,
      disabled = false,
      required = true,
      invalid,
      describedBy,
      loading,
      busy,
      error,
      onRetry,
      popupContainer,
      searchValue,
      onSearchChange,
      shouldFilter = true,
      className,
      style,
      showSearch = true,
      "data-testid": testId,
      footerAction,
      onChange,
    },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const [sizingText, setSizingText] = useState("");
    const popupId = useId();
    const statusId = useId();
    const searchInput = useRef<HTMLInputElement>(null);
    const retryButton = useRef<HTMLButtonElement>(null);
    const preserveCallerFocus = useRef(false);
    const pendingAction = useRef<(() => void) | null>(null);
    const selected = options.find((option) => option.id === value);
    const blocked = disabled || loading;
    const changeOpen = (next: boolean) => {
      if (blocked) return;
      if (next && !open) {
        // Keep intrinsic width independent of cmdk filtering and externally
        // filtered options (POS). Refresh only when starting a new open session.
        setSizingText(
          [
            ...options.flatMap((option) => [option.label, option.detail]),
            emptyMessage,
            error ?? "",
            footerAction?.label ?? "",
          ].join("\n"),
        );
      }
      setOpen(next);
    };
    useEffect(() => {
      if (blocked) setOpen(false);
    }, [blocked]);
    return (
      <>
        <Popover.Root open={open} onOpenChange={changeOpen}>
          <Popover.Trigger asChild>
            <button
              ref={ref}
              id={id}
              type="button"
              className={`receiving-batch-trigger receiving-choice-trigger ${className ?? ""}`}
              style={style}
              data-testid={testId}
              role="combobox"
              aria-haspopup="dialog"
              aria-controls={open ? popupId : undefined}
              aria-label={label}
              aria-required={required}
              aria-expanded={open}
              disabled={blocked}
              aria-invalid={invalid || Boolean(error)}
              aria-busy={loading || busy || undefined}
              aria-describedby={
                [describedBy, error || loading ? statusId : ""]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  changeOpen(true);
                }
              }}
            >
              <span>
                {loading
                  ? "Loading options…"
                  : (selected?.label ??
                    (error ? "Options unavailable" : placeholder))}
              </span>
              {loading || busy ? <LoaderCircle size={14} className="spin action-spinner" aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            </button>
          </Popover.Trigger>
          <Popover.Portal container={popupContainer}>
            <Popover.Content
              id={popupId}
              role="dialog"
              aria-label={`${label} options`}
              className="receiving-batch-menu receiving-choice-menu"
              align="start"
              sticky="always"
              collisionBoundary={popupContainer ?? undefined}
              sideOffset={6}
              collisionPadding={18}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                (showSearch
                  ? searchInput.current
                  : retryButton.current
                )?.focus();
              }}
              onCloseAutoFocus={(event) => {
                if (pendingAction.current) {
                  event.preventDefault();
                  const action = pendingAction.current;
                  pendingAction.current = null;
                  action();
                }
                if (preserveCallerFocus.current) event.preventDefault();
                preserveCallerFocus.current = false;
              }}
              onEscapeKeyDown={(event) => event.stopPropagation()}
            >
              <div className="choice-menu-sizer" aria-hidden="true">
                {sizingText}
              </div>
              {!showSearch && error && (
                <p className="choice-menu-error action-error-copy">
                  <AlertCircle size={14} aria-hidden="true" /><span>{error}</span>
                </p>
              )}
              {!showSearch && error && options.length === 0 ? null : (
                <Command shouldFilter={shouldFilter} label={searchPlaceholder}>
                  {showSearch && (
                    <CommandInput
                      ref={searchInput}
                      placeholder={searchPlaceholder}
                      aria-label={searchPlaceholder}
                      value={searchValue}
                      onValueChange={onSearchChange}
                    />
                  )}
                  <CommandList label={`${label} options`}>
                    <CommandEmpty>{error || emptyMessage}</CommandEmpty>
                    {options.map((option, index) => (
                      <CommandItem
                        key={option.id}
                        value={option.id || `empty-choice-${index}`}
                        keywords={[option.label, option.detail]}
                        disabled={option.disabled || blocked}
                        data-current={option.id === value || undefined}
                        onSelect={() => {
                          if (blocked || option.disabled) return;
                          const previousFocus = document.activeElement;
                          onChange(option.id);
                          // Some existing handlers reject duplicates and focus the original quantity.
                          preserveCallerFocus.current =
                            document.activeElement !== previousFocus;
                          setOpen(false);
                        }}
                      >
                        <Check
                          size={14}
                          aria-hidden="true"
                          style={{
                            visibility:
                              option.id === value ? "visible" : "hidden",
                            flexShrink: 0,
                          }}
                        />
                        <span>
                          <strong>{option.label}</strong>
                          {option.detail && <small>{option.detail}</small>}
                          {option.id === value && (
                            <span className="sr-only">Current selection</span>
                          )}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              )}
              {error && onRetry && (
                <button
                  ref={retryButton}
                  type="button"
                  className="receiving-new-batch"
                  disabled={busy || loading}
                  onClick={onRetry}
                >
                  Retry loading
                </button>
              )}
              {footerAction && (
                <button
                  type="button"
                  className="receiving-new-batch"
                  onClick={() => {
                    pendingAction.current = footerAction.onClick;
                    setOpen(false);
                  }}
                >
                  {footerAction.label}
                </button>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {(error || loading) && (
          <span
            id={statusId}
            role={error ? "alert" : "status"}
            className="sr-only"
          >
            {error || "Loading options…"}
          </span>
        )}
      </>
    );
  },
);
