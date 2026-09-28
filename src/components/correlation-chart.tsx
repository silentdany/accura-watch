"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Correlation, MetricKey } from "@/lib/insights";
import { useI18n } from "@/i18n/client";

const COLOR: Record<MetricKey, string> = {
  links: "var(--c-seo)",
  latency: "var(--c-health)",
  errors: "var(--c-sentry)",
  impressions: "var(--c-companion)",
  clicks: "var(--c-gsc)",
  position: "var(--c-gsc)",
  visitors: "var(--c-posthog)",
};

/**
 * Cause as bars, effect as a line on top (the DataFast "revenue over visitors" idea). Each series keeps its
 * own scale and no value axis is drawn, so the chart never suggests the two are comparable in size; real
 * values are in the tooltip. Arrows join the biggest driver peaks to the outcome `lag` steps later.
 */
export function CorrelationChart({ c, height = 220 }: { c: Correlation; height?: number }) {
  const { t, f } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { dates, driver, outcome } = c.series;
  const n = dates.length;
  const barColor = COLOR[c.driver] === COLOR[c.outcome] ? "var(--c-companion)" : COLOR[c.driver];
  const lineColor = COLOR[c.outcome];
  const k = t.correlations;
  const unitLabel = (lag: number) => (c.unit === "week" ? t.time.weeks(lag) : t.time.days(lag));

  const fmt = (m: MetricKey, v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return "—";
    if (m === "latency") return f.ms(v);
    if (m === "position") return f.dec(v, 1);
    return f.num(v);
  };

  const geo = useMemo(() => {
    const w = width ?? 0;
    const padX = 8;
    const padT = 16;
    const padB = 24;
    const innerW = w - padX * 2;
    const innerH = height - padT - padB;
    const slot = innerW / Math.max(1, n);
    const x = (i: number) => padX + (i + 0.5) * slot;
    const dVals = driver.filter((v): v is number => v != null && v > 0);
    const dMax = Math.max(1, ...dVals);
    // Bars use the lower 60% of the plot so the line stays readable above them.
    const barH = (v: number | null) => (v == null || v <= 0 ? 0 : (v / dMax) * innerH * 0.6);
    const oVals = outcome.filter((v): v is number => v != null);
    const oMin = Math.min(...oVals);
    const oMax = Math.max(...oVals);
    const span = oMax - oMin || 1;
    const invert = c.outcome === "position";
    const yLine = (v: number) => padT + (invert ? (v - oMin) / span : 1 - (v - oMin) / span) * innerH * 0.92;
    let d = "";
    let pen = false;
    outcome.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${yLine(v).toFixed(1)}`;
      pen = true;
    });
    // Arrows from the 3 biggest driver peaks (well above the mean) to the outcome `lag` steps later.
    const mean = dVals.reduce((a, v) => a + v, 0) / (dVals.length || 1);
    const peaks =
      c.strength === "none"
        ? []
        : driver
            .map((v, i) => ({ v: v ?? 0, i }))
            .filter((p) => p.v > mean * 1.6 && p.i + c.lag < n && outcome[p.i + c.lag] != null)
            .sort((a, b) => b.v - a.v)
            // Keep peaks far enough apart that their arrows don't overlap.
            .reduce<{ v: number; i: number }[]>((kept, p) => (kept.length < 3 && kept.every((q) => Math.abs(q.i - p.i) > Math.max(3, c.lag * 2)) ? [...kept, p] : kept), [])
            .sort((a, b) => a.i - b.i);
    return { w, padT, padB, innerH, slot, x, barH, yLine, d, peaks, base: padT + innerH };
  }, [width, height, n, driver, outcome, c.outcome, c.lag, c.strength]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - 8) / geo.slot);
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-2.5 rounded-sm" style={{ background: barColor }} aria-hidden />
          {k.chartDriver[c.driver]}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-3.5 rounded-full" style={{ background: lineColor }} aria-hidden />
          {k.chartOutcome[c.outcome]}
        </span>
        <span className="text-subtle">{k.chartScales}</span>
      </div>
      <div ref={wrap} className="relative w-full select-none" style={{ height }}>
        {width == null ? null : (
          <svg width={geo.w} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${k.chartDriver[c.driver]}, ${k.chartOutcome[c.outcome]}`} className="touch-pan-y">
            <line x1={0} x2={geo.w} y1={geo.base} y2={geo.base} stroke="hsl(var(--border))" />
            {driver.map((v, i) => {
              const h = geo.barH(v);
              const isPeak = geo.peaks.some((p) => p.i === i);
              return h > 0 ? (
                <rect
                  key={i}
                  x={geo.x(i) - geo.slot * 0.32}
                  y={geo.base - h}
                  width={Math.max(1.5, geo.slot * 0.64)}
                  height={h}
                  rx={Math.min(3, geo.slot * 0.2)}
                  fill={barColor}
                  opacity={hover == null ? (isPeak || geo.peaks.length === 0 ? 0.95 : 0.4) : hover === i ? 1 : 0.35}
                />
              ) : null;
            })}
            <path d={geo.d} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {geo.peaks.map((p, idx) => {
              const x1 = geo.x(p.i);
              const y1 = geo.base - geo.barH(driver[p.i]) - 6;
              const x2 = geo.x(p.i + c.lag);
              const y2 = geo.yLine(outcome[p.i + c.lag]!) + (c.r > 0 ? -8 : 8);
              const mid = Math.min(y1, y2) - 26;
              return (
                <g key={p.i} pointerEvents="none">
                  <path
                    d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
                    fill="none"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    opacity={0.75}
                  />
                  <circle cx={x2} cy={geo.yLine(outcome[p.i + c.lag]!)} r={4.5} fill={lineColor} stroke="hsl(var(--card))" strokeWidth={2} />
                  {idx === 0 && c.lag ? (
                    <text x={(x1 + x2) / 2} y={mid - 4} textAnchor="middle" className="fill-[hsl(var(--foreground))] text-[11px] font-semibold">
                      {unitLabel(c.lag)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {hover != null ? <line x1={geo.x(hover)} x2={geo.x(hover)} y1={geo.padT} y2={geo.base} stroke="hsl(var(--border-strong))" pointerEvents="none" /> : null}
            {[0, n - 1].map((i) => (
              <text key={i} x={geo.x(i)} y={height - 6} textAnchor={i === 0 ? "start" : "end"} className="fill-[hsl(var(--subtle))] text-[11px]">
                {dates[i] ? (c.unit === "week" ? f.monthYear(dates[i]) : f.date(dates[i])) : ""}
              </text>
            ))}
          </svg>
        )}
        {hover != null && width != null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-44 rounded-lg bg-popover px-3 py-2 text-[13px] text-popover-foreground shadow-[var(--shadow-lg)]"
            style={{ left: Math.min(Math.max(geo.x(hover) + 12, 0), geo.w - 190) }}
          >
            <p className="mb-1 text-xs opacity-70">
              {c.unit === "week" ? k.weekOf(f.date(dates[hover])) : f.date(dates[hover])}
            </p>
            <p className="flex justify-between gap-4">
              <span className="opacity-85">{k.chartDriver[c.driver]}</span>
              <span className="tabular font-semibold">{fmt(c.driver, driver[hover])}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="opacity-85">{k.chartOutcome[c.outcome]}</span>
              <span className="tabular font-semibold">{fmt(c.outcome, outcome[hover])}</span>
            </p>
            {c.lag && hover + c.lag < n && c.strength !== "none" ? (
              <p className="mt-1 flex justify-between gap-4 border-t border-white/15 pt-1">
                <span className="opacity-85">{k.lagLater(unitLabel(c.lag))}</span>
                <span className="tabular font-semibold">{fmt(c.outcome, outcome[hover + c.lag])}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
