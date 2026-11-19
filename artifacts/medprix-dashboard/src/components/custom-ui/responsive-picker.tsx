import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const phoneQuery =
  "(max-width: 760px), (max-width: 1023px) and (max-height: 480px)";
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const isPhone = () => window.matchMedia(phoneQuery).matches;

/** Shared calendar surface: anchored on larger screens, centered on phones. */
export function ResponsivePicker({
  open,
  onOpenChange,
  anchorRef,
  trigger,
  label,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  trigger: ReactElement;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const mobile = useSyncExternalStore(subscribe, isPhone, () => false);
  const [layer, setLayer] = useState(50);
  const panel = useRef<HTMLDivElement>(null);
  const changeOpen = (next: boolean) => {
    if (next) {
      let nextLayer = 50;
      for (
        let owner = anchorRef.current?.parentElement;
        owner;
        owner = owner.parentElement
      ) {
        const ownerLayer = Number.parseInt(getComputedStyle(owner).zIndex);
        if (Number.isFinite(ownerLayer))
          nextLayer = Math.max(nextLayer, ownerLayer + 10);
      }
      setLayer(nextLayer);
    }
    onOpenChange(next);
  };
  const focusPanel = (event: Event) => {
    event.preventDefault();
    panel.current?.focus({ preventScroll: true });
  };
  if (mobile)
    return (
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            className="date-picker-backdrop"
            style={{ zIndex: layer }}
          >
            <Dialog.Content
              ref={panel}
              className={`date-picker-popover date-picker-dialog ${className}`}
              style={{ zIndex: layer }}
              aria-describedby={undefined}
              onOpenAutoFocus={focusPanel}
              onEscapeKeyDown={(event) => event.stopPropagation()}
            >
              <div className="date-picker-dialog-header">
                <Dialog.Title>{label}</Dialog.Title>
                <Dialog.Close aria-label="Close date picker">
                  <X size={16} aria-hidden="true" />
                </Dialog.Close>
              </div>
              {children}
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    );
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        ref={panel}
        className={`date-picker-popover ${className}`}
        style={{ zIndex: layer }}
        align="end"
        collisionPadding={12}
        aria-label={label}
        onOpenAutoFocus={focusPanel}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
