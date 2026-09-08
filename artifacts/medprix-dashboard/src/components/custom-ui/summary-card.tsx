export function Summary({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: string;
}) {
  return (
    <div className="surface-card summary-box">
      <span>{label}</span>
      <strong>{value}</strong>
      <small style={tone === "warning" ? { color: "#ad7f16" } : undefined}>
        {caption}
      </small>
    </div>
  );
}
