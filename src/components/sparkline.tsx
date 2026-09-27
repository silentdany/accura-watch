/** Tiny inline trend line (server-rendered SVG). Gaps (NaN) break the line. */
export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
  fill = true,
  label,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  fill?: boolean;
  label?: string;
}) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) {
    return <div style={{ width, height }} className="rounded bg-muted/40" aria-hidden />;
  }
  const max = Math.max(...finite);
  const min = Math.min(0, ...finite);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const segments: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const line = segments.join("");
  const area = fill && segments.length === 1 ? `${line}L${width},${height}L0,${height}Z` : null;
  const lastIdx = values.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0).pop()!;
  const id = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "trend"} className="overflow-visible">
      {area ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      ) : null}
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastIdx)} cy={y(values[lastIdx])} r={2} fill={color} />
    </svg>
  );
}
