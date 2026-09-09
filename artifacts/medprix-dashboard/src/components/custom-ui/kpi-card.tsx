import { type LucideIcon } from "lucide-react";

export function Kpi({
  label,
  value,
  change,
  icon: Icon,
  onClick,
  testId,
}: {
  label: string;
  value: string;
  change: string;
  icon: LucideIcon;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <div
      className="surface-card kpi-card"
      data-testid={testId ?? `metric-${label.toLowerCase()}`}
      onClick={onClick}
      style={
        onClick
          ? { cursor: "pointer", transition: "transform .2s, box-shadow .2s" }
          : undefined
      }
      onMouseEnter={
        onClick
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform =
                "translateY(-3px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "var(--shadow-lift)";
            }
          : undefined
      }
      onMouseLeave={
        onClick
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "";
            }
          : undefined
      }>
      <div className="kpi-top">
        <span>{label}</span>
        <span className="kpi-icon">
          <Icon size={15} />
        </span>
      </div>
      <div className="kpi-value">
        {value}
        <span className="kpi-change">{change}</span>
      </div>
    </div>
  );
}
