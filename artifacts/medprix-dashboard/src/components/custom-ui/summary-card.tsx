import type { ReactNode } from "react";

export function Summary({
  label,
  value,
  caption,
  tone,
  action,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card summary-box" style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          width: "100%",
          gap: 8,
        }}>
        <span>{label}</span>
        {action}
      </div>
      <strong>{value}</strong>
      <small style={tone === "warning" ? { color: "#ad7f16" } : undefined}>
        {caption}
      </small>
    </div>
  );
}

