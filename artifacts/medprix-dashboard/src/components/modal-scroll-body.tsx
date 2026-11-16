import type { HTMLAttributes } from "react";

/** Shared scrolling surface for form and table dialogs. */
export function ModalScrollBody({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`modal-scroll-body ${className}`} />;
}
