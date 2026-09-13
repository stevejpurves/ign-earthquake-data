import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuakePoint } from "./TimelineChart";

const DAY = 86_400_000;
const MARGIN = { top: 8, right: 16, bottom: 30, left: 48 };
const HEIGHT = 220;

// Ordinal one-hue ramp (sequential blue steps): magnitude is ordered, so the
// buckets step light → dark with magnitude. Steps chosen within the ramp's
// ordinal bounds for each surface (lightest ≥ 2:1 on light; darkest ≥ 2:1 on
// dark).
const BUCKETS = [
  { label: "M < 1", light: "#86b6ef", dark: "#9ec5f4" },
  { label: "M 1–2", light: "#5598e7", dark: "#6da7ec" },
  { label: "M 2–3", light: "#2a78d6", dark: "#3987e5" },
  { label: "M ≥ 3", light: "#184f95", dark: "#184f95" },
] as const;

const CHROME = {
  light: { surface: "#fcfcfb", grid: "#e1e0d9", axis: "#c3c2b7", muted: "#898781", ink: "#0b0b0b" },
  dark: { surface: "#1a1a19", grid: "#2c2c2a", axis: "#383835", muted: "#898781", ink: "#ffffff" },
};

function bucketOf(m: number | null): number | null {
  if (m === null) return null;
  if (m < 1) return 0;
  if (m < 2) return 1;
  if (m < 3) return 2;
  return 3;
}

function niceLinearTicks(max: number, count: number): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((s) => s * pow).find((s) => s >= rough) ?? pow;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

function niceTimeTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const step = span / count;
  const units = [DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 61 * DAY, 91 * DAY, 182 * DAY, 365 * DAY];
  const unit = units.find((u) => u >= step) ?? 365 * DAY;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / unit) * unit; t <= max; t += unit) ticks.push(t);
  return ticks;
}

const fmtDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

interface DayBin {
  day: number; // UTC day start (ms)
  counts: [number, number, number, number];
  total: number;
}

export function DailyCountChart({
  points,
  xDomain,
}: {
  points: QuakePoint[];
  xDomain: { tMin: number; tMax: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [dark, setDark] = useState(false);
  const [hover, setHover] = useState<{ bin: DayBin; x: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bins = useMemo(() => {
    const map = new Map<number, DayBin>();
    for (const p of points) {
      const b = bucketOf(p.m);
      if (b === null) continue;
      const day = p.t - (p.t % DAY);
      let bin = map.get(day);
      if (!bin) {
        bin = { day, counts: [0, 0, 0, 0], total: 0 };
        map.set(day, bin);
      }
      bin.counts[b]++;
      bin.total++;
    }
    return map;
  }, [points]);

  const maxTotal = useMemo(() => {
    let m = 0;
    for (const bin of bins.values()) if (bin.total > m) m = bin.total;
    return m;
  }, [bins]);

  const scales = useMemo(() => {
    if (width === 0) return null;
    const w = width - MARGIN.left - MARGIN.right;
    const h = HEIGHT - MARGIN.top - MARGIN.bottom;
    const yMax = Math.max(1, maxTotal) * 1.05;
    const x = (t: number) =>
      MARGIN.left + ((t - xDomain.tMin) / (xDomain.tMax - xDomain.tMin)) * w;
    const y = (v: number) => MARGIN.top + h - (v / yMax) * h;
    return { x, y, w, h, yMax };
  }, [width, xDomain, maxTotal]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scales) return;
    const chrome = dark ? CHROME.dark : CHROME.light;
    const colors = BUCKETS.map((b) => (dark ? b.dark : b.light));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = chrome.surface;
    ctx.fillRect(0, 0, width, HEIGHT);
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';

    // Gridlines + y ticks
    for (const v of niceLinearTicks(scales.yMax, 4)) {
      const yy = scales.y(v);
      ctx.strokeStyle = chrome.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, yy);
      ctx.lineTo(width - MARGIN.right, yy);
      ctx.stroke();
      ctx.fillStyle = chrome.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(v), MARGIN.left - 8, yy);
    }

    // X ticks (same domain as the timeline above)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of niceTimeTicks(xDomain.tMin, xDomain.tMax, 7)) {
      const xx = scales.x(t);
      ctx.fillStyle = chrome.muted;
      ctx.fillText(fmtDate.format(t), xx, HEIGHT - MARGIN.bottom + 6);
    }

    // Baseline
    const baseY = scales.y(0);
    ctx.strokeStyle = chrome.axis;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, baseY);
    ctx.lineTo(width - MARGIN.right, baseY);
    ctx.stroke();

    // Stacked daily bars, lowest magnitude bucket at the baseline. Gaps only
    // when bars are wide enough to afford them.
    const dayW = scales.x(DAY) - scales.x(0);
    const gap = dayW >= 5 ? 2 : dayW >= 3 ? 1 : 0;
    const barW = Math.max(dayW - gap, Math.min(dayW, 1));
    // A 1px surface gap separates stacked segments when bars are wide enough.
    const segGap = gap >= 2 ? 1 : 0;
    for (const bin of bins.values()) {
      const x0 = scales.x(bin.day) + gap / 2;
      let yTop = baseY;
      for (let b = 0; b < 4; b++) {
        const c = bin.counts[b];
        if (c === 0) continue;
        const h = baseY - scales.y(c); // pixel height for this count
        const segTop = yTop - h;
        ctx.fillStyle = colors[b];
        ctx.fillRect(x0, segTop + segGap, barW, Math.max(h - segGap, 0.5));
        yTop = segTop;
      }
    }

    // Hovered day: hairline ink outline around the full stack
    if (hover) {
      const x0 = scales.x(hover.bin.day) + gap / 2;
      const top = scales.y(hover.bin.total);
      ctx.strokeStyle = chrome.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 0.5, top - 0.5, barW + 1, baseY - top + 1);
    }
  }, [scales, bins, dark, width, xDomain, hover]);

  useEffect(() => {
    draw();
  }, [draw]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!scales) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const t = xDomain.tMin + ((mx - MARGIN.left) / scales.w) * (xDomain.tMax - xDomain.tMin);
      const day = t - (t % DAY);
      const bin = bins.get(day);
      setHover(bin ? { bin, x: scales.x(day) } : null);
    },
    [scales, bins, xDomain],
  );

  if (points.length === 0) return null;

  const tooltipLeft = hover ? Math.min(Math.max(hover.x + 10, MARGIN.left), width - 210) : 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-[#52514e] dark:text-[#c3c2b7]">
        <span className="font-medium">Daily events by magnitude</span>
        {BUCKETS.map((b) => (
          <span key={b.label} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-[3px]"
              style={{ backgroundColor: dark ? b.dark : b.light }}
            />
            {b.label}
          </span>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: HEIGHT }}
        className="block cursor-crosshair rounded-lg border border-black/10 dark:border-white/10"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Stacked bar chart of daily earthquake counts, stacked by integer magnitude bucket."
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-48 rounded-md border border-black/10 bg-white/95 p-2.5 text-xs shadow-lg dark:border-white/10 dark:bg-[#262624]/95"
          style={{ left: tooltipLeft, top: 30 }}
        >
          <div className="font-medium text-[#0b0b0b] dark:text-white">
            {fmtDate.format(hover.bin.day)}
          </div>
          <dl className="mt-1 space-y-0.5 text-[#52514e] dark:text-[#c3c2b7]">
            {BUCKETS.map((b, i) =>
              hover.bin.counts[i] > 0 ? (
                <div key={b.label} className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2 rounded-[2px]"
                      style={{ backgroundColor: dark ? b.dark : b.light }}
                    />
                    {b.label}
                  </dt>
                  <dd className="tabular-nums">{hover.bin.counts[i]}</dd>
                </div>
              ) : null,
            )}
            <div className="flex justify-between border-t border-black/10 pt-0.5 dark:border-white/10">
              <dt>Total</dt>
              <dd className="tabular-nums">{hover.bin.total}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
