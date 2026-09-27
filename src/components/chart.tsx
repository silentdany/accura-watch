"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ChartSeries = { name: string; color: string; values: (number | null)[] };

type Props = {
  dates: string[];
  series: ChartSeries[];
  height?: number;
  kind?: "area" | "line" | "bar";
  /** Lower is better, draw axis top→bottom (e.g. search position). */
  invertY?: boolean;
  format?: "number" | "position" | "ms" | "pct";
  dateFormat?: "day" | "datetime";
  emptyLabel?: string;
  /**
   * Plot each series as an index of its own period average (100 = average) on one shared axis,
   * so two measures of different scale can be overlaid without a second y-axis. Tooltip keeps raw values.
   */
  indexed?: boolean;
  /** Extra tooltip-only rows (e.g. CTR under clicks/impressions). */
  extra?: { name: string; values: (number | null)[]; format?: Props["format"] }[];
};

const fmt = (v: number | null | undefined, f: Props["format"]) => {
  if (v == null || !Number.isFinite(v)) return "—";
  if (f === "position") return v.toFixed(1);
  if (f === "ms") return `${Math.round(v)} ms`;
  if (f === "pct") return `${(v * 100).toFixed(1)}%`;
  return Math.abs(v) >= 10_000
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v)
    : new Intl.NumberFormat("en").format(Math.round(v));
};

const fmtDate = (s: string, mode: Props["dateFormat"]) => {
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return mode === "datetime"
    ? d.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
};

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

export function TimeSeriesChart({
  dates,
  series,
  height = 200,
  kind = "area",
  invertY = false,
  format = "number",
  dateFormat = "day",
  emptyLabel = "No data yet",
  indexed = false,
  extra = [],
}: Props) {
  const raw = series;
  series = useMemo(() => {
    if (!indexed) return raw;
    return raw.map((s) => {
      const finite = s.values.filter((v): v is number => v != null && Number.isFinite(v));
      const mean = finite.reduce((a, v) => a + v, 0) / (finite.length || 1);
      return { ...s, values: s.values.map((v) => (v == null || !Number.isFinite(v) || !mean ? null : (v / mean) * 100)) };
    });
  }, [raw, indexed]);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padL = 44;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = dates.length;

  const { ticks, y, hasData } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v): v is number => v != null && Number.isFinite(v));
    if (!all.length) return { ticks: [0, 1], y: () => 0, hasData: false };
    const lo = format === "position" ? Math.max(1, Math.min(...all)) : Math.min(0, ...all);
    const hi = Math.max(...all);
    const t = niceTicks(format === "position" ? Math.floor(lo) : lo, hi);
    const tMin = t[0];
    const tMax = t[t.length - 1];
    const scale = (v: number) => {
      const r = (v - tMin) / (tMax - tMin || 1);
      return padT + (invertY ? r : 1 - r) * innerH;
    };
    return { ticks: t, y: scale, hasData: true };
  }, [series, format, invertY, innerH]);

  const x = (i: number) =>
    kind === "bar" ? padL + ((i + 0.5) / n) * innerW : padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);

  function pathFor(values: (number | null)[]): string {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const rel = (px - padL) / innerW;
    const i = kind === "bar" ? Math.floor(rel * n) : Math.round(rel * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  const baseY = invertY ? padT : padT + innerH;
  const barW = Math.max(1, (innerW / Math.max(n, 1)) * 0.7);

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }}>
      {!hasData ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <svg
          width={width}
          height={height}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={series.map((s) => s.name).join(", ")}
          className="touch-none"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[hsl(var(--subtle))] text-[10px] tabular">
                {format === "position" || format === "pct" ? fmt(t, format).replace(/\.0(%?)$/, "$1") : fmt(t, format)}
              </text>
            </g>
          ))}
          {labelIdx.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              className="fill-[hsl(var(--subtle))] text-[10px]"
            >
              {dates[i] ? fmtDate(dates[i], dateFormat) : ""}
            </text>
          ))}

          {series.map((s, si) => {
            if (kind === "bar") {
              return (
                <g key={s.name}>
                  {s.values.map((v, i) =>
                    v == null || !Number.isFinite(v) || v === 0 ? null : (
                      <rect
                        key={i}
                        x={x(i) - barW / 2}
                        y={Math.min(y(v), baseY)}
                        width={barW}
                        height={Math.max(1, Math.abs(baseY - y(v)))}
                        rx={Math.min(2, barW / 2)}
                        fill={s.color}
                        opacity={hover == null || hover === i ? 1 : 0.55}
                      />
                    ),
                  )}
                </g>
              );
            }
            const line = pathFor(s.values);
            const fillArea = kind === "area" && si === 0 && !s.values.some((v) => v == null || !Number.isFinite(v));
            const gid = `g-${s.name.replace(/\W/g, "")}-${si}`;
            return (
              <g key={s.name}>
                {fillArea ? (
                  <>
                    <defs>
                      <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <path d={`${line}L${x(n - 1)},${baseY}L${x(0)},${baseY}Z`} fill={`url(#${gid})`} />
                  </>
                ) : null}
                <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}

          {hover != null && kind !== "bar" ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="2 3" />
              {series.map((s) => {
                const v = s.values[hover];
                return v == null || !Number.isFinite(v) ? null : (
                  <circle key={s.name} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} />
                );
              })}
            </g>
          ) : null}
          <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" />
        </svg>
      )}

      {hover != null && hasData ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-32 rounded-md border border-border-strong bg-[hsl(220_10%_11%)] px-2.5 py-2 text-xs shadow-xl"
          style={{
            left: Math.min(Math.max(x(hover) + 12, 0), width - 150),
          }}
        >
          <p className="mb-1 text-[10px] text-muted-foreground">{fmtDate(dates[hover], dateFormat)}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-0.5 w-2.5 rounded" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tabular font-semibold text-foreground">{fmt(raw.find((r) => r.name === s.name)?.values[hover], format)}</span>
            </p>
          ))}
          {extra.map((e) => (
            <p key={e.name} className="mt-0.5 flex items-center justify-between gap-3 border-t border-border pt-0.5">
              <span className="text-muted-foreground">{e.name}</span>
              <span className="tabular font-semibold text-foreground">{fmt(e.values[hover], e.format ?? format)}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}
