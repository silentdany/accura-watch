/** Tiny inline trend line (server-rendered SVG). Gaps (null or NaN) break the line. */
function finiteOf(vals: (number | null)[]) {
  return vals.filter((v): v is number => v != null && Number.isFinite(v));
}

/** Each series is scaled to itself, so a companion of a different magnitude stays readable. */
function lineSegments(vals: (number | null)[], width: number, height: number): string[] {
  const finite = finiteOf(vals);
  if (finite.length < 2) return [];
  const max = Math.max(...finite);
  const min = Math.min(0, ...finite);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => (i / (vals.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const segments: string[] = [];
  let cur = "";
  vals.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  return segments;
}

function endPoint(vals: (number | null)[], width: number, height: number): { x: number; y: number } | null {
  let index = -1;
  for (let i = vals.length - 1; i >= 0; i -= 1) {
    if (vals[i] != null && Number.isFinite(vals[i])) {
      index = i;
      break;
    }
  }
  const v = index >= 0 ? vals[index] : null;
  if (v == null || !Number.isFinite(v) || vals.length < 2) return null;
  const finite = finiteOf(vals);
  const max = Math.max(...finite);
  const min = Math.min(0, ...finite);
  const span = max - min || 1;
  const pad = 2;
  return {
    x: (index / (vals.length - 1)) * width,
    y: pad + (1 - (v - min) / span) * (height - pad * 2),
  };
}

export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
  fill = true,
  label,
  fluid = false,
  companion,
  companionColor = "var(--c-companion)",
}: {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
  fill?: boolean;
  label?: string;
  /** Stretch to the container's width (keeps a constant stroke width). */
  fluid?: boolean;
  /** Second measure, drawn dashed and scaled on its own. */
  companion?: (number | null)[];
  companionColor?: string;
}) {
  const segments = lineSegments(values, width, height);
  const companionSegments = companion ? lineSegments(companion, width, height) : [];
  if (!segments.length && !companionSegments.length) {
    return <div style={{ width: fluid ? "100%" : width, height }} className="rounded bg-muted/60" aria-hidden />;
  }
  const line = segments.join("");
  const area = fill && segments.length === 1 ? `${line}L${width},${height}L0,${height}Z` : null;
  const end = fluid ? null : endPoint(values, width, height);
  const id = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : undefined}
      role="img"
      aria-label={label ?? "trend"}
      className="block overflow-visible"
    >
      {area ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      ) : null}
      {line ? <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
      {companionSegments.length ? (
        <path
          d={companionSegments.join("")}
          fill="none"
          stroke={companionColor}
          strokeWidth={1.75}
          strokeDasharray="3 2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {end ? <circle cx={end.x} cy={end.y} r={2.5} fill={color} stroke="hsl(var(--card))" strokeWidth={1.5} /> : null}
    </svg>
  );
}
