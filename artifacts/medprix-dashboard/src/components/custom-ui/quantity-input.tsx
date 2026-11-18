import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

interface QuantityInputProps {
  id?: string;
  /** Last accepted quantity. The field falls back to this when left empty or at 0. */
  value: number;
  /** Highest quantity the cashier may enter (available stock). */
  max: number;
  /** Receives whole numbers from 1 to max: while typing, or only on Enter/blur when commitOnBlur is set. */
  onChange: (quantity: number) => void;
  /**
   * Number shown again when the cashier types more than max.
   * Defaults to the last accepted value (used by cart rows); the POS entry box passes 1.
   */
  resetTo?: number;
  /** Called once each time a typed number goes above max, so the page can explain the limit. */
  onExceed?: (max: number) => void;
  /** Called when Enter is pressed while the box is empty or 0, so the page can ask for a valid number. */
  onInvalidEnter?: () => void;
  /** Called on Enter instead of leaving the field (the POS entry box uses it to add to cart). */
  onEnter?: () => void;
  /** Apply the number only when the cashier finishes (Enter, Tab or clicking away). */
  commitOnBlur?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

const FLASH_CLASS = "quantity-flash";

/**
 * Whole-number quantity field for the POS.
 * - Clicking the field selects the number, so typing replaces it.
 * - The field may be empty while typing; leaving it empty (or at 0) restores the last accepted quantity.
 * - Typing more than max immediately puts resetTo back, flashes the field red and calls onExceed.
 */
export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(function QuantityInput(
  { id, value, max, onChange, resetTo, onExceed, onInvalidEnter, onEnter, commitOnBlur = false, disabled, className, style, ...aria },
  ref,
) {
  const [draft, setDraft] = useState(String(value));
  const input = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const cancelled = useRef(false);
  const selectAfterRender = useRef(false);
  useImperativeHandle(ref, () => input.current!, []);

  // Follow outside changes (product switched, item added, +/- buttons) when not typing.
  useLayoutEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  // After a reset, select the restored number so the next key replaces it instead of adding to it.
  useLayoutEffect(() => {
    if (selectAfterRender.current && document.activeElement === input.current) input.current?.select();
    selectAfterRender.current = false;
  }, [draft]);

  const flash = () => {
    const element = input.current;
    if (!element) return;
    element.classList.remove(FLASH_CLASS);
    void element.offsetWidth; // restart the animation if it is already running
    element.classList.add(FLASH_CLASS);
  };

  const typed = Number(draft);
  const invalid = draft === "" || typed < 1;

  return (
    <input
      ref={input}
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      className={className}
      style={style}
      aria-label={aria["aria-label"]}
      aria-describedby={aria["aria-describedby"]}
      aria-invalid={invalid}
      disabled={disabled}
      value={draft}
      onAnimationEnd={(event) => event.currentTarget.classList.remove(FLASH_CLASS)}
      onFocus={(event) => {
        focused.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
        const quantity = Number(digits);
        if (digits !== "" && quantity > max) {
          const restored = resetTo ?? value;
          setDraft(String(restored));
          selectAfterRender.current = true;
          if (!commitOnBlur && restored !== value) onChange(restored);
          flash();
          onExceed?.(max);
          return;
        }
        setDraft(digits);
        if (!commitOnBlur && digits !== "" && quantity >= 1) onChange(quantity);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          // An empty or 0 box is not a quantity: restore the last one instead of acting on it.
          if (invalid) {
            setDraft(String(value));
            selectAfterRender.current = true;
            onInvalidEnter?.();
          } else if (onEnter) onEnter();
          else event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        focused.current = false;
        if (commitOnBlur && !cancelled.current && draft !== "" && typed >= 1 && typed <= max && typed !== value) onChange(typed);
        cancelled.current = false;
        // Show the accepted value; if the caller accepted a new number, the effect above shows it.
        setDraft(String(value));
      }}
    />
  );
});
