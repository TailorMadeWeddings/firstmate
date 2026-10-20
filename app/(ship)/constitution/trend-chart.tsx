"use client";

import { useEffect, useRef, useState } from "react";

export type TrendPoint = { date: string; value: number; detail: string[] };

const M = { top: 14, right: 14, bottom: 26, left: 44 };

const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
const short = (s: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Date(day(s)).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

/** Round, readable gridline values covering [lo, hi]. */
function ticks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * One measure over time, with the baseline as a dashed reference line and
 * no goal lines. Hover, or tap on a phone, for that week's (or day's)
 * details. A single series, so the title names it and there's no legend.
 */
export function TrendChart({
  label,
  unit,
  points,
  baseline,
  height,
  tone,
  per = "week",
}: {
  label: string;
  unit: string;
  points: TrendPoint[];
  baseline: { date: string; value: number } | null;
  height: number;
  tone: "primary" | "muted";
  per?: "week" | "day";
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  if (points.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No {label.toLowerCase()} readings yet.</p>;
  }

  const values = [...points.map((p) => p.value), ...(baseline ? [baseline.value] : [])];
  const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.12, 0.5);
  const lo = Math.min(...values) - pad;
  const hi = Math.max(...values) + pad;
  const start = Math.min(day(points[0].date), baseline ? day(baseline.date) : Infinity);
  const end = Math.max(day(points.at(-1)!.date), start + 86_400_000);
  const innerW = Math.max(width - M.left - M.right, 1);
  const innerH = height - M.top - M.bottom;
  const x = (d: string) => M.left + ((day(d) - start) / (end - start)) * innerW;
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * innerH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const colour = tone === "primary" ? "text-primary dark:text-blue-400" : "text-foreground/60";

  // Month labels along the bottom, thinned so they never crowd.
  const months: string[] = [];
  for (let d = new Date(start); d.getTime() <= end; d.setUTCMonth(d.getUTCMonth() + 1, 1)) {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    if (first.getTime() >= start) months.push(first.toISOString().slice(0, 10));
  }
  const every = Math.max(1, Math.ceil((months.length * 44) / innerW));

  const nearest = (clientX: number) => {
    const left = box.current!.getBoundingClientRect().left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - (clientX - left)) < Math.abs(x(points[best].date) - (clientX - left))) best = i;
    });
    return best;
  };
  const shown = active === null ? null : points[active];
  const prev = active ? points[active - 1] : null;
  const first = points[0];
  const last = points.at(-1)!;

  return (
    <div ref={box} className="relative w-full select-none">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}: ${baseline ? `baseline ${baseline.value} ${unit}, ` : ""}${first.value} ${unit} on ${short(first.date)} to ${last.value} ${unit} on ${short(last.date)}`}
          className="touch-pan-y overflow-visible"
          onPointerMove={(e) => setActive(nearest(e.clientX))}
          onPointerDown={(e) => setActive(nearest(e.clientX))}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        >
          {ticks(lo, hi).map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          {months.map((m, i) =>
            i % every === 0 ? (
              <text key={m} x={x(m)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {short(m, { month: "short" })}
              </text>
            ) : null,
          )}
          {baseline && (
            <g>
              <line x1={M.left} x2={width - M.right} y1={y(baseline.value)} y2={y(baseline.value)} className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={width - M.right} y={y(baseline.value) - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
                Baseline {baseline.value} {unit}
              </text>
            </g>
          )}
          <g className={colour}>
            <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle
                key={p.date}
                cx={x(p.date)}
                cy={y(p.value)}
                r={i === active ? 6 : points.length > 40 && i !== points.length - 1 ? 0 : 4}
                fill="currentColor"
                className="stroke-card"
                strokeWidth={2}
              />
            ))}
            {shown && <line x1={x(shown.date)} x2={x(shown.date)} y1={M.top} y2={height - M.bottom} stroke="currentColor" strokeWidth={1} strokeOpacity={0.4} />}
          </g>
        </svg>
      )}
      {shown && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 w-56 rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
          style={{ left: Math.min(Math.max(x(shown.date) - 112, 0), Math.max(width - 224, 0)) }}
        >
          <p className="text-xs text-muted-foreground">
            {per === "week" ? "Week ending " : ""}
            {short(shown.date, { ...(per === "day" && { weekday: "short" }), day: "numeric", month: "short", year: "numeric" })}
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {shown.value} {unit}
            {prev && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {shown.value - prev.value > 0 ? "+" : shown.value === prev.value ? "±" : "−"}
                {Math.abs(Math.round((shown.value - prev.value) * 10) / 10)} on the {per} before
              </span>
            )}
          </p>
          {shown.detail.map((d) => (
            <p key={d} className="text-xs text-muted-foreground">
              {d}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
