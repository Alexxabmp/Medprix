import { movementFast, movementSlow } from "@/lib/data";

export function MovementLineGraph() {
  const paddingLeft = 35;
  const paddingRight = 15;
  const paddingTop = 25;
  const paddingBottom = 30;
  const chartWidth = 350;
  const chartHeight = 170;

  const width = chartWidth - paddingLeft - paddingRight;
  const height = chartHeight - paddingTop - paddingBottom;

  const maxVal = Math.max(
    ...movementFast.map((d) => d.units),
    ...movementSlow.map((d) => d.units),
    10,
  );
  const yMax = maxVal * 1.15;

  const getX = (index: number) => paddingLeft + (index / 2) * width;
  const getY = (val: number) => paddingTop + height - (val / yMax) * height;

  const fastPoints = movementFast.map((d, i) => ({
    x: getX(i),
    y: getY(d.units),
    label: d.units,
    name: d.name,
  }));
  const slowPoints = movementSlow.map((d, i) => ({
    x: getX(i),
    y: getY(d.units),
    label: d.units,
    name: d.name,
  }));

  const fastPath = `M ${fastPoints[0].x} ${fastPoints[0].y} L ${fastPoints[1].x} ${fastPoints[1].y} L ${fastPoints[2].x} ${fastPoints[2].y}`;
  const slowPath = `M ${slowPoints[0].x} ${slowPoints[0].y} L ${slowPoints[1].x} ${slowPoints[1].y} L ${slowPoints[2].x} ${slowPoints[2].y}`;

  return (
    <div style={{ padding: "5px 0 0" }}>
      <div
        style={{
          display: "flex",
          gap: 15,
          fontSize: 10,
          color: "hsl(var(--muted))",
          marginBottom: 15,
          justifyContent: "center",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 3,
              background: "hsl(var(--foreground))",
            }}
          />
          <span style={{ fontWeight: 500 }}>Fast Movers</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 3,
              borderTop: "2.5px dashed hsl(var(--muted))",
            }}
          />
          <span style={{ fontWeight: 500 }}>Slow Movers</span>
        </div>
      </div>
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ overflow: "visible" }}>
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const val = Math.round(yMax * ratio);
          const y = paddingTop + height - ratio * height;
          return (
            <g key={ratio} style={{ opacity: 0.15 }}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="hsl(var(--foreground))"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={paddingLeft - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9px"
                fill="hsl(var(--foreground))">
                {val}
              </text>
            </g>
          );
        })}

        {/* Lines */}
        <path
          d={fastPath}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={slowPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Fast points & labels */}
        {fastPoints.map((p, i) => (
          <g key={`fast-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={4.5}
              fill="hsl(var(--surface))"
              stroke="hsl(var(--foreground))"
              strokeWidth={2.5}
            />
            <text
              x={p.x}
              y={p.y - 10}
              textAnchor="middle"
              fontSize="9px"
              fontWeight="600"
              fill="hsl(var(--foreground))">
              {p.label}
            </text>
          </g>
        ))}

        {/* Slow points & labels */}
        {slowPoints.map((p, i) => (
          <g key={`slow-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill="hsl(var(--surface))"
              stroke="hsl(var(--muted))"
              strokeWidth={1.5}
            />
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="9px"
              fontWeight="500"
              fill="hsl(var(--muted))">
              {p.label}
            </text>
          </g>
        ))}

        {/* X Axis Labels */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <text
              x={getX(i)}
              y={paddingTop + height + 15}
              textAnchor="middle"
              fontSize="9px"
              fill="hsl(var(--foreground))"
              fontWeight="600">
              {`Rank ${i + 1}`}
            </text>
            <text
              x={getX(i)}
              y={paddingTop + height + 26}
              textAnchor="middle"
              fontSize="8.5px"
              fill="hsl(var(--muted))"
              style={{ maxWidth: 80 }}>
              {movementFast[i].name.split(" ")[0]} /{" "}
              {movementSlow[i].name.split(" ")[0]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
