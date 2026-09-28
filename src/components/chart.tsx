"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";

/** A plotted series. `dashed` marks a companion series (drawn neutral + dashed, never a second hue). */
export type ChartSeries = { name: string; color: string; values: (number | null)[]; dashed?: boolean };

type Format = "number" | "position" | "ms" | "pct";

type Props = {
  dates: string[];
  series: ChartSeries[];
  height?: number;
  kind?: "area" | "line" | "bar";
  /** Lower is better, draw axis top→bottom (e.g. search position). */
  invertY?: boolean;
  format?: Format;
  dateFormat?: "day" | "datetime";
  emptyLabel?: string;
  /**
   * Plot each series as an index of its own period average (100 = average) on one shared axis,
   * so two measures of different scale can be overlaid without a second y-axis. Tooltip keeps raw values.
   */
  indexed?: boolean;
  /** Extra tooltip-only rows (e.g. CTR under clicks/impressions). */
  extra?: { name: string; values: (number | null)[]; format?: Format }[];
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
  series: raw,
  height = 220,
  kind = "area",
  invertY = false,
  format = "number",
  dateFormat = "day",
  emptyLabel,
  indexed = false,
  extra = [],
}: Props) {
  const { t, f } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  // null until measured: drawing at a guessed width overflows narrow screens before hydration.
  const [measured, setWidth] = useState<number | null>(null);
  const width = measured ?? 0;
  const [hover, setHover] = useState<number | null>(null);

  const fmt = (v: number | null | undefined, fm: Format = format) => {
    if (v == null || !Number.isFinite(v)) return "—";
    if (fm === "position") return f.dec(v, 1);
    if (fm === "ms") return f.ms(v);
    if (fm === "pct") return f.pct(v, 1);
    return f.num(v);
  };
  const fmtDate = (s: string) => (dateFormat === "datetime" ? f.dateTime(s) : f.date(s));

  const series = useMemo(() => {
    if (!indexed) return raw;
    return raw.map((s) => {
      const finite = s.values.filter((v): v is number => v != null && Number.isFinite(v));
      const mean = finite.reduce((a, v) => a + v, 0) / (finite.length || 1);
      return { ...s, values: s.values.map((v) => (v == null || !Number.isFinite(v) || !mean ? null : (v / mean) * 100)) };
    });
  }, [raw, indexed]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padR = 10;
  const padT = 12;
  const padB = 26;
  const innerH = height - padT - padB;
  const n = dates.length;

  const { ticks, y, hasData } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v): v is number => v != null && Number.isFinite(v));
    if (!all.length) return { ticks: [0, 1], y: () => 0, hasData: false };
    const lo = format === "position" ? Math.max(1, Math.min(...all)) : Math.min(0, ...all);
    const hi = Math.max(...all);
    const tk = niceTicks(format === "position" ? Math.floor(lo) : lo, hi);
    const tMin = tk[0];
    const tMax = tk[tk.length - 1];
    const scale = (v: number) => {
      const r = (v - tMin) / (tMax - tMin || 1);
      return padT + (invertY ? r : 1 - r) * innerH;
    };
    return { ticks: tk, y: scale, hasData: true };
  }, [series, format, invertY, innerH]);

  const tickLabel = (v: number) =>
    indexed ? f.num(v) : format === "pct" ? f.pct(v, 0) : format === "position" ? f.dec(v, 1).replace(/[.,]0$/, "") : fmt(v);
  // Left gutter sized to the widest tick label so "1 500 ms" never clips.
  const padL = Math.max(36, Math.max(...ticks.map((tk) => tickLabel(tk).length)) * 6.6 + 14);
  const innerW = width - padL - padR;

  const x = (i: number) => (kind === "bar" ? padL + ((i + 0.5) / n) * innerW : padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW));

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
    const rel = (e.clientX - rect.left - padL) / innerW;
    const i = kind === "bar" ? Math.floor(rel * n) : Math.round(rel * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  const labelIdx = n <= 1 ? [0] : width < 420 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  const baseY = invertY ? padT : padT + innerH;
  const barW = Math.max(1, (innerW / Math.max(n, 1)) * 0.68);

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }}>
      {!hasData ? (
        <div className="flex h-full items-center justify-center rounded-lg bg-muted/60 text-sm text-muted-foreground">{emptyLabel ?? t.chart.empty}</div>
      ) : measured == null ? null : (
        <svg
          width={width}
          height={height}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={raw.map((s) => s.name).join(", ")}
          className="touch-pan-y"
        >
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={padL} x2={width - padR} y1={y(tk)} y2={y(tk)} stroke="hsl(var(--border))" strokeWidth={1} />
              <text x={padL - 10} y={y(tk)} dy="0.32em" textAnchor="end" className="tabular fill-[hsl(var(--subtle))] text-[11px]">
                {tickLabel(tk)}
              </text>
            </g>
          ))}
          {labelIdx.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              className="fill-[hsl(var(--subtle))] text-[11px]"
            >
              {dates[i] ? fmtDate(dates[i]) : ""}
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
                        rx={Math.min(3, barW / 2)}
                        fill={s.color}
                        opacity={hover == null || hover === i ? 1 : 0.45}
                      />
                    ),
                  )}
                </g>
              );
            }
            const line = pathFor(s.values);
            const fillArea = kind === "area" && si === 0 && !s.dashed && !s.values.some((v) => v == null || !Number.isFinite(v));
            const gid = `g-${s.name.replace(/\W/g, "")}-${si}`;
            return (
              <g key={s.name}>
                {fillArea ? (
                  <>
                    <defs>
                      <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <path d={`${line}L${x(n - 1)},${baseY}L${x(0)},${baseY}Z`} fill={`url(#${gid})`} />
                  </>
                ) : null}
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.dashed ? 1.75 : 2.25}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {hover != null && kind !== "bar" ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="hsl(var(--border-strong))" strokeWidth={1} />
              {series.map((s) => {
                const v = s.values[hover];
                return v == null || !Number.isFinite(v) ? null : (
                  <circle key={s.name} cx={x(hover)} cy={y(v)} r={4.5} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} />
                );
              })}
            </g>
          ) : null}
          <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" />
        </svg>
      )}

      {hover != null && hasData ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg bg-popover px-3 py-2 text-[13px] text-popover-foreground shadow-[var(--shadow-lg)]"
          style={{ left: Math.min(Math.max(x(hover) + 14, 0), width - 176) }}
        >
          <p className="mb-1 text-xs opacity-70">{fmtDate(dates[hover])}</p>
          {raw.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 opacity-85">
                <Swatch color={s.color} dashed={s.dashed} />
                {s.name}
              </span>
              <span className="tabular font-semibold">{fmt(s.values[hover])}</span>
            </p>
          ))}
          {extra.map((e) => (
            <p key={e.name} className="mt-1 flex items-center justify-between gap-4 border-t border-white/15 pt-1">
              <span className="opacity-85">{e.name}</span>
              <span className="tabular font-semibold">{fmt(e.values[hover], e.format ?? format)}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <svg width="14" height="4" aria-hidden>
      <line x1="0" x2="14" y1="2" y2="2" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
    </svg>
  ) : (
    <span className="h-1 w-3.5 rounded-full" style={{ background: color }} aria-hidden />
  );
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5">
          <Swatch color={i.color} dashed={i.dashed} />
          {i.name}
        </span>
      ))}
    </div>
  );
}
