import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={12}
      sticky="always"
      hideWhenDetached
      className={cn("app-tooltip", className)}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/** Shared appearance everywhere, with tighter collision bounds in dialog bodies. */
const AppTooltip = React.forwardRef<
  HTMLElement,
  Omit<React.HTMLAttributes<HTMLElement>, "content"> & {
    content: React.ReactNode;
    children: React.ReactElement;
  }
>(function AppTooltip(
  { content, children, onClick, ...triggerProps },
  forwardedRef,
) {
  const childProps = children.props as {
    disabled?: boolean;
    className?: string;
    tabIndex?: number;
  };
  const triggerChild =
    children.type === "span" && childProps.tabIndex === undefined
      ? React.cloneElement(
          children as React.ReactElement<{ tabIndex?: number }>,
          { tabIndex: 0 },
        )
      : children;
  const [open, setOpen] = React.useState(false);
  const [boundary, setBoundary] = React.useState<HTMLElement | null>(null);
  const captureTrigger = React.useCallback(
    (node: HTMLElement | null) => {
      setBoundary(
        node?.closest<HTMLElement>(
          ".modal-table-body, .wholesale-dialog-body, .product-form-body, [data-dialog-body]",
        ) ?? null,
      );
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  if (content === undefined || content === null || content === "")
    return children;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        {...triggerProps}
        asChild
        ref={captureTrigger}
        onClick={(event) => {
          onClick?.(event);
          if (childProps.className?.split(" ").includes("modal-table-value")) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {childProps.disabled ? (
          <span
            className="tooltip-disabled-trigger"
            tabIndex={0}
            aria-label={typeof content === "string" ? content : undefined}
          >
            {children}
          </span>
        ) : (
          triggerChild
        )}
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={6}
        collisionBoundary={boundary ?? undefined}
        collisionPadding={12}
        sticky="always"
        hideWhenDetached
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
});

function TableValue({ value }: { value: string }) {
  return (
    <AppTooltip content={value}>
      <button
        type="button"
        className="modal-table-value"
        aria-label={"Show full value: " + value}
      >
        {value}
      </button>
    </AppTooltip>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  AppTooltip,
  TableValue,
};
