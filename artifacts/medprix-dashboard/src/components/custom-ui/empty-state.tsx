import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

type EmptyStateProps = {
  children: ReactNode;
  icon?: LucideIcon;
};

export function EmptyState({ children, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <Icon size={28} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function TableEmptyState({
  colSpan,
  ...props
}: EmptyStateProps & { colSpan: number }) {
  return (
    <td colSpan={colSpan} className="empty-state-cell">
      <EmptyState {...props} />
    </td>
  );
}
